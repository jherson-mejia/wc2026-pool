/**
 * Auto-sync scheduler — manages football-data.org free tier (100 req/day).
 *
 * Strategy:
 *   - Reserve 20 requests/day for manual admin use.
 *   - Remaining 80 are spread across match windows for the day.
 *   - For each match: polls at +20, +45, +65, +80, +95, +110, +125 min after kickoff.
 *   - Simultaneous matches share poll slots (de-duped by time).
 *   - Replans at UTC midnight. Immediate sync if a match is in progress on startup.
 */

import { GROUP_MATCHES } from '../src/data/worldcup.js'

export const DAILY_BUDGET  = 100
export const MANUAL_RESERVE = 20
export const AUTO_BUDGET   = DAILY_BUDGET - MANUAL_RESERVE  // 80

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

// Offsets (minutes after kickoff) to poll during a match window.
// 7 polls covers: ~HT, 2nd half, ET buffer, FT, post-match.
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

      const { data: koRows }         = await supabase.from('ko_matches').select('*')
      const koMatches = {}
      for (const r of koRows ?? []) koMatches[r.match_id] = { home: r.home, away: r.away }

      const toUpsert = []
      for (const m of apiMatches) {
        const h = m.score?.fullTime?.home
        const a = m.score?.fullTime?.away
        if (h == null || a == null) continue

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

        const w      = m.score?.winner
        const winner = m.stage !== 'GROUP_STAGE'
          ? (w === 'HOME_TEAM' ? 'home' : w === 'AWAY_TEAM' ? 'away' : null)
          : null

        const hp = m.score?.penalties?.home ?? null
        const ap = m.score?.penalties?.away ?? null

        toUpsert.push({ match_id: matchId, home: h, away: a, winner, home_pens: hp, away_pens: ap, ts: Date.now() })
      }

      if (toUpsert.length === 0) {
        console.log('[scheduler] No new results')
        return
      }

      const { error } = await supabase.from('results').upsert(toUpsert, { onConflict: 'match_id' })
      if (error) throw new Error(error.message)

      const { data: allResults } = await supabase.from('results').select('*')
      const resultMap = {}
      for (const r of allResults ?? []) {
        resultMap[r.match_id] = { matchId: r.match_id, home: r.home, away: r.away, winner: r.winner, ts: r.ts }
      }
      broadcast('results', resultMap)
      console.log(`[scheduler] Saved & broadcast ${toUpsert.length} result(s)`)
    } catch (err) {
      if (err.message === 'rate-limited') {
        console.warn('[scheduler] Rate-limited by FD API — will retry next scheduled slot')
        requestsToday-- // don't count failed request
      } else {
        console.error('[scheduler] Sync error:', err.message)
      }
    }
  }

  async function planDay() {
    clearTimers()

    const now       = new Date()
    const todayEnd  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))

    // Pull today's kickoffs from DB
    const { data: rows } = await supabase.from('kickoffs').select('*')
    const todayMs = rows
      ? rows
          .map(r => new Date(r.kickoff).getTime())
          .filter(ms => {
            const d = new Date(ms)
            return d.getUTCFullYear() === now.getUTCFullYear() &&
                   d.getUTCMonth()    === now.getUTCMonth()    &&
                   d.getUTCDate()     === now.getUTCDate()
          })
      : []

    const matchCount = todayMs.length
    console.log(`[scheduler] Day plan: ${matchCount} match(es) today`)

    // Build list of fire times (deduplicated across simultaneous matches)
    const fireTimes = new Set()
    for (const kickoffMs of todayMs) {
      for (const offset of MATCH_OFFSETS) {
        fireTimes.add(kickoffMs + offset * 60_000)
      }
    }

    // Only future slots, sorted, capped at budget
    todayPlan = [...fireTimes]
      .filter(ms => ms > now.getTime())
      .sort((a, b) => a - b)
      .slice(0, AUTO_BUDGET)

    // Schedule each poll
    for (const ms of todayPlan) {
      const delay = ms - Date.now()
      const t = setTimeout(() => runSync('scheduled'), delay)
      timers.push(t)
    }

    nextSync = todayPlan.length > 0 ? new Date(todayPlan[0]).toISOString() : null

    if (todayPlan.length > 0) {
      console.log(`[scheduler] Scheduled ${todayPlan.length} polls — next: ${nextSync}`)
    } else {
      console.log(`[scheduler] No matches today — no auto-polls scheduled`)
    }

    // Sync immediately if a match is currently in progress
    const activeNow = todayMs.some(ms => {
      const elapsed = now.getTime() - ms
      return elapsed >= 0 && elapsed <= 130 * 60_000
    })
    if (activeNow) {
      console.log('[scheduler] Match in progress on startup — syncing now')
      runSync('startup-active')
    }

    // Re-plan at UTC midnight
    const msUntilMidnight = todayEnd.getTime() - Date.now()
    timers.push(setTimeout(() => { requestsToday = 0; planDay() }, msUntilMidnight))
  }

  planDay()

  return {
    forceSync:   () => runSync('manual'),
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
