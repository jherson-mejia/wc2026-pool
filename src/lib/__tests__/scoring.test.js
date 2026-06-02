import { describe, it, expect } from 'vitest'
import { calcMatchPoints, calcTotals } from '@/lib/scoring'

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
    // pick: home wins (2-0), result: home wins (3-1) — no winner field
    expect(calcMatchPoints({ home: 2, away: 0 }, { home: 3, away: 1 }, 'r16')).toBe(3)
  })

  it('explicit pick.winner overrides score', () => {
    // score says draw (1-1) but winner=home (went to pens)
    expect(calcMatchPoints({ home: 1, away: 1, winner: 'home' }, { home: 1, away: 1, winner: 'home' }, 'qf')).toBe(10)
  })

  it('unknown roundId → 0pts', () => {
    expect(calcMatchPoints({ home: 1, away: 0 }, { home: 1, away: 0 }, 'unknown')).toBe(0)
  })
})

// ── calcTotals ────────────────────────────────────────────────

describe('calcTotals', () => {
  it('empty picks + results → 0/0/0', () => {
    expect(calcTotals({}, {})).toEqual({ pts: 0, correct: 0, exact: 0 })
  })

  it('no overlap between picks and results → 0/0/0', () => {
    expect(calcTotals({ GA_1: { home: 1, away: 0 } }, {})).toEqual({ pts: 0, correct: 0, exact: 0 })
  })

  it('one exact group pick', () => {
    const picks   = { GA_1: { home: 2, away: 1 } }
    const results = { GA_1: { home: 2, away: 1 } }
    expect(calcTotals(picks, results)).toEqual({ pts: 3, correct: 1, exact: 1 })
  })

  it('one correct (non-exact) group pick', () => {
    const picks   = { GA_1: { home: 3, away: 1 } }
    const results = { GA_1: { home: 1, away: 0 } }
    expect(calcTotals(picks, results)).toEqual({ pts: 1, correct: 1, exact: 0 })
  })

  it('one wrong group pick', () => {
    const picks   = { GA_1: { home: 0, away: 2 } }
    const results = { GA_1: { home: 2, away: 0 } }
    expect(calcTotals(picks, results)).toEqual({ pts: 0, correct: 0, exact: 0 })
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
    expect(calcTotals(picks, results)).toEqual({ pts: 4, correct: 2, exact: 1 })
  })

  it('knockout pick included in totals', () => {
    const picks   = { r16_1: { home: 1, away: 0 } }
    const results = { r16_1: { home: 1, away: 0, winner: 'home' } }
    // exact r16 = 7pts
    expect(calcTotals(picks, results)).toEqual({ pts: 7, correct: 1, exact: 1 })
  })

  it('undefined picks/results default to empty', () => {
    expect(calcTotals(undefined, undefined)).toEqual({ pts: 0, correct: 0, exact: 0 })
  })
})
