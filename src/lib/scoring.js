import { GROUP_MATCHES, GROUP_SCORING, KO_ROUNDS } from '@/data/worldcup'

export const SCORER_POINTS = 1

export function calcMatchPoints(pick, result, roundId) {
  if (!pick || !result) return 0
  if (pick.home == null || pick.away == null) return 0
  if (result.home == null || result.away == null) return 0

  const scoring =
    roundId === 'group'
      ? GROUP_SCORING
      : KO_ROUNDS.find(r => r.id === roundId)?.scoring

  if (!scoring) return 0

  const ph = Number(pick.home)
  const pa = Number(pick.away)
  const rh = Number(result.home)
  const ra = Number(result.away)

  // Exact score always beats partial
  if (ph === rh && pa === ra) return scoring.exact

  if (roundId === 'group') {
    const pickOutcome   = ph > pa ? 'H' : pa > ph ? 'A' : 'D'
    const resultOutcome = rh > ra ? 'H' : ra > rh ? 'A' : 'D'
    return pickOutcome === resultOutcome ? scoring.result : 0
  }

  // Knockout: match the winner pick
  const actualWinner = result.winner || (rh > ra ? 'home' : ra > rh ? 'away' : null)
  const pickWinner   = pick.winner  || (ph > pa ? 'home' : pa > ph ? 'away' : null)
  return pickWinner && pickWinner === actualWinner ? scoring.result : 0
}

export function calcScorerPoints(scorerPick, matchGoals, lineup) {
  if (!scorerPick || !matchGoals?.goals) return 0
  const teamId =
    (scorerPick.team === 'home' ? matchGoals.homeTeamId : matchGoals.awayTeamId) ??
    (scorerPick.team === 'home' ? lineup?.homeTeamId    : lineup?.awayTeamId)
  if (!teamId) return 0
  const scored = matchGoals.goals.some(
    g => String(g.scorer_id) === String(scorerPick.playerId) && String(g.team_id) === String(teamId)
  )
  return scored ? SCORER_POINTS : 0
}

export function calcTotals(picks = {}, results = {}, scorerPicks = {}, matchGoals = {}, lineups = {}) {
  let pts = 0, correct = 0, exact = 0, scorers = 0

  GROUP_MATCHES.forEach(m => {
    const p = picks[m.id]
    const r = results[m.id]
    if (p && r) {
      const v = calcMatchPoints(p, r, 'group')
      pts += v
      if (v >= GROUP_SCORING.result) correct++
      if (v >= GROUP_SCORING.exact)  exact++
    }
    for (const team of ['home', 'away']) {
      const sp = scorerPicks[`${m.id}_${team}`]
      const mg = matchGoals[m.id]
      if (sp && mg) {
        const sv = calcScorerPoints(sp, mg, lineups[m.id])
        pts += sv
        scorers += sv
      }
    }
  })

  KO_ROUNDS.forEach(round => {
    for (let i = 1; i <= round.count; i++) {
      const mid = `${round.id}_${i}`
      const p = picks[mid]
      const r = results[mid]
      if (p && r) {
        const v = calcMatchPoints(p, r, round.id)
        pts += v
        if (v >= round.scoring.result) correct++
        if (v >= round.scoring.exact)  exact++
      }
      for (const team of ['home', 'away']) {
        const sp = scorerPicks[`${mid}_${team}`]
        const mg = matchGoals[mid]
        if (sp && mg) {
          const sv = calcScorerPoints(sp, mg, lineups[mid])
          pts += sv
          scorers += sv
        }
      }
    }
  })

  return { pts, correct, exact, scorers }
}
