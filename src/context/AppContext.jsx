import { createContext, useContext, useReducer, useEffect, useRef } from 'react'
import {
  LS, dbSet, dbDelete,
  listenSSE,
  apiLogin, apiAdminLogin,
  apiSavePick, apiSaveResult, apiDeleteResult,
  apiSetKoMatch, apiDeleteKoMatch,
  apiUpdateParticipant, apiDeleteParticipant,
} from '@/lib/storage'

// ── Initial state ─────────────────────────────────────────────
const INIT = {
  ready:        false,
  mode:         null,    // 'server' | 'local'
  adminPassword: '',     // local mode only
  poolName:     'World Cup 2026 Pool',
  user:         null,
  isAdmin:      false,
  participants: [],
  myPicks:      {},
  allPicks:     {},
  results:      {},
  koMatches:    {},
  kickoffs:     {},
}

// ── Reducer ───────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case 'INIT':          return { ...state, ...action.payload, ready: true }
    case 'LOGIN':         return { ...state, user: action.user, isAdmin: action.isAdmin }
    case 'LOGOUT':        return { ...INIT, ready: true, mode: state.mode, adminPassword: state.adminPassword, poolName: state.poolName }
    case 'SET_PICKS':     return { ...state, myPicks: action.picks }
    case 'SET_ALL_PICKS': return { ...state, allPicks: action.picks }
    case 'SET_RESULTS':   return { ...state, results: action.results }
    case 'SET_KO':        return { ...state, koMatches: action.koMatches }
    case 'SET_PARTS':     return { ...state, participants: action.participants }
    case 'SET_KICKOFFS':  return { ...state, kickoffs: { ...state.kickoffs, ...action.kickoffs } }
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

// ── Context ───────────────────────────────────────────────────
const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INIT)
  const unsubs = useRef([])

  // ── Boot ─────────────────────────────────────────────────────
  useEffect(() => {
    async function boot() {
      const cfg = LS.get('config')
      if (!cfg?.v) { dispatch({ type: 'INIT', payload: { ready: true } }); return }

      const kickoffs = LS.get('kickoffs') || {}

      if (cfg.mode === 'server') {
        try {
          const { poolName } = await fetch('/api/config').then(r => r.json())
          dispatch({ type: 'INIT', payload: { mode: 'server', poolName, kickoffs, ready: true } })
        } catch {
          dispatch({ type: 'INIT', payload: { mode: 'server', poolName: cfg.poolName, kickoffs, ready: true } })
        }

        const savedUser  = LS.get('user')
        const savedAdmin = LS.get('isAdmin')
        if (savedUser) dispatch({ type: 'LOGIN', user: savedUser, isAdmin: !!savedAdmin })

      } else {
        // local mode — unchanged
        dispatch({
          type: 'INIT',
          payload: { mode: 'local', adminPassword: cfg.adminPassword, poolName: cfg.poolName, kickoffs, ready: true },
        })
        const savedUser  = LS.get('user')
        const savedAdmin = LS.get('isAdmin')
        if (savedUser) dispatch({ type: 'LOGIN', user: savedUser, isAdmin: !!savedAdmin })
      }
    }
    boot()
  }, [])

  // ── Attach data listeners after login ─────────────────────────
  useEffect(() => {
    if (!state.user || !state.ready) return
    unsubs.current.forEach(u => u())
    unsubs.current = []

    if (state.mode === 'server') {
      unsubs.current.push(
        listenSSE({
          onParticipants: participants => dispatch({ type: 'SET_PARTS', participants }),
          onResults:      results      => dispatch({ type: 'SET_RESULTS', results }),
          onKoMatches:    koMatches    => dispatch({ type: 'SET_KO', koMatches }),
          onPicks:        picks => {
            dispatch({ type: 'SET_ALL_PICKS', picks })
            dispatch({ type: 'SET_PICKS', picks: picks[state.user.email] || {} })
          },
        })
      )
    } else {
      // local mode
      const ap = LS.get('picks') || {}
      dispatch({ type: 'SET_PICKS',    picks: ap[state.user?.email] || {} })
      dispatch({ type: 'SET_ALL_PICKS', picks: ap })
      dispatch({ type: 'SET_RESULTS',  results: LS.get('results') || {} })
      dispatch({ type: 'SET_KO',       koMatches: LS.get('ko_matches') || {} })
      dispatch({ type: 'SET_PARTS',    participants: Object.values(LS.get('participants') || {}) })
    }

    return () => unsubs.current.forEach(u => u())
  }, [state.user, state.mode, state.ready])

  // ── Actions ───────────────────────────────────────────────────
  async function saveConfig({ mode, poolName, adminPassword }) {
    const cfg = { v: 1, mode, poolName, adminPassword }
    LS.set('config', cfg)
    dispatch({ type: 'INIT', payload: { mode, poolName, adminPassword, ready: true } })
  }

  async function login(name, email) {
    const user = { name, email: email.toLowerCase() }
    if (state.mode === 'server') {
      await apiLogin(name, email)
    } else {
      const ps = LS.get('participants') || {}
      ps[user.email] = { ...user, joinedAt: Date.now() }
      LS.set('participants', ps)
      dispatch({ type: 'SET_PARTS', participants: Object.values(ps) })
      await dbSet('participants', user.email, { ...user, joinedAt: Date.now() })
    }
    LS.set('user', user); LS.set('isAdmin', false)
    dispatch({ type: 'LOGIN', user, isAdmin: false })
  }

  async function adminLogin(password) {
    if (state.mode === 'server') {
      await apiAdminLogin(password) // throws on wrong password
      LS.set('adminPw', password)
    } else {
      if (password !== state.adminPassword) throw new Error('Wrong password')
    }
    const user = { name: 'Admin', email: '__admin__' }
    LS.set('user', user); LS.set('isAdmin', true)
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

    if (state.mode === 'server') {
      await apiSavePick(state.user.email, matchId, home, away, winner)
    } else {
      await dbSet('picks', `${state.user.email}_${matchId}`, pick)
      const ap = LS.get('picks') || {}
      if (!ap[state.user.email]) ap[state.user.email] = {}
      ap[state.user.email][matchId] = pick
      LS.set('picks', ap)
      dispatch({ type: 'SET_ALL_PICKS', picks: { ...state.allPicks, [state.user.email]: { ...(state.allPicks[state.user.email] || {}), [matchId]: pick } } })
    }
  }

  async function saveResult(matchId, home, away, winner = null) {
    const result = { matchId, home, away, winner, ts: Date.now() }
    dispatch({ type: 'PATCH_RESULT', matchId, result })
    if (state.mode === 'server') {
      await apiSaveResult(matchId, home, away, winner)
    } else {
      await dbSet('results', matchId, result)
      LS.set('results', { ...state.results, [matchId]: result })
    }
  }

  async function clearResult(matchId) {
    dispatch({ type: 'DEL_RESULT', matchId })
    if (state.mode === 'server') {
      await apiDeleteResult(matchId)
    } else {
      await dbDelete('results', matchId)
      const r = { ...state.results }; delete r[matchId]; LS.set('results', r)
    }
  }

  async function setKoMatch(matchId, home, away) {
    const km = { matchId, home, away, ts: Date.now() }
    dispatch({ type: 'PATCH_KO', matchId, km })
    if (state.mode === 'server') {
      await apiSetKoMatch(matchId, home, away)
    } else {
      await dbSet('ko_matches', matchId, km)
      LS.set('ko_matches', { ...state.koMatches, [matchId]: km })
    }
  }

  async function clearKoMatch(matchId) {
    dispatch({ type: 'DEL_KO', matchId })
    if (state.mode === 'server') {
      await apiDeleteKoMatch(matchId)
    } else {
      await dbDelete('ko_matches', matchId)
      const k = { ...state.koMatches }; delete k[matchId]; LS.set('ko_matches', k)
    }
  }

  async function updateParticipant(email, updates) {
    if (state.mode === 'server') {
      await apiUpdateParticipant(email, updates)
    } else {
      const ps = LS.get('participants') || {}
      ps[email] = { ...ps[email], ...updates }
      LS.set('participants', ps)
      dispatch({ type: 'SET_PARTS', participants: Object.values(ps) })
    }
  }

  async function deleteParticipant(email) {
    if (state.mode === 'server') {
      await apiDeleteParticipant(email)
    } else {
      const picks = state.allPicks[email] || {}
      for (const matchId of Object.keys(picks)) await dbDelete('picks', `${email}_${matchId}`)
      await dbDelete('participants', email)
      const ps = LS.get('participants') || {}; delete ps[email]; LS.set('participants', ps)
      const ap = LS.get('picks') || {}; delete ap[email]; LS.set('picks', ap)
      const newAllPicks = { ...state.allPicks }; delete newAllPicks[email]
      dispatch({ type: 'SET_PARTS', participants: Object.values(ps) })
      dispatch({ type: 'SET_ALL_PICKS', picks: newAllPicks })
    }
  }

  async function adminSavePick(email, matchId, home, away, winner = null) {
    const pick = { matchId, email, home, away, winner, ts: Date.now() }
    if (state.mode === 'server') {
      await apiSavePick(email, matchId, home, away, winner)
    } else {
      await dbSet('picks', `${email}_${matchId}`, pick)
      const ap = LS.get('picks') || {}
      if (!ap[email]) ap[email] = {}
      ap[email][matchId] = pick
      LS.set('picks', ap)
      const newAllPicks = { ...state.allPicks, [email]: { ...(state.allPicks[email] || {}), [matchId]: pick } }
      dispatch({ type: 'SET_ALL_PICKS', picks: newAllPicks })
    }
  }

  function saveKickoffs(map) {
    const merged = { ...state.kickoffs, ...map }
    LS.set('kickoffs', merged)
    dispatch({ type: 'SET_KICKOFFS', kickoffs: map })
  }

  function importPicks(json) {
    const data = JSON.parse(json)
    if (!data.email || !data.picks) throw new Error('Invalid format')
    const ap = LS.get('picks') || {}
    ap[data.email] = data.picks
    LS.set('picks', ap)
    dispatch({ type: 'SET_ALL_PICKS', picks: ap })
    if (!state.participants.find(p => p.email === data.email)) {
      const ps = LS.get('participants') || {}
      ps[data.email] = { name: data.name || data.email, email: data.email }
      LS.set('participants', ps)
      dispatch({ type: 'SET_PARTS', participants: Object.values(ps) })
    }
  }

  const value = {
    ...state,
    saveConfig, login, adminLogin, logout,
    savePick, saveResult, clearResult,
    setKoMatch, clearKoMatch, importPicks,
    saveKickoffs,
    updateParticipant, deleteParticipant, adminSavePick,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
