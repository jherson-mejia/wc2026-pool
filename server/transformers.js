export const rowToResult = r => ({ matchId: r.match_id, home: r.home, away: r.away, winner: r.winner, homePens: r.home_pens ?? null, awayPens: r.away_pens ?? null, ts: r.ts })
export const rowToKo     = r => ({ matchId: r.match_id, home: r.home, away: r.away, ts: r.ts })
export const rowToPick   = r => ({ matchId: r.match_id, email: r.email, home: r.home, away: r.away, winner: r.winner, ts: r.ts })
export const rowToLineup = r => ({
  matchId:    r.match_id,
  homeTeamId: r.home_team_id,
  awayTeamId: r.away_team_id,
  homeLineup: r.home_lineup ?? [],
  homeBench:  r.home_bench  ?? [],
  awayLineup: r.away_lineup ?? [],
  awayBench:  r.away_bench  ?? [],
  fetchedAt:  r.fetched_at,
})
export const rowToMatchGoals = r => ({
  matchId:    r.match_id,
  homeTeamId: r.home_team_id,
  awayTeamId: r.away_team_id,
  goals:      r.goals ?? [],
})
export const rowToMatchMeta = r => ({
  matchId:  r.match_id,
  venue:    r.venue     ?? null,
  referee:  r.referee   ?? null,
  oddsHome: r.odds_home ?? null,
  oddsDraw: r.odds_draw ?? null,
  oddsAway: r.odds_away ?? null,
})
export const rowToLiveScore = r => ({
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
})

export function rowsToPicks(rows) {
  const byEmail = {}
  for (const r of rows) {
    if (!byEmail[r.email]) byEmail[r.email] = {}
    byEmail[r.email][r.match_id] = rowToPick(r)
  }
  return byEmail
}

export const rowToRoster = r => ({
  teamName:  r.team_name,
  fdTeamId:  r.fd_team_id,
  players:   r.players ?? [],
  syncedAt:  r.synced_at,
})

export function rowsToScorerPicks(rows) {
  const byEmail = {}
  for (const r of rows) {
    if (!byEmail[r.email]) byEmail[r.email] = {}
    const key = `${r.match_id}_${r.team}`
    byEmail[r.email][key] = {
      matchId: r.match_id, email: r.email, team: r.team,
      playerId: r.player_id, playerName: r.player_name, ts: r.ts,
    }
  }
  return byEmail
}
