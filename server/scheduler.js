/**
 * Auto-sync scheduler — manages football-data.org free tier (100 req/day).
 *
 * Strategy:
 *   - Reserve 20 requests/day for manual admin use.
 *   - Remaining 80 are spread across match windows for the day.
 *   - For each match: polls at +20, +45, +65, +80, +95, +110, +125 min after kickoff.
 *   - Simultaneous matches share poll slots (de-duped by time).
 *   - Lineup fetches: one call per match at T-55min (separate from result-poll budget).
 *   - Replans at UTC midnight. Immediate sync if a match is in progress on startup.
 */

import { GROUP_MATCHES } from '../src/data/worldcup.js'

export const DAILY_BUDGET   = 100
export const MANUAL_RESERVE = 20
export const AUTO_BUDGET    = DAILY_BUDGET - MANUAL_RESERVE  // 80

// Mirror of autoSync.js — kept in sync manually
const TEAM_NAME_MAP = {
  'Korea Republic':               'South Korea',
  "Côte d'Ivoire":                'Ivory Coast',
  'Ivory Coast':                  'Ivory Coast',
  'Türkiye':                      'Turkey',
  'Bosnia-Herzegovina':           'Bosnia and Herzegovina',
  'Cabo Verde':                   'Cape Verde',
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
    g.home === home && g.away === away &&
    (!group    || g.group    === group) &&
    (!matchday || g.matchday === matchday)
  )
}

async function fetchFinished(apiKey) {
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(
      'https://api.football-data.org/v4/competitions/WC/matches?season=2026&status=FINISHED',
      { headers: { 'X-Auth-Token': apiKey }, signal: ctrl.signal }
    )
    clearTimeout(timeout)
    if (res.status === 429) throw new Error('rate-limited')
    if (!res.ok) throw new Error(`FD API ${res.status}`)
    const json = await res.json()
    return json.matches ?? []
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchAllMatches(apiKey) {
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(
      'https://api.football-data.org/v4/competitions/WC/matches?season=2026',
      { headers: { 'X-Auth-Token': apiKey }, signal: ctrl.signal }
    )
    clearTimeout(timeout)
    if (res.status === 429) throw new Error('rate-limited')
    if (!res.ok) throw new Error(`FD API ${res.status}`)
    const json = await res.json()
    return json.matches ?? []
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchMatchDetail(apiKey, fdMatchId) {
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const res = await fetch(
      `https://api.football-data.org/v4/matches/${fdMatchId}`,
      { headers: { 'X-Auth-Token': apiKey }, signal: ctrl.signal }
    )
    clearTimeout(timeout)
    if (res.status === 429) throw new Error('rate-limited')
    if (!res.ok) throw new Error(`FD API ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timeout)
  }
}

// Offsets (minutes after kickoff) to poll during a match window.
const MATCH_OFFSETS = [20, 45, 65, 80, 95, 110, 125]

export function startScheduler({ supabase, broadcast, apiKey }) {
  if (!apiKey) {
    console.log('[scheduler] FD_API_KEY not set — auto-sync disabled')
    return null
  }

  let requestsToday = 0
  let timers        = []
  let lastSync      = null
  let nextSync      = null
  let todayPlan     = []    // array of scheduled Date objects

  function clearTimers() {
    timers.forEach(t => clearTimeout(t))
    timers = []
  }

  async function runLineupFetch(poolMatchId, fdMatchId) {
    requestsToday++
    console.log(`[scheduler] Lineup fetch for ${poolMatchId} (FD: ${fdMatchId})`)
    try {
      const match = await fetchMatchDetail(apiKey, fdMatchId)

      const toPlayers = arr => (arr ?? []).map(p => ({
        id: p.id, name: p.name, position: p.position ?? null, shirtNumber: p.shirtNumber ?? null,
      }))

      const row = {
        match_id:     poolMatchId,
        home_team_id: match.homeTeam?.id ?? null,
        away_team_id: match.awayTeam?.id ?? null,
        home_lineup:  toPlayers(match.homeTeam?.lineup),
        home_bench:   toPlayers(match.homeTeam?.bench),
        away_lineup:  toPlayers(match.awayTeam?.lineup),
        away_bench:   toPlayers(match.awayTeam?.bench),
        fetched_at:   Date.now(),
      }

      const { error } = await supabase.from('lineups').upsert(row, { onConflict: 'match_id' })
      if (error) throw new Error(error.message)

      // Also store venue + referee (and update odds if not yet set)
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
          matchId: m.match_id, venue: m.venue ?? null, referee: m.referee ?? null,
          oddsHome: m.odds_home ?? null, oddsDraw: m.odds_draw ?? null, oddsAway: m.odds_away ?? null,
        }
      }
      broadcast('match_meta', metaMap)
      console.log(`[scheduler] Lineup + meta saved for ${poolMatchId}`)
    } catch (err) {
      if (err.message === 'rate-limited') {
        requestsToday--
        console.warn(`[scheduler] Rate-limited on lineup fetch for ${poolMatchId}`)
      } else {
        console.error(`[scheduler] Lineup fetch error for ${poolMatchId}:`, err.message)
      }
    }
  }

  function rowToLineup(l) {
    return {
      matchId:     l.match_id,
      homeTeamId:  l.home_team_id,
      awayTeamId:  l.away_team_id,
      homeLineup:  l.home_lineup ?? [],
      homeBench:   l.home_bench  ?? [],
      awayLineup:  l.away_lineup ?? [],
      awayBench:   l.away_bench  ?? [],
      fetchedAt:   l.fetched_at,
    }
  }

  async function runSync(reason = 'scheduled') {
    if (requestsToday >= AUTO_BUDGET) {
      console.log(`[scheduler] Budget exhausted (${requestsToday}/${AUTO_BUDGET}) — skipping`)
      return
    }
    requestsToday++
    lastSync = new Date().toISOString()
    console.log(`[scheduler] Poll #${requestsToday} (${reason}) — fetching finished matches`)

    try {
      const apiMatches = await fetchFinished(apiKey)

      const { data: koRows } = await supabase.from('ko_matches').select('*')
      const koMatches = {}
      for (const r of koRows ?? []) koMatches[r.match_id] = { home: r.home, away: r.away }

      const toUpsert     = []
      const goalsToUpsert = []

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
          const entry = Object.entries(koMatches).find(
            ([, km]) => km.home === home && km.away === away
          )
          if (entry) matchId = entry[0]
        }

        if (!matchId) continue

        // Results
        const h = m.score?.fullTime?.home
        const a = m.score?.fullTime?.away
        if (h != null && a != null) {
          const w      = m.score?.winner
          const winner = m.stage !== 'GROUP_STAGE'
            ? (w === 'HOME_TEAM' ? 'home' : w === 'AWAY_TEAM' ? 'away' : null)
            : null
          const hp = m.score?.penalties?.home ?? null
          const ap = m.score?.penalties?.away ?? null
          toUpsert.push({ match_id: matchId, home: h, away: a, winner, home_pens: hp, away_pens: ap, ts: Date.now() })
        }

        // Goals (may be present even for in-progress matches)
        if (Array.isArray(m.goals)) {
          goalsToUpsert.push({
            match_id:     matchId,
            home_team_id: m.homeTeam?.id ?? null,
            away_team_id: m.awayTeam?.id ?? null,
            goals: m.goals.map(g => ({
              minute:      g.minute,
              scorer_id:   g.scorer?.id ?? null,
              scorer_name: g.scorer?.name ?? null,
              team_id:     g.team?.id ?? null,
            })),
            ts: Date.now(),
          })
        }
      }

      if (toUpsert.length > 0) {
        const { error } = await supabase.from('results').upsert(toUpsert, { onConflict: 'match_id' })
        if (error) throw new Error(error.message)

        const { data: allResults } = await supabase.from('results').select('*')
        const resultMap = {}
        for (const r of allResults ?? []) {
          resultMap[r.match_id] = { matchId: r.match_id, home: r.home, away: r.away, winner: r.winner, ts: r.ts }
        }
        broadcast('results', resultMap)
        console.log(`[scheduler] Saved & broadcast ${toUpsert.length} result(s)`)
      } else {
        console.log('[scheduler] No new results')
      }

      if (goalsToUpsert.length > 0) {
        const { error: ge } = await supabase.from('match_goals').upsert(goalsToUpsert, { onConflict: 'match_id' })
        if (!ge) {
          const { data: allGoals } = await supabase.from('match_goals').select('*')
          const goalsMap = {}
          for (const g of allGoals ?? []) {
            goalsMap[g.match_id] = {
              matchId:    g.match_id,
              homeTeamId: g.home_team_id,
              awayTeamId: g.away_team_id,
              goals:      g.goals ?? [],
            }
          }
          broadcast('match_goals', goalsMap)
        }
      }
    } catch (err) {
      if (err.message === 'rate-limited') {
        console.warn('[scheduler] Rate-limited by FD API — will retry next scheduled slot')
        requestsToday--
      } else {
        console.error('[scheduler] Sync error:', err.message)
      }
    }
  }

  async function syncSchedule() {
    requestsToday++
    console.log('[scheduler] Syncing full schedule (kickoffs + FD IDs + match meta)…')
    try {
      const apiMatches = await fetchAllMatches(apiKey)

      const { data: koRows } = await supabase.from('ko_matches').select('*')
      const koMatches = {}
      for (const r of koRows ?? []) koMatches[r.match_id] = { home: r.home, away: r.away }

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
          const entry = Object.entries(koMatches).find(([, km]) => km.home === home && km.away === away)
          if (entry) matchId = entry[0]
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

      // Broadcast updated kickoffs and match_meta
      const { data: allKickoffs } = await supabase.from('kickoffs').select('*')
      const kickoffMap = {}
      for (const r of allKickoffs ?? []) kickoffMap[r.match_id] = r.kickoff
      broadcast('kickoffs', kickoffMap)

      const { data: allMeta } = await supabase.from('match_meta').select('*')
      const metaMap = {}
      for (const m of allMeta ?? []) {
        metaMap[m.match_id] = {
          matchId: m.match_id, venue: m.venue ?? null, referee: m.referee ?? null,
          oddsHome: m.odds_home ?? null, oddsDraw: m.odds_draw ?? null, oddsAway: m.odds_away ?? null,
        }
      }
      broadcast('match_meta', metaMap)

      console.log(`[scheduler] Schedule sync done — ${kickoffRows.length} kickoffs, ${fdIdRows.length} FD IDs, ${metaRows.length} with odds`)
      return { kickoffs: kickoffRows.length, fdIds: fdIdRows.length, odds: metaRows.length }
    } catch (err) {
      if (err.message === 'rate-limited') {
        requestsToday--
        console.warn('[scheduler] Rate-limited on schedule sync')
      } else {
        console.error('[scheduler] Schedule sync error:', err.message)
      }
      throw err
    }
  }

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

    // Schedule lineup fetches at T-55min for matches with a known FD match ID
    for (const { matchId, kickoffMs } of todayMs) {
      const fdId = fdMap[matchId]
      if (!fdId) continue
      const fetchAt = kickoffMs - 55 * 60_000
      if (fetchAt > now.getTime()) {
        const delay = fetchAt - Date.now()
        timers.push(setTimeout(() => runLineupFetch(matchId, fdId), delay))
      }
    }

    // Build list of result-poll fire times (deduplicated across simultaneous matches)
    const fireTimes = new Set()
    for (const { kickoffMs } of todayMs) {
      for (const offset of MATCH_OFFSETS) {
        fireTimes.add(kickoffMs + offset * 60_000)
      }
    }

    todayPlan = [...fireTimes]
      .filter(ms => ms > now.getTime())
      .sort((a, b) => a - b)
      .slice(0, AUTO_BUDGET)

    for (const ms of todayPlan) {
      const delay = ms - Date.now()
      timers.push(setTimeout(() => runSync('scheduled'), delay))
    }

    nextSync = todayPlan.length > 0 ? new Date(todayPlan[0]).toISOString() : null

    if (todayPlan.length > 0) {
      console.log(`[scheduler] Scheduled ${todayPlan.length} polls — next: ${nextSync}`)
    } else {
      console.log('[scheduler] No matches today — no auto-polls scheduled')
    }

    const activeNow = todayMs.some(({ kickoffMs }) => {
      const elapsed = now.getTime() - kickoffMs
      return elapsed >= 0 && elapsed <= 130 * 60_000
    })
    if (activeNow) {
      console.log('[scheduler] Match in progress on startup — syncing now')
      runSync('startup-active')
    }

    const msUntilMidnight = todayEnd.getTime() - Date.now()
    timers.push(setTimeout(() => { requestsToday = 0; planDay() }, msUntilMidnight))
  }

  planDay()

  return {
    forceSync:      () => runSync('manual'),
    syncSchedule:   () => syncSchedule(),
    status:      () => ({
      requestsToday,
      autoBudget:  AUTO_BUDGET,
      dailyBudget: DAILY_BUDGET,
      reserved:    MANUAL_RESERVE,
      remaining:   AUTO_BUDGET - requestsToday,
      lastSync,
      nextSync,
      pollsPlanned: todayPlan.length,
    }),
  }
}
