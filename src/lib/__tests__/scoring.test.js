import { describe, it, expect } from 'vitest'
import { calcMatchPoints, calcScorerPoints, calcTotals } from '@/lib/scoring'

// ── calcMatchPoints — group stage ─────────────────────────────

describe('calcMatchPoints — group stage', () => {
  it('exact score → 3pts', () => {
    expect(calcMatchPoints({ home: 2, away: 1 }, { home: 2, away: 1 }, 'group')).toBe(3)
  })

  it('exact 0–0 → 3pts', () => {
    expect(calcMatchPoints({ home: 0, away: 0 }, { home: 0, away: 0 }, 'group')).toBe(3)
  })

  it('correct result (home win) → 1pt', () => {
    expect(calcMatchPoints({ home: 3, away: 1 }, { home: 1, away: 0 }, 'group')).toBe(1)
  })

  it('correct result (away win) → 1pt', () => {
    expect(calcMatchPoints({ home: 0, away: 2 }, { home: 1, away: 3 }, 'group')).toBe(1)
  })

  it('correct result (draw) → 1pt', () => {
    expect(calcMatchPoints({ home: 1, away: 1 }, { home: 2, away: 2 }, 'group')).toBe(1)
  })

  it('wrong result → 0pts', () => {
    expect(calcMatchPoints({ home: 2, away: 0 }, { home: 1, away: 2 }, 'group')).toBe(0)
  })

  it('picked draw, result home win → 0pts', () => {
    expect(calcMatchPoints({ home: 1, away: 1 }, { home: 2, away: 0 }, 'group')).toBe(0)
  })

  it('null pick → 0pts', () => {
    expect(calcMatchPoints(null, { home: 1, away: 0 }, 'group')).toBe(0)
  })

  it('null result → 0pts', () => {
    expect(calcMatchPoints({ home: 1, away: 0 }, null, 'group')).toBe(0)
  })

  it('pick with null scores → 0pts', () => {
    expect(calcMatchPoints({ home: null, away: null }, { home: 1, away: 0 }, 'group')).toBe(0)
  })

  it('string numbers coerced correctly', () => {
    expect(calcMatchPoints({ home: '2', away: '1' }, { home: 2, away: 1 }, 'group')).toBe(3)
  })
})

// ── calcMatchPoints — knockout rounds ────────────────────────

describe('calcMatchPoints — knockout rounds', () => {
  const rounds = ['r32', 'r16', 'qf', 'sf', 'final']
  const scoring = { r32: { result: 2, exact: 5 }, r16: { result: 3, exact: 7 }, qf: { result: 5, exact: 10 }, sf: { result: 8, exact: 15 }, final: { result: 12, exact: 22 } }

  rounds.forEach(rid => {
    it(`${rid}: exact score → ${scoring[rid].exact}pts`, () => {
      expect(calcMatchPoints({ home: 1, away: 0 }, { home: 1, away: 0, winner: 'home' }, rid)).toBe(scoring[rid].exact)
    })

    it(`${rid}: correct winner, wrong score → ${scoring[rid].result}pts`, () => {
      expect(calcMatchPoints({ home: 2, away: 0 }, { home: 1, away: 0, winner: 'home' }, rid)).toBe(scoring[rid].result)
    })

    it(`${rid}: wrong winner → 0pts`, () => {
      expect(calcMatchPoints({ home: 0, away: 1 }, { home: 1, away: 0, winner: 'home' }, rid)).toBe(0)
    })
  })

  it('winner derived from score when winner field absent', () => {
    expect(calcMatchPoints({ home: 2, away: 0 }, { home: 3, away: 1 }, 'r16')).toBe(3)
  })

  it('explicit pick.winner overrides score (pens scenario)', () => {
    expect(calcMatchPoints({ home: 1, away: 1, winner: 'home' }, { home: 1, away: 1, winner: 'home' }, 'qf')).toBe(10)
  })

  it('unknown roundId → 0pts', () => {
    expect(calcMatchPoints({ home: 1, away: 0 }, { home: 1, away: 0 }, 'unknown')).toBe(0)
  })
})

// ── calcScorerPoints ──────────────────────────────────────────

describe('calcScorerPoints', () => {
  const goals = [
    { scorer_id: '10', team_id: '200' },
    { scorer_id: '7',  team_id: '300' },
  ]
  const matchGoals = {
    homeTeamId: '200',
    awayTeamId: '300',
    goals,
  }
  const lineup = { homeTeamId: '200', awayTeamId: '300' }

  it('null scorerPick → 0', () => {
    expect(calcScorerPoints(null, matchGoals, lineup)).toBe(0)
  })

  it('null matchGoals → 0', () => {
    expect(calcScorerPoints({ team: 'home', playerId: '10' }, null, lineup)).toBe(0)
  })

  it('matchGoals with no goals array → 0', () => {
    expect(calcScorerPoints({ team: 'home', playerId: '10' }, { homeTeamId: '200' }, lineup)).toBe(0)
  })

  it('scorer matches home goal → 1', () => {
    expect(calcScorerPoints({ team: 'home', playerId: '10' }, matchGoals, lineup)).toBe(1)
  })

  it('scorer matches away goal → 1', () => {
    expect(calcScorerPoints({ team: 'away', playerId: '7' }, matchGoals, lineup)).toBe(1)
  })

  it('scorer in goals but wrong team side → 0', () => {
    // player 10 scored for team 200 (home), but pick says away
    expect(calcScorerPoints({ team: 'away', playerId: '10' }, matchGoals, lineup)).toBe(0)
  })

  it('scorer not in goals → 0', () => {
    expect(calcScorerPoints({ team: 'home', playerId: '99' }, matchGoals, lineup)).toBe(0)
  })

  it('scorer_id type coercion: numeric id matches string pick', () => {
    const mg = { homeTeamId: '200', awayTeamId: '300', goals: [{ scorer_id: 10, team_id: 200 }] }
    expect(calcScorerPoints({ team: 'home', playerId: '10' }, mg, lineup)).toBe(1)
  })

  it('matchGoals.homeTeamId null → falls back to lineup.homeTeamId', () => {
    const mg = { homeTeamId: null, awayTeamId: null, goals }
    expect(calcScorerPoints({ team: 'home', playerId: '10' }, mg, lineup)).toBe(1)
  })

  it('matchGoals.awayTeamId null → falls back to lineup.awayTeamId', () => {
    const mg = { homeTeamId: null, awayTeamId: null, goals }
    expect(calcScorerPoints({ team: 'away', playerId: '7' }, mg, lineup)).toBe(1)
  })

  it('both matchGoals and lineup teamId null → 0', () => {
    const mg = { homeTeamId: null, awayTeamId: null, goals }
    expect(calcScorerPoints({ team: 'home', playerId: '10' }, mg, null)).toBe(0)
  })
})

// ── calcTotals ────────────────────────────────────────────────

describe('calcTotals', () => {
  it('empty picks + results → 0/0/0/0', () => {
    expect(calcTotals({}, {})).toEqual({ pts: 0, correct: 0, exact: 0, scorers: 0 })
  })

  it('no overlap between picks and results → 0/0/0/0', () => {
    expect(calcTotals({ GA_1: { home: 1, away: 0 } }, {})).toEqual({ pts: 0, correct: 0, exact: 0, scorers: 0 })
  })

  it('one exact group pick', () => {
    const picks   = { GA_1: { home: 2, away: 1 } }
    const results = { GA_1: { home: 2, away: 1 } }
    expect(calcTotals(picks, results)).toEqual({ pts: 3, correct: 1, exact: 1, scorers: 0 })
  })

  it('one correct (non-exact) group pick', () => {
    const picks   = { GA_1: { home: 3, away: 1 } }
    const results = { GA_1: { home: 1, away: 0 } }
    expect(calcTotals(picks, results)).toEqual({ pts: 1, correct: 1, exact: 0, scorers: 0 })
  })

  it('one wrong group pick', () => {
    const picks   = { GA_1: { home: 0, away: 2 } }
    const results = { GA_1: { home: 2, away: 0 } }
    expect(calcTotals(picks, results)).toEqual({ pts: 0, correct: 0, exact: 0, scorers: 0 })
  })

  it('mix of exact, correct, wrong group picks sums correctly', () => {
    const picks = {
      GA_1: { home: 2, away: 1 }, // exact → 3pts
      GA_2: { home: 3, away: 0 }, // correct winner → 1pt
      GA_3: { home: 0, away: 2 }, // wrong → 0pts
    }
    const results = {
      GA_1: { home: 2, away: 1 },
      GA_2: { home: 1, away: 0 },
      GA_3: { home: 2, away: 0 },
    }
    expect(calcTotals(picks, results)).toEqual({ pts: 4, correct: 2, exact: 1, scorers: 0 })
  })

  it('knockout pick included in totals', () => {
    const picks   = { r16_1: { home: 1, away: 0 } }
    const results = { r16_1: { home: 1, away: 0, winner: 'home' } }
    // exact r16 = 7pts
    expect(calcTotals(picks, results)).toEqual({ pts: 7, correct: 1, exact: 1, scorers: 0 })
  })

  it('undefined picks/results default to empty', () => {
    expect(calcTotals(undefined, undefined)).toEqual({ pts: 0, correct: 0, exact: 0, scorers: 0 })
  })
})

// ── calcTotals — scorer integration ──────────────────────────

describe('calcTotals — scorer picks', () => {
  const matchGoals = {
    GA_1: {
      homeTeamId: '200',
      awayTeamId: '300',
      goals: [{ scorer_id: '10', team_id: '200' }],
    },
  }
  const lineups = {
    GA_1: { homeTeamId: '200', awayTeamId: '300' },
  }

  it('correct scorer pick adds 1pt and scorers count', () => {
    const scorerPicks = { GA_1_home: { team: 'home', playerId: '10' } }
    const result = calcTotals({}, {}, scorerPicks, matchGoals, lineups)
    expect(result).toEqual({ pts: 1, correct: 0, exact: 0, scorers: 1 })
  })

  it('wrong scorer pick adds 0pts', () => {
    const scorerPicks = { GA_1_home: { team: 'home', playerId: '99' } }
    const result = calcTotals({}, {}, scorerPicks, matchGoals, lineups)
    expect(result).toEqual({ pts: 0, correct: 0, exact: 0, scorers: 0 })
  })

  it('scorer pts add on top of match pts', () => {
    const picks       = { GA_1: { home: 2, away: 1 } }
    const results     = { GA_1: { home: 2, away: 1 } }
    const scorerPicks = { GA_1_home: { team: 'home', playerId: '10' } }
    // exact group = 3pts + scorer = 1pt
    const result = calcTotals(picks, results, scorerPicks, matchGoals, lineups)
    expect(result).toEqual({ pts: 4, correct: 1, exact: 1, scorers: 1 })
  })

  it('scorer pts via lineup fallback when matchGoals teamId is null', () => {
    const mg = {
      GA_1: {
        homeTeamId: null,
        awayTeamId: null,
        goals: [{ scorer_id: '10', team_id: '200' }],
      },
    }
    const scorerPicks = { GA_1_home: { team: 'home', playerId: '10' } }
    const result = calcTotals({}, {}, scorerPicks, mg, lineups)
    expect(result).toEqual({ pts: 1, correct: 0, exact: 0, scorers: 1 })
  })

  it('no matchGoals data → 0 scorer pts', () => {
    const scorerPicks = { GA_1_home: { team: 'home', playerId: '10' } }
    const result = calcTotals({}, {}, scorerPicks, {}, lineups)
    expect(result).toEqual({ pts: 0, correct: 0, exact: 0, scorers: 0 })
  })
})
