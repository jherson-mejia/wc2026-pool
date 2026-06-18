/**
 * Auto-sync scheduler — football-data.org (30 req/min plan).
 *
 * Strategy:
 *   - At kickoff time for each match: run a full sync, then start 30-second live poller.
 *   - Live poller fetches only IN_PLAY/PAUSED matches every 30s.
 *   - When no live matches remain: final full sync, then poller stops.
 *   - Lineup fetches: one call per match at T-55min.
 *   - Replans at UTC midnight. Immediate sync if any match kicked off today on startup.
 */

import { GROUP_MATCHES } from '../src/data/worldcup.js'

const KO_STAGE_SLUG = { LAST_32: 'r32', LAST_16: 'r16', QUARTER_FINALS: 'qf', SEMI_FINALS: 'sf', THIRD_PLACE: 'tp', FINAL: 'final' }
const FD_BASE       = 'https://api.football-data.org/v4'
const POST_MATCH_RETRY_MS = [2, 5, 10, 30, 60].map(m => m * 60_000)
const LIVE_WINDOW_MS      = 3.5 * 60 * 60 * 1000  // keep polling until ~3.5h after kickoff
const LIVE_POLL_MS        = 30_000
const EMPTY_LIVE_POLLS_BEFORE_FINALIZE = 2

const TEAM_NAME_MAP = {
  'Korea Republic':               'South Korea',
  "Côte d'Ivoire":                'Ivory Coast',
  'Ivory Coast':                  'Ivory Coast',
  'Türkiye':                      'Turkey',
  'Bosnia-Herzegovina':           'Bosnia and Herzegovina',
  'Cabo Verde':                   'Cape Verde',
  'Cape Verde Islands':           'Cape Verde',
  'Congo DR':                     'DR Congo',
  'Democratic Republic of Congo': 'DR Congo',
  'USA':                          'United States',
  'United States of America':     'United States',
  'Czech Republic':               'Czech Republic',
  'Czechia':                      'Czech Republic',
  'IR Iran':                      'Iran',
  'Curacao':                      'Curaçao',
}

const normalize  = n => TEAM_NAME_MAP[n] ?? n
const parseGroup = g => g?.startsWith('GROUP_') ? g.replace('GROUP_', '') : null

function findGroupMatch(home, away, group, matchday) {
  return GROUP_MATCHES.find(g =>
    (g.home === home && g.away === away || g.home === away && g.away === home) &&
    (!group    || g.group    === group) &&
    (!matchday || g.matchday === matchday)
  )
}

/** Best available score from an FD match — fullTime first, else count goals by team id. */
function readMatchScore(m) {
  const ft = m.score?.fullTime
  if (ft?.home != null && ft?.away != null) return { home: ft.home, away: ft.away }

  const homeId = m.homeTeam?.id
  const awayId = m.awayTeam?.id
  if (!Array.isArray(m.goals) || !m.goals.length || homeId == null || awayId == null) {
    return { home: null, away: null }
  }
  let home = 0
  let away = 0
  for (const g of m.goals) {
    if (g.team?.id === homeId) home++
    else if (g.team?.id === awayId) away++
  }
  return { home, away }
}

// Single fetch helper — replaces 4 former dedicated fetch functions
async function fdFetch(apiKey, url) {
  const ctrl    = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(url, { headers: { 'X-Auth-Token': apiKey }, signal: ctrl.signal })
    clearTimeout(timeout)
    if (res.status === 429) throw new Error('rate-limited')
    if (!res.ok) throw new Error(`FD API ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timeout)
  }
}

export function startScheduler({ supabase, broadcast, apiKey }) {
  if (!apiKey) {
    console.log('[scheduler] FD_API_KEY not set — auto-sync disabled')
    return null
  }

  let syncing         = false   // mutex: prevents concurrent runSync calls
  let timers          = []
  let postMatchTimers = []
  let lastSync        = null
  let nextSync        = null
  let todayPlan       = []
  let liveScores      = {}
  let livePollerTimer = null
  let livePolling     = false
  let emptyLiveStreak = 0

  function clearTimers() {
    timers.forEach(t => clearTimeout(t))
    timers = []
    postMatchTimers.forEach(t => clearTimeout(t))
    postMatchTimers = []
  }

  async function broadcastAllResults() {
    const { data: allResults } = await supabase.from('results').select('*')
    const resultMap = {}
    for (const r of allResults ?? []) {
      resultMap[r.match_id] = { matchId: r.match_id, home: r.home, away: r.away, winner: r.winner, ts: r.ts }
    }
    broadcast('results', resultMap)
  }

  function removeFromLive(matchIds) {
    let changed = false
    for (const id of matchIds) {
      if (liveScores[id]) {
        delete liveScores[id]
        changed = true
      }
    }
    if (!changed) return
    broadcast('live_scores', liveScores)
    persistLiveScores().catch(e => console.warn('[scheduler] live_scores persist failed:', e.message))
  }

  /** Write provisional results from live snapshot when the API has not marked FINISHED yet. */
  async function promoteLiveToResults(liveSnapshot) {
    const matchIds = Object.keys(liveSnapshot)
    if (!matchIds.length) return []

    const { data: existing } = await supabase.from('results').select('match_id, home, away').in('match_id', matchIds)
    const have = new Set(
      (existing ?? []).filter(r => r.home != null && r.away != null).map(r => r.match_id),
    )

    const toUpsert = []
    for (const [matchId, live] of Object.entries(liveSnapshot)) {
      if (have.has(matchId)) continue
      if (live.homeScore == null || live.awayScore == null) continue
      toUpsert.push({
        match_id:  matchId,
        home:      live.homeScore,
        away:      live.awayScore,
        winner:    null,
        home_pens: null,
        away_pens: null,
        ts:        Date.now(),
      })
    }
    if (!toUpsert.length) return []

    const { error } = await supabase.from('results').upsert(toUpsert, { onConflict: 'match_id' })
    if (error) throw new Error(error.message)
    console.log(`[scheduler] Promoted ${toUpsert.length} live score(s) to results (API lag fallback)`)
    await broadcastAllResults()
    return toUpsert.map(r => r.match_id)
  }

  function schedulePostMatchRetries(matchIds) {
    postMatchTimers.forEach(t => clearTimeout(t))
    postMatchTimers = []
    if (!matchIds.length) return

    for (const delay of POST_MATCH_RETRY_MS) {
      postMatchTimers.push(setTimeout(() => {
        runSync(`post-match-retry-${delay}`).catch(err =>
          console.warn('[scheduler] Post-match retry failed:', err.message),
        )
      }, delay))
    }
  }

  async function finalizeEndedMatches(liveSnapshot) {
    const matchIds = Object.keys(liveSnapshot)
    console.log(`[scheduler] Finalizing ${matchIds.length} ended match(es)`)

    await runSync('post-match')
    const promoted = await promoteLiveToResults(liveSnapshot)

    if (matchIds.length) {
      const { data: results } = await supabase.from('results').select('match_id').in('match_id', matchIds)
      const settled = [...new Set([...(results ?? []).map(r => r.match_id), ...promoted])]
      removeFromLive(settled)

      const pending = matchIds.filter(id => !settled.includes(id))
      if (pending.length) {
        console.warn(`[scheduler] Still no results row for: ${pending.join(', ')} — keeping live until retry`)
      }
    }

    schedulePostMatchRetries(matchIds)
  }

  /** Kickoff passed, within live window, and no final result in DB yet. */
  async function getMatchesInLiveWindow() {
    const now = Date.now()
    const [{ data: kickoffs }, { data: results }] = await Promise.all([
      supabase.from('kickoffs').select('match_id, kickoff'),
      supabase.from('results').select('match_id, home, away'),
    ])
    const settled = new Set(
      (results ?? []).filter(r => r.home != null && r.away != null).map(r => r.match_id),
    )
    return (kickoffs ?? []).filter(k => {
      const ko = new Date(k.kickoff).getTime()
      return ko <= now && now - ko < LIVE_WINDOW_MS && !settled.has(k.match_id)
    }).map(k => k.match_id)
  }

  async function shouldKeepLivePolling() {
    if (Object.keys(liveScores).length > 0) return true
    return (await getMatchesInLiveWindow()).length > 0
  }

  function scheduleLivePoll(delay = LIVE_POLL_MS) {
    if (livePollerTimer) return
    livePollerTimer = setTimeout(() => {
      livePollerTimer = null
      runLivePoll()
    }, delay)
  }

  async function ensureLivePoller() {
    if (await shouldKeepLivePolling()) startLivePoller()
  }

  // ── Live score DB persistence ─────────────────────────────────
  async function persistLiveScores() {
    const rows = Object.values(liveScores).map(m => ({
      match_id:    m.matchId,
      home:        m.home,
      away:        m.away,
      home_score:  m.homeScore,
      away_score:  m.awayScore,
      status:      m.status,
      minute:      m.minute     ?? null,
      injury_time: m.injuryTime ?? null,
      goals:       m.goals      ?? [],
      updated_at:  m.updatedAt,
    }))
    const activeIds = rows.map(r => r.match_id)
    await Promise.all([
      rows.length > 0
        ? supabase.from('live_scores').upsert(rows, { onConflict: 'match_id' })
        : Promise.resolve(),
      activeIds.length > 0
        ? supabase.from('live_scores').delete().not('match_id', 'in', `(${activeIds.join(',')})`)
        : supabase.from('live_scores').delete().not('match_id', 'is', null),
    ])
  }

  // ── Goals broadcast helper ────────────────────────────────────
  async function broadcastGoals() {
    const { data: allGoals } = await supabase.from('match_goals').select('*')
    const goalsMap = {}
    for (const g of allGoals ?? [])
      goalsMap[g.match_id] = { matchId: g.match_id, homeTeamId: g.home_team_id, awayTeamId: g.away_team_id, goals: g.goals ?? [] }
    broadcast('match_goals', goalsMap)
  }

  // ── Lineup fetch with backoff retries ────────────────────────
  // Offsets = minutes before kickoff to attempt. First call uses all offsets;
  // on each empty response the next offset is scheduled automatically.
  async function runLineupFetch(poolMatchId, fdMatchId, kickoffMs = null) {
    console.log(`[scheduler] Lineup fetch for ${poolMatchId} (FD: ${fdMatchId})`)
    try {
      const match = await fdFetch(apiKey, `${FD_BASE}/matches/${fdMatchId}`)

      const toPlayers = arr => (arr ?? []).map(p => ({
        id: p.id, name: p.name, position: p.position ?? null, shirtNumber: p.shirtNumber ?? null,
      }))

      // Determine pool home team to detect when FD's home/away is reversed
      const fdHomeName = normalize(match.homeTeam?.name ?? '')
      let poolHome = GROUP_MATCHES.find(g => g.id === poolMatchId)?.home ?? null
      if (!poolHome) {
        const { data: km } = await supabase.from('ko_matches').select('home').eq('id', poolMatchId).single()
        poolHome = km?.home ?? null
      }
      const swapped = poolHome != null && fdHomeName !== poolHome
      const poolHomeTeam = swapped ? match.awayTeam : match.homeTeam
      const poolAwayTeam = swapped ? match.homeTeam : match.awayTeam

      const homeLineup = toPlayers(poolHomeTeam?.lineup)
      const awayLineup = toPlayers(poolAwayTeam?.lineup)
      const hasLineup  = homeLineup.length > 0 || awayLineup.length > 0

      // Always save meta (venue/referee/odds available before lineup)
      const referee = match.referees?.find(r => r.type === 'REFEREE')?.name ?? null
      await supabase.from('match_meta').upsert({
        match_id:  poolMatchId,
        venue:     match.venue    ?? null,
        referee,
        odds_home: match.odds?.homeWin ?? null,
        odds_draw: match.odds?.draw    ?? null,
        odds_away: match.odds?.awayWin ?? null,
        ts: Date.now(),
      }, { onConflict: 'match_id' })

      if (!hasLineup) {
        if (kickoffMs && Date.now() < kickoffMs) {
          console.log(`[scheduler] No lineup yet for ${poolMatchId} — retry in 30s`)
          timers.push(setTimeout(() => runLineupFetch(poolMatchId, fdMatchId, kickoffMs), 30_000))
        } else {
          console.warn(`[scheduler] No lineup for ${poolMatchId} — kickoff reached, giving up`)
        }
        return
      }

      const row = {
        match_id:     poolMatchId,
        home_team_id: poolHomeTeam?.id ?? null,
        away_team_id: poolAwayTeam?.id ?? null,
        home_lineup:  homeLineup,
        home_bench:   toPlayers(poolHomeTeam?.bench),
        away_lineup:  awayLineup,
        away_bench:   toPlayers(poolAwayTeam?.bench),
        fetched_at:   Date.now(),
      }

      const { error } = await supabase.from('lineups').upsert(row, { onConflict: 'match_id' })
      if (error) throw new Error(error.message)

      const [{ data: allLineups }, { data: allMeta }] = await Promise.all([
        supabase.from('lineups').select('*'),
        supabase.from('match_meta').select('*'),
      ])
      const lineupsMap = {}
      for (const l of allLineups ?? []) lineupsMap[l.match_id] = rowToLineup(l)
      broadcast('lineups', lineupsMap)

      const metaMap = {}
      for (const m of allMeta ?? []) {
        metaMap[m.match_id] = {
          matchId:  m.match_id,
          venue:    m.venue    ?? null,
          referee:  m.referee  ?? null,
          oddsHome: m.odds_home ?? null,
          oddsDraw: m.odds_draw ?? null,
          oddsAway: m.odds_away ?? null,
        }
      }
      broadcast('match_meta', metaMap)
      console.log(`[scheduler] Lineup + meta saved for ${poolMatchId}`)
    } catch (err) {
      console.error(`[scheduler] Lineup fetch error for ${poolMatchId}:`, err.message)
    }
  }

  function rowToLineup(l) {
    return {
      matchId:    l.match_id,
      homeTeamId: l.home_team_id,
      awayTeamId: l.away_team_id,
      homeLineup: l.home_lineup ?? [],
      homeBench:  l.home_bench  ?? [],
      awayLineup: l.away_lineup ?? [],
      awayBench:  l.away_bench  ?? [],
      fetchedAt:  l.fetched_at,
    }
  }

  // ── Shared: map API matches → DB rows + newLive ───────────────
  function buildMatchPayloads(apiMatches, fdIdToMatchId) {
    const toUpsert      = []
    const goalsToUpsert = []
    const newLive       = {}

    for (const m of apiMatches) {
      const home     = normalize(m.homeTeam?.name ?? '')
      const away     = normalize(m.awayTeam?.name ?? '')
      const grp      = parseGroup(m.group)
      const matchday = m.matchday ?? null

      let matchId = null
      if (m.stage === 'GROUP_STAGE') {
        const gm = findGroupMatch(home, away, grp, matchday)
        if (gm) matchId = gm.id
      } else {
        matchId = fdIdToMatchId[m.id] ?? null
        // B6: warn when a KO match is missing from fd_match_ids
        if (!matchId) {
          console.warn(`[scheduler] KO match FD#${m.id} (${home} vs ${away}, ${m.stage}) not in fd_match_ids — run Sync Schedule`)
        }
      }
      if (!matchId) {
        if (m.status === 'IN_PLAY' || m.status === 'PAUSED') {
          console.warn(`[scheduler] Live match not mapped to pool ID: ${home} vs ${away} (${m.stage}, FD#${m.id})`)
        }
        continue
      }

      const { home: h, away: a } = readMatchScore(m)
      const elapsedMin = m.utcDate
        ? Math.floor((Date.now() - new Date(m.utcDate).getTime()) / 60000)
        : 999
      const trulyFinished = m.status === 'FINISHED' && elapsedMin >= 85

      // B1/B2: mutually exclusive — live block OR finished block, never both
      if (!trulyFinished && (m.status === 'IN_PLAY' || m.status === 'PAUSED')) {
        newLive[matchId] = {
          matchId, home, away,
          homeScore:  h ?? 0,
          awayScore:  a ?? 0,
          status:     m.status,
          minute:     m.minute     ?? null,
          injuryTime: m.injuryTime ?? null,
          goals: (m.goals ?? []).map(g => ({
            minute:     g.minute,
            scorerName: g.scorer?.name ?? null,
            scorerId:   g.scorer?.id   ?? null,
            teamId:     g.team?.id     ?? null,
          })),
          updatedAt: Date.now(),
        }
        if (h != null && a != null)
          toUpsert.push({ match_id: matchId, home: h, away: a, winner: null, home_pens: null, away_pens: null, ts: Date.now() })
      } else if (trulyFinished && h != null && a != null) {
        // Group-stage draws correctly produce winner: null
        const w      = m.score?.winner
        const winner = m.stage !== 'GROUP_STAGE'
          ? (w === 'HOME_TEAM' ? 'home' : w === 'AWAY_TEAM' ? 'away' : null)
          : null
        const hp = m.score?.penalties?.home ?? null
        const ap = m.score?.penalties?.away ?? null
        toUpsert.push({ match_id: matchId, home: h, away: a, winner, home_pens: hp, away_pens: ap, ts: Date.now() })
      }

      // Only push when goals are non-empty — prevents overwriting synced data with []
      if (Array.isArray(m.goals) && m.goals.length > 0) {
        goalsToUpsert.push({
          match_id:     matchId,
          home_team_id: m.homeTeam?.id ?? null,
          away_team_id: m.awayTeam?.id ?? null,
          goals: m.goals.map(g => ({
            minute:      g.minute,
            scorer_id:   g.scorer?.id   ?? null,
            scorer_name: g.scorer?.name ?? null,
            team_id:     g.team?.id     ?? null,
          })),
          ts: Date.now(),
        })
      }
    }
    return { newLive, toUpsert, goalsToUpsert }
  }

  // ── Shared: persist + broadcast results/goals/live ────────────
  async function applyAndBroadcast({ newLive, toUpsert, goalsToUpsert }, replaceLive = true) {
    if (replaceLive) {
      liveScores = newLive
      broadcast('live_scores', liveScores)
    } else if (Object.keys(newLive).length > 0) {
      liveScores = { ...liveScores, ...newLive }
      for (const mid of Object.keys(liveScores)) {
        if (!newLive[mid]) delete liveScores[mid]
      }
      broadcast('live_scores', liveScores)
    }
    persistLiveScores().catch(e => console.warn('[scheduler] live_scores persist failed:', e.message))

    if (toUpsert.length > 0) {
      // Preserve admin-set winner for KO matches currently IN_PLAY (live push has winner: null)
      const nullWinnerIds = toUpsert.filter(r => r.winner === null).map(r => r.match_id)
      if (nullWinnerIds.length > 0) {
        const { data: existingResults } = await supabase
          .from('results').select('match_id, winner').in('match_id', nullWinnerIds)
        const winnerMap = {}
        for (const r of existingResults ?? []) if (r.winner != null) winnerMap[r.match_id] = r.winner
        toUpsert = toUpsert.map(r =>
          r.winner === null && winnerMap[r.match_id] != null
            ? { ...r, winner: winnerMap[r.match_id] }
            : r
        )
      }
      const { error } = await supabase.from('results').upsert(toUpsert, { onConflict: 'match_id' })
      if (error) throw new Error(error.message)
      await broadcastAllResults()
    }

    if (goalsToUpsert.length > 0) {
      // Fetch existing rows to preserve team IDs and goal-level team_ids when API returns nulls
      const matchIds = goalsToUpsert.map(r => r.match_id)
      const { data: existing } = await supabase
        .from('match_goals')
        .select('match_id, home_team_id, away_team_id, goals')
        .in('match_id', matchIds)
      const existingMap = {}
      for (const r of existing ?? []) existingMap[r.match_id] = r

      const rows = goalsToUpsert.map(r => {
        const ex = existingMap[r.match_id]
        // Merge goal-level team_ids: if new goal has null, fill from existing row by scorer+minute
        const mergedGoals = r.goals.map(ng => {
          if (ng.team_id != null) return ng
          const eg = (ex?.goals ?? []).find(g =>
            String(g.scorer_id) === String(ng.scorer_id) && g.minute === ng.minute
          )
          return eg?.team_id ? { ...ng, team_id: eg.team_id } : ng
        })
        return {
          ...r,
          home_team_id: r.home_team_id ?? ex?.home_team_id ?? null,
          away_team_id: r.away_team_id ?? ex?.away_team_id ?? null,
          goals:        mergedGoals,
        }
      })

      const { error: ge } = await supabase.from('match_goals').upsert(rows, { onConflict: 'match_id' })
      if (!ge) await broadcastGoals()
    }
  }

  // ── 30-second live poller ─────────────────────────────────────
  async function runLivePoll() {
    if (livePolling) return
    livePolling = true
    livePollerTimer = null

    try {
      const json       = await fdFetch(apiKey, `${FD_BASE}/competitions/WC/matches?season=2026&status=IN_PLAY,PAUSED`)
      const apiMatches = json.matches ?? []

      if (!apiMatches.length) {
        if (Object.keys(liveScores).length > 0) emptyLiveStreak++

        const inWindow = await getMatchesInLiveWindow()
        const shouldFinalize =
          Object.keys(liveScores).length > 0 &&
          (emptyLiveStreak >= EMPTY_LIVE_POLLS_BEFORE_FINALIZE || inWindow.length === 0)

        if (shouldFinalize) {
          emptyLiveStreak = 0
          const snapshot = { ...liveScores }
          console.log('[scheduler] Live poller: no live matches — finalizing')
          try {
            await finalizeEndedMatches(snapshot)
          } catch (err) {
            console.error('[scheduler] Finalize ended matches failed:', err.message)
            schedulePostMatchRetries(Object.keys(snapshot))
          }
        } else if (inWindow.length > 0) {
          console.log(`[scheduler] Live poll empty — still watching ${inWindow.length} match(es) in kickoff window`)
        }
        return
      }

      emptyLiveStreak = 0

      const { data: fdRows } = await supabase.from('fd_match_ids').select('*')
      const fdIdToMatchId    = {}
      for (const r of fdRows ?? []) fdIdToMatchId[r.fd_id] = r.match_id

      const payloads = buildMatchPayloads(apiMatches, fdIdToMatchId)
      await applyAndBroadcast(payloads, false)
      console.log(`[scheduler] Live poll — ${Object.keys(payloads.newLive).length} match(es) live`)
    } catch (err) {
      if (err.message !== 'rate-limited') console.error('[scheduler] Live poll error:', err.message)
    } finally {
      livePolling = false
      if (await shouldKeepLivePolling()) scheduleLivePoll()
    }
  }

  function startLivePoller() {
    if (livePolling || livePollerTimer) return
    console.log('[scheduler] Starting live poller')
    runLivePoll()
  }

  // ── Scheduled sync (results + kickoffs) ──────────────────────
  async function runSync(reason = 'scheduled') {
    if (syncing) {
      if (reason.includes('post-match')) {
        setTimeout(() => runSync(reason), 5_000)
      } else {
        console.log(`[scheduler] Sync already in progress — skipping (${reason})`)
      }
      return
    }
    syncing  = true
    lastSync = new Date().toISOString()
    console.log(`[scheduler] Sync (${reason}) — fetching matches`)

    try {
      const json       = await fdFetch(apiKey, `${FD_BASE}/competitions/WC/matches?season=2026&status=FINISHED,IN_PLAY,PAUSED`)
      const apiMatches = json.matches ?? []

      const { data: fdRows } = await supabase.from('fd_match_ids').select('*')
      const fdIdToMatchId    = {}
      for (const r of fdRows ?? []) fdIdToMatchId[r.fd_id] = r.match_id

      const payloads  = buildMatchPayloads(apiMatches, fdIdToMatchId)
      const postMatch = reason.includes('post-match')
      const wipeLive  = reason === 'scheduled' || reason === 'manual'
      await applyAndBroadcast(payloads, wipeLive)

      if (postMatch && payloads.toUpsert.length) {
        removeFromLive(payloads.toUpsert.map(r => r.match_id))
      }

      const liveCount = Object.keys(payloads.newLive).length
      if (liveCount > 0) {
        console.log(`[scheduler] ${liveCount} live match(es) detected — starting poller`)
        startLivePoller()
      } else {
        ensureLivePoller()
      }

      console.log(`[scheduler] Sync done — ${payloads.toUpsert.length} result(s), ${liveCount} live`)
    } catch (err) {
      if (err.message === 'rate-limited') {
        console.warn('[scheduler] Rate-limited — retrying in 65s')
        setTimeout(() => runSync(`${reason}-retry`), 65_000)
      } else {
        console.error('[scheduler] Sync error:', err.message, '— retrying in 30s')
        setTimeout(() => runSync(`${reason}-retry`), 30_000)
      }
    } finally {
      syncing = false
    }
  }

  // ── Full schedule sync (kickoffs + FD IDs + match meta) ───────
  async function syncSchedule() {
    console.log('[scheduler] Syncing full schedule (kickoffs + FD IDs + match meta)…')
    try {
      const json       = await fdFetch(apiKey, `${FD_BASE}/competitions/WC/matches?season=2026`)
      const apiMatches = json.matches ?? []

      const { data: fdRows } = await supabase.from('fd_match_ids').select('*')
      const fdIdToMatchId    = {}
      const slotCounts       = {}
      for (const r of fdRows ?? []) {
        fdIdToMatchId[r.fd_id] = r.match_id
        const slug = r.match_id.replace(/_\d+$/, '')
        if (KO_STAGE_SLUG[r.match_id] === undefined && slug !== r.match_id)
          slotCounts[slug] = Math.max(slotCounts[slug] || 0, parseInt(r.match_id.split('_').pop(), 10))
      }

      // Assign new KO slots sorted by date so numbering is stable
      const koApiMatches = apiMatches.filter(m => KO_STAGE_SLUG[m.stage] && !fdIdToMatchId[m.id])
      koApiMatches.sort((a, b) => a.utcDate.localeCompare(b.utcDate))
      const newKoFdRows = []
      for (const m of koApiMatches) {
        const slug  = KO_STAGE_SLUG[m.stage]
        slotCounts[slug] = (slotCounts[slug] || 0) + 1
        const matchId    = `${slug}_${slotCounts[slug]}`
        fdIdToMatchId[m.id] = matchId
        newKoFdRows.push({ match_id: matchId, fd_id: m.id, ts: Date.now() })
      }
      if (newKoFdRows.length) await supabase.from('fd_match_ids').upsert(newKoFdRows, { onConflict: 'match_id' })

      const kickoffRows = []
      const fdIdRows    = []
      const metaRows    = []

      for (const m of apiMatches) {
        const home     = normalize(m.homeTeam?.name ?? '')
        const away     = normalize(m.awayTeam?.name ?? '')
        const grp      = parseGroup(m.group)
        const matchday = m.matchday ?? null

        let matchId = null
        if (m.stage === 'GROUP_STAGE') {
          const gm = findGroupMatch(home, away, grp, matchday)
          if (gm) matchId = gm.id
        } else {
          matchId = fdIdToMatchId[m.id] ?? null
        }
        if (!matchId) continue

        if (m.utcDate) kickoffRows.push({ match_id: matchId, kickoff: m.utcDate, ts: Date.now() })
        if (m.id)      fdIdRows.push({ match_id: matchId, fd_id: m.id, ts: Date.now() })
        if (m.odds) {
          metaRows.push({
            match_id:  matchId,
            odds_home: m.odds.homeWin ?? null,
            odds_draw: m.odds.draw    ?? null,
            odds_away: m.odds.awayWin ?? null,
            ts: Date.now(),
          })
        }
      }

      await Promise.all([
        kickoffRows.length && supabase.from('kickoffs').upsert(kickoffRows, { onConflict: 'match_id' }),
        fdIdRows.length    && supabase.from('fd_match_ids').upsert(fdIdRows, { onConflict: 'match_id' }),
        metaRows.length    && supabase.from('match_meta').upsert(metaRows, { onConflict: 'match_id' }),
      ])

      const { data: allKickoffs } = await supabase.from('kickoffs').select('*')
      const kickoffMap = {}
      for (const r of allKickoffs ?? []) kickoffMap[r.match_id] = r.kickoff
      broadcast('kickoffs', kickoffMap)

      const { data: allMeta } = await supabase.from('match_meta').select('*')
      const metaMap = {}
      for (const m of allMeta ?? []) {
        metaMap[m.match_id] = {
          matchId:  m.match_id,
          venue:    m.venue    ?? null,
          referee:  m.referee  ?? null,
          oddsHome: m.odds_home ?? null,
          oddsDraw: m.odds_draw ?? null,
          oddsAway: m.odds_away ?? null,
        }
      }
      broadcast('match_meta', metaMap)

      console.log(`[scheduler] Schedule sync done — ${kickoffRows.length} kickoffs, ${fdIdRows.length} FD IDs, ${metaRows.length} with odds`)
      return { kickoffs: kickoffRows.length, fdIds: fdIdRows.length, odds: metaRows.length }
    } catch (err) {
      if (err.message === 'rate-limited') console.warn('[scheduler] Rate-limited on schedule sync')
      else console.error('[scheduler] Schedule sync error:', err.message)
      throw err
    }
  }

  // ── Day planner ───────────────────────────────────────────────
  async function planDay() {
    clearTimers()

    const now      = new Date()
    const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))

    const isToday = ms => {
      const d = new Date(ms)
      return d.getUTCFullYear() === now.getUTCFullYear() &&
             d.getUTCMonth()    === now.getUTCMonth()    &&
             d.getUTCDate()     === now.getUTCDate()
    }

    const [{ data: rows }, { data: fdRows }] = await Promise.all([
      supabase.from('kickoffs').select('*'),
      supabase.from('fd_match_ids').select('*'),
    ])

    const fdMap = {}
    for (const r of fdRows ?? []) fdMap[r.match_id] = r.fd_id

    const todayMs = rows
      ? rows
          .map(r => ({ matchId: r.match_id, kickoffMs: new Date(r.kickoff).getTime() }))
          .filter(({ kickoffMs }) => isToday(kickoffMs))
      : []

    console.log(`[scheduler] Day plan: ${todayMs.length} match(es) today`)

    // Schedule lineup poll starting at T-55min — retries every 30s until lineup found or kickoff
    for (const { matchId, kickoffMs } of todayMs) {
      const fdId = fdMap[matchId]
      if (!fdId) continue
      const firstFetchAt = kickoffMs - 55 * 60_000
      const delay = Math.max(0, firstFetchAt - Date.now())
      // If already past T-55 but before kickoff, start immediately
      if (Date.now() < kickoffMs) {
        timers.push(setTimeout(() => runLineupFetch(matchId, fdId, kickoffMs), delay))
      }
    }

    // One runSync per match at kickoff time — 30s poller takes over from there
    const fireTimes = [...new Set(todayMs.map(({ kickoffMs }) => kickoffMs))]
      .filter(ms => ms > now.getTime())
      .sort((a, b) => a - b)

    todayPlan = fireTimes

    for (const ms of todayPlan) {
      timers.push(setTimeout(() => runSync('scheduled'), ms - Date.now()))
    }

    nextSync = todayPlan.length > 0 ? new Date(todayPlan[0]).toISOString() : null

    if (todayPlan.length > 0) {
      console.log(`[scheduler] Scheduled ${todayPlan.length} kickoff sync(s) — next: ${nextSync}`)
    } else {
      console.log('[scheduler] No matches today — no auto-polls scheduled')
    }

    // Restore any live matches that were running before a restart
    const { data: liveRows } = await supabase.from('live_scores').select('*')
    if (liveRows?.length) {
      for (const r of liveRows) {
        liveScores[r.match_id] = {
          matchId:    r.match_id,
          home:       r.home,
          away:       r.away,
          homeScore:  r.home_score,
          awayScore:  r.away_score,
          status:     r.status,
          minute:     r.minute      ?? null,
          injuryTime: r.injury_time ?? null,
          goals:      r.goals       ?? [],
          updatedAt:  r.updated_at,
        }
      }
      console.log(`[scheduler] Restored ${liveRows.length} live match(es) from DB — starting poller`)
      broadcast('live_scores', liveScores)
      startLivePoller()
    } else {
      ensureLivePoller()
    }

    // Always sync on startup to pick up results/goals from any downtime
    const hadMatchToday = todayMs.some(({ kickoffMs }) => now.getTime() >= kickoffMs)
    const reason = hadMatchToday ? 'startup-active' : 'startup'
    console.log(`[scheduler] Startup sync (${reason})`)
    runSync(reason).finally(() => ensureLivePoller())

    // Replan at midnight
    timers.push(setTimeout(() => planDay(), todayEnd.getTime() - Date.now()))
  }

  planDay()

  // ── Admin-callable helpers ────────────────────────────────────
  async function syncLineup(matchId) {
    const { data: fdRow } = await supabase.from('fd_match_ids').select('fd_id').eq('match_id', matchId).single()
    if (!fdRow?.fd_id) throw new Error(`No FD ID mapped for ${matchId} — run Sync Schedule first`)
    await runLineupFetch(matchId, fdRow.fd_id)
  }

  async function syncGoals(matchId) {
    const { data: fdRow } = await supabase.from('fd_match_ids').select('fd_id').eq('match_id', matchId).single()
    if (!fdRow?.fd_id) throw new Error(`No FD ID for ${matchId} — run Sync Schedule first`)
    console.log(`[scheduler] Goals sync for ${matchId} (FD: ${fdRow.fd_id})`)
    const match = await fdFetch(apiKey, `${FD_BASE}/matches/${fdRow.fd_id}`)
    const goals = (match.goals ?? []).map(g => ({
      minute:      g.minute ?? null,
      scorer_id:   g.scorer?.id   ?? null,
      scorer_name: g.scorer?.name ?? null,
      team_id:     g.team?.id     ?? null,
    }))
    const row = {
      match_id:     matchId,
      home_team_id: match.homeTeam?.id ?? null,
      away_team_id: match.awayTeam?.id ?? null,
      goals,
      ts: Date.now(),
    }
    const { error } = await supabase.from('match_goals').upsert(row, { onConflict: 'match_id' })
    if (error) throw new Error(error.message)
    await broadcastGoals()
    console.log(`[scheduler] Goals synced for ${matchId}: ${goals.length} goal(s)`)
    return goals.length
  }

  return {
    forceSync:       () => runSync('manual'),
    syncSchedule:    () => syncSchedule(),
    syncLineup,
    syncGoals,
    getLiveScores:   () => liveScores,
    startLivePoller: () => { startLivePoller() },
    status: () => ({
      lastSync,
      nextSync,
      syncing,
      pollsPlanned: todayPlan.length,
      liveMatches:  Object.keys(liveScores).length,
    }),
  }
}
