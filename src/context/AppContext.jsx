import { createContext, useContext, useReducer, useEffect, useRef } from 'react'
import {
  LS,
  listenSSE,
  apiLogin, apiAdminLogin, apiGetParticipant,
  apiSavePick, apiSaveResult, apiDeleteResult,
  apiSetKoMatch, apiDeleteKoMatch,
  apiUpdateParticipant, apiDeleteParticipant,
  apiSaveKickoffs, apiSaveScorerPick,
} from '@/lib/storage'
// apiSaveMatchMeta is called directly from Admin — no need to import here

const INIT = {
  ready:         false,
  poolName:      'World Cup 2026 Pool',
  user:          null,
  isAdmin:       false,
  participants:  [],
  myPicks:       {},
  allPicks:      {},
  results:       {},
  koMatches:     {},
  kickoffs:      {},
  lineups:       {},
  matchGoals:    {},
  matchMeta:     {},
  allScorer:     {},   // { email → { matchId_team → pick } }
  myScorer:      {},   // { matchId_team → pick }
  triviaState:   { questions: [], leaderboard: [], answers: [], impressions: [] },
}

function reducer(state, action) {
  switch (action.type) {
    case 'INIT':          return { ...state, ...action.payload, ready: true }
    case 'LOGIN':         return { ...state, user: action.user, isAdmin: action.isAdmin }
    case 'LOGOUT':        return { ...INIT, ready: true, poolName: state.poolName }
    case 'SET_PICKS':     return { ...state, myPicks: action.picks }
    case 'SET_ALL_PICKS': return { ...state, allPicks: action.picks }
    case 'SET_RESULTS':   return { ...state, results: action.results }
    case 'SET_KO':        return { ...state, koMatches: action.koMatches }
    case 'SET_PARTS':     return { ...state, participants: action.participants }
    case 'SET_KICKOFFS':  return { ...state, kickoffs: action.kickoffs }
    case 'SET_LINEUPS':   return { ...state, lineups: action.lineups }
    case 'SET_GOALS':     return { ...state, matchGoals: action.matchGoals }
    case 'SET_META':      return { ...state, matchMeta: action.matchMeta }
    case 'SET_SCORER': {
      const myScorer = action.scorerPicks[state.user?.email] || {}
      return { ...state, allScorer: action.scorerPicks, myScorer }
    }
    case 'SET_TRIVIA':    return { ...state, triviaState: action.triviaState }
    case 'PATCH_PICK':    return { ...state, myPicks: { ...state.myPicks, [action.matchId]: action.pick } }
    case 'PATCH_RESULT':  return { ...state, results: { ...state.results, [action.matchId]: action.result } }
    case 'DEL_RESULT': {
      const r = { ...state.results }; delete r[action.matchId]
      return { ...state, results: r }
    }
    case 'PATCH_KO': return { ...state, koMatches: { ...state.koMatches, [action.matchId]: action.km } }
    case 'DEL_KO': {
      const k = { ...state.koMatches }; delete k[action.matchId]
      return { ...state, koMatches: k }
    }
    default: return state
  }
}

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INIT)
  const unsubs = useRef([])

  // ── Boot — always server mode ─────────────────────────────────
  useEffect(() => {
    async function boot() {
      try {
        const { poolName } = await fetch('/api/config').then(r => r.json())
        dispatch({ type: 'INIT', payload: { poolName } })
      } catch {
        dispatch({ type: 'INIT', payload: {} })
      }
      const savedUser = LS.get('user')
      const savedPw   = LS.get('adminPw')
      if (savedUser) {
        const isAdmin = savedUser.email === '__admin__' && !!savedPw
        dispatch({ type: 'LOGIN', user: savedUser, isAdmin })
      }
    }
    boot()
  }, [])

  // ── SSE listener — attach after login ─────────────────────────
  useEffect(() => {
    if (!state.user || !state.ready) return
    unsubs.current.forEach(u => u())
    unsubs.current = [
      listenSSE({
        onParticipants: participants => dispatch({ type: 'SET_PARTS', participants }),
        onResults:      results      => dispatch({ type: 'SET_RESULTS', results }),
        onKoMatches:    koMatches    => dispatch({ type: 'SET_KO', koMatches }),
        onKickoffs:    kickoffs     => dispatch({ type: 'SET_KICKOFFS', kickoffs }),
        onLineups:     lineups      => dispatch({ type: 'SET_LINEUPS', lineups }),
        onMatchGoals:  matchGoals   => dispatch({ type: 'SET_GOALS', matchGoals }),
        onMatchMeta:   matchMeta    => dispatch({ type: 'SET_META', matchMeta }),
        onScorerPicks:      scorerPicks  => dispatch({ type: 'SET_SCORER', scorerPicks }),
        onTriviaState: triviaState => dispatch({ type: 'SET_TRIVIA', triviaState }),
        onPicks: picks => {
          dispatch({ type: 'SET_ALL_PICKS', picks })
          dispatch({ type: 'SET_PICKS', picks: picks[state.user.email] || {} })
        },
      }),
    ]
    return () => unsubs.current.forEach(u => u())
  }, [state.user, state.ready])

  // ── Actions ───────────────────────────────────────────────────
  async function login(name, email) {
    const { user: participant } = await apiLogin(name, email)
    const user = { name: participant.name, email: participant.email, userId: participant.user_id }
    LS.set('user', user)
    LS.set('isAdmin', false)
    dispatch({ type: 'LOGIN', user, isAdmin: false })
  }

  async function loginByEmail(email) {
    const participant = await apiGetParticipant(email) // throws 404 if not registered
    const user = { name: participant.name, email: participant.email, userId: participant.user_id }
    LS.set('user', user)
    LS.set('isAdmin', false)
    dispatch({ type: 'LOGIN', user, isAdmin: false })
  }

  async function adminLogin(password) {
    await apiAdminLogin(password)
    const user = { name: 'Admin', email: '__admin__' }
    LS.set('user', user)
    LS.set('isAdmin', true)
    LS.set('adminPw', password)
    dispatch({ type: 'LOGIN', user, isAdmin: true })
  }

  function logout() {
    LS.del('user'); LS.del('isAdmin'); LS.del('adminPw')
    dispatch({ type: 'LOGOUT' })
  }

  async function savePick(matchId, home, away, winner = null) {
    if (!state.user || state.isAdmin) return
    const kickoff = state.kickoffs[matchId]
    if (kickoff && Date.now() >= new Date(kickoff).getTime()) {
      throw new Error('Picks are locked — this match has already kicked off')
    }
    const pick = { matchId, email: state.user.email, home, away, winner, ts: Date.now() }
    dispatch({ type: 'PATCH_PICK', matchId, pick })
    await apiSavePick(state.user.email, matchId, home, away, winner)
  }

  async function saveResult(matchId, home, away, winner = null, homePens = null, awayPens = null) {
    const result = { matchId, home, away, winner, homePens, awayPens, ts: Date.now() }
    dispatch({ type: 'PATCH_RESULT', matchId, result })
    await apiSaveResult(matchId, home, away, winner, homePens, awayPens)
  }

  async function clearResult(matchId) {
    dispatch({ type: 'DEL_RESULT', matchId })
    await apiDeleteResult(matchId)
  }

  async function setKoMatch(matchId, home, away) {
    const km = { matchId, home, away, ts: Date.now() }
    dispatch({ type: 'PATCH_KO', matchId, km })
    await apiSetKoMatch(matchId, home, away)
  }

  async function clearKoMatch(matchId) {
    dispatch({ type: 'DEL_KO', matchId })
    await apiDeleteKoMatch(matchId)
  }

  async function updateParticipant(email, updates) {
    await apiUpdateParticipant(email, updates)
  }

  async function deleteParticipant(email) {
    await apiDeleteParticipant(email)
  }

  async function adminSavePick(email, matchId, home, away, winner = null) {
    await apiSavePick(email, matchId, home, away, winner)
    const pick = { matchId, email, home, away, winner, ts: Date.now() }
    dispatch({ type: 'SET_ALL_PICKS', picks: {
      ...state.allPicks,
      [email]: { ...(state.allPicks[email] || {}), [matchId]: pick },
    }})
  }

  async function saveKickoffs(map) {
    await apiSaveKickoffs(map)
  }

  async function saveScorerPick(matchId, team, playerId, playerName) {
    if (!state.user || state.isAdmin) return
    const kickoff = state.kickoffs[matchId]
    if (kickoff && Date.now() >= new Date(kickoff).getTime()) {
      throw new Error('Scorer picks locked — match has already kicked off')
    }
    await apiSaveScorerPick(state.user.email, matchId, team, playerId, playerName)
  }

  const value = {
    ...state,
    login, loginByEmail, adminLogin, logout,
    savePick, saveResult, clearResult,
    setKoMatch, clearKoMatch,
    saveKickoffs, saveScorerPick,
    updateParticipant, deleteParticipant, adminSavePick,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
