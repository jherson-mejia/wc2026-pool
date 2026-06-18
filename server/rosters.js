import { GROUP_MATCHES } from '../src/data/worldcup.js'

const ALL_POOL_TEAMS = new Set(GROUP_MATCHES.flatMap(m => [m.home, m.away]))

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

export const normalizeTeamName = n => TEAM_NAME_MAP[n] ?? n

const POSITION_ORDER = { Goalkeeper: 0, Defender: 1, Defence: 1, Midfielder: 2, Midfield: 2, Attacker: 3, Offence: 3, Forward: 3 }

export function mapSquadPlayers(squad) {
  return (squad ?? [])
    .map(p => ({ id: p.id, name: p.name, position: p.position ?? null, shirtNumber: p.shirtNumber ?? null }))
    .sort((a, b) => (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9))
}

async function fdFetch(apiKey, url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(`https://api.football-data.org/v4${url}`, {
      headers: { 'X-Auth-Token': apiKey },
      signal: controller.signal,
    })
    if (res.status === 429) throw new Error('rate_limit')
    if (!res.ok) throw new Error(`FD API error ${res.status}`)
    return res.json()
  } finally {
    clearTimeout(timeout)
  }
}

export async function syncRosters({ supabase, apiKey, broadcastFn, delayMs = 2000 }) {
  const { teams } = await fdFetch(apiKey, '/competitions/WC/teams?season=2026')

  let synced = 0
  let skipped = 0
  const errors = []

  for (const apiTeam of teams ?? []) {
    const poolName = normalizeTeamName(apiTeam.name)
    if (!ALL_POOL_TEAMS.has(poolName)) {
      console.warn(`[rosters] unmapped FD team: "${apiTeam.name}" → "${poolName}"`)
      skipped++
      continue
    }

    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs))

    try {
      const teamData = await fdFetch(apiKey, `/teams/${apiTeam.id}`)
      const players  = mapSquadPlayers(teamData.squad)
      const row = { team_name: poolName, fd_team_id: apiTeam.id, players, synced_at: Date.now() }
      const { error } = await supabase.from('team_rosters').upsert(row, { onConflict: 'team_name' })
      if (error) throw new Error(error.message)
      synced++
    } catch (e) {
      console.error(`[rosters] failed to sync ${poolName}:`, e.message)
      errors.push({ team: poolName, error: e.message })
    }
  }

  const { data: rosterRows } = await supabase.from('team_rosters').select('*')
  const rosterMap = {}
  for (const r of rosterRows ?? []) {
    rosterMap[r.team_name] = { teamName: r.team_name, fdTeamId: r.fd_team_id, players: r.players ?? [], syncedAt: r.synced_at }
  }
  broadcastFn('team_rosters', rosterMap)

  return { ok: true, synced, skipped, errors, lastSync: new Date().toISOString() }
}
