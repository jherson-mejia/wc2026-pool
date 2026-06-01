import { GROUP_MATCHES, GROUP_SCORING, KO_ROUNDS } from '@/data/worldcup'

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
  const actualWinner = result.winner || (rh > ra ? 'home' : 'away')
  const pickWinner   = pick.winner  || (ph > pa ? 'home' : pa > ph ? 'away' : null)
  return pickWinner && pickWinner === actualWinner ? scoring.result : 0
}

export function calcTotals(picks = {}, results = {}) {
  let pts = 0, correct = 0, exact = 0

  GROUP_MATCHES.forEach(m => {
    const p = picks[m.id]
    const r = results[m.id]
    if (p && r) {
      const v = calcMatchPoints(p, r, 'group')
      pts += v
      if (v >= GROUP_SCORING.result) correct++
      if (v >= GROUP_SCORING.exact)  exact++
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
    }
  })

  return { pts, correct, exact }
}
