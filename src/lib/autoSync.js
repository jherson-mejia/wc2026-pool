/**
 * Auto-sync finished match results + schedule from football-data.org.
 *
 * All requests go to /api/football-data which is proxied through the
 * Express server. The API key lives in the server's .env — never in
 * the browser.
 */
import { GROUP_MATCHES } from '@/data/worldcup'

// football-data.org team names → our pool team names
const TEAM_NAME_MAP = {
  'Korea Republic':                'South Korea',
  "Côte d'Ivoire":                 'Ivory Coast',
  'Ivory Coast':                   'Ivory Coast',
  'Türkiye':                       'Turkey',
  'Bosnia-Herzegovina':            'Bosnia and Herzegovina',
  'Cabo Verde':                    'Cape Verde',
  'Congo DR':                      'DR Congo',
  'Democratic Republic of Congo':  'DR Congo',
  'USA':                           'United States',
  'United States of America':      'United States',
  'Czech Republic':                'Czech Republic',
  'Czechia':                       'Czech Republic',
  'IR Iran':                       'Iran',
  'Curacao':                       'Curaçao', // ASCII fallback
}

function normalize(name) {
  return TEAM_NAME_MAP[name] ?? name
}

// "GROUP_A" → "A", "ROUND_OF_32" → null (not a group stage match)
function parseGroup(apiGroup) {
  if (!apiGroup?.startsWith('GROUP_')) return null
  return apiGroup.replace('GROUP_', '')
}

async function apiFetch(path) {
  const res = await fetch(`/api/football-data${path}`)
  if (res.status === 500) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Server error — is FD_API_KEY set in .env?')
  }
  if (res.status === 403) throw new Error('Invalid API key — check FD_API_KEY in .env')
  if (res.status === 429) throw new Error('Rate limit hit — wait a minute and try again')
  if (!res.ok)            throw new Error(`API error: ${res.status}`)
  return res.json()
}

/** Fetch all FINISHED WC 2026 matches. */
export async function fetchFinishedMatches() {
  const data = await apiFetch('/competitions/WC/matches?season=2026&status=FINISHED')
  return data.matches ?? []
}

/** Fetch the full WC 2026 schedule (all statuses) to extract kickoff times. */
export async function fetchSchedule() {
  const data = await apiFetch('/competitions/WC/matches?season=2026')
  return data.matches ?? []
}

function findGroupMatch(apiHome, apiAway, apiGroup, apiMatchday) {
  return GROUP_MATCHES.find(g =>
    g.home === apiHome &&
    g.away === apiAway &&
    (!apiGroup    || g.group    === apiGroup) &&
    (!apiMatchday || g.matchday === apiMatchday)
  )
}

/**
 * Build a { matchId → ISO kickoff string } map from API match objects.
 * Group matches resolved by team names + group + matchday; KO matches when teams are set.
 */
export function mapKickoffs(apiMatches, koMatches = {}) {
  const kickoffs = {}
  for (const m of apiMatches) {
    const utcDate = m.utcDate
    if (!utcDate) continue

    const apiHome     = normalize(m.homeTeam?.name ?? '')
    const apiAway     = normalize(m.awayTeam?.name ?? '')
    const apiGroup    = parseGroup(m.group)
    const apiMatchday = m.matchday ?? null

    if (m.stage === 'GROUP_STAGE') {
      const gm = findGroupMatch(apiHome, apiAway, apiGroup, apiMatchday)
      if (gm) { kickoffs[gm.id] = utcDate; continue }
    } else {
      const koEntry = Object.entries(koMatches).find(
        ([, km]) => km.home === apiHome && km.away === apiAway
      )
      if (koEntry) kickoffs[koEntry[0]] = utcDate
    }
  }
  return kickoffs
}

/**
 * Build a { matchId → { oddsHome, oddsDraw, oddsAway } } map from API match objects.
 * Odds are available in the schedule endpoint — no extra API call needed.
 */
export function mapMatchMeta(apiMatches, koMatches = {}) {
  const meta = {}
  for (const m of apiMatches) {
    if (!m.odds) continue
    const apiHome     = normalize(m.homeTeam?.name ?? '')
    const apiAway     = normalize(m.awayTeam?.name ?? '')
    const apiGroup    = parseGroup(m.group)
    const apiMatchday = m.matchday ?? null

    let matchId = null
    if (m.stage === 'GROUP_STAGE') {
      const gm = findGroupMatch(apiHome, apiAway, apiGroup, apiMatchday)
      if (gm) matchId = gm.id
    } else {
      const koEntry = Object.entries(koMatches).find(([, km]) => km.home === apiHome && km.away === apiAway)
      if (koEntry) matchId = koEntry[0]
    }
    if (!matchId) continue

    meta[matchId] = {
      odds_home: m.odds.homeWin ?? null,
      odds_draw: m.odds.draw    ?? null,
      odds_away: m.odds.awayWin ?? null,
    }
  }
  return meta
}

/**
 * Build a { matchId → fdMatchId } map from API match objects.
 * Used by the server scheduler to call /matches/:fdId for lineups.
 */
export function mapFdMatchIds(apiMatches, koMatches = {}) {
  const fdMatchIds = {}
  for (const m of apiMatches) {
    if (!m.id) continue
    const apiHome     = normalize(m.homeTeam?.name ?? '')
    const apiAway     = normalize(m.awayTeam?.name ?? '')
    const apiGroup    = parseGroup(m.group)
    const apiMatchday = m.matchday ?? null

    if (m.stage === 'GROUP_STAGE') {
      const gm = findGroupMatch(apiHome, apiAway, apiGroup, apiMatchday)
      if (gm) fdMatchIds[gm.id] = m.id
    } else {
      const koEntry = Object.entries(koMatches).find(
        ([, km]) => km.home === apiHome && km.away === apiAway
      )
      if (koEntry) fdMatchIds[koEntry[0]] = m.id
    }
  }
  return fdMatchIds
}

/**
 * Maps API match objects to pool result objects.
 * Returns an array of { matchId, home, away, winner }.
 */
export function mapToPoolResults(apiMatches, koMatches = {}) {
  const resolved = []
  for (const m of apiMatches) {
    const homeScore = m.score?.fullTime?.home
    const awayScore = m.score?.fullTime?.away
    if (homeScore == null || awayScore == null) continue

    const apiHome     = normalize(m.homeTeam?.name ?? '')
    const apiAway     = normalize(m.awayTeam?.name ?? '')
    const apiGroup    = parseGroup(m.group)
    const apiMatchday = m.matchday ?? null

    if (m.stage === 'GROUP_STAGE') {
      const gm = findGroupMatch(apiHome, apiAway, apiGroup, apiMatchday)
      if (gm) {
        resolved.push({ matchId: gm.id, home: homeScore, away: awayScore, winner: null })
        continue
      }
    } else {
      const koEntry = Object.entries(koMatches).find(
        ([, km]) => km.home === apiHome && km.away === apiAway
      )
      if (koEntry) {
        const w = m.score?.winner
        resolved.push({
          matchId: koEntry[0],
          home: homeScore,
          away: awayScore,
          winner: w === 'HOME_TEAM' ? 'home' : w === 'AWAY_TEAM' ? 'away' : null,
        })
      }
    }
  }
  return resolved
}
