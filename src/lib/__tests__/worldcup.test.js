import { describe, it, expect } from 'vitest'
import { GROUPS, GROUP_MATCHES, KO_ROUNDS, GROUP_SCORING, getFlag } from '@/data/worldcup'

describe('GROUPS', () => {
  it('has 12 groups (A–L)', () => {
    expect(GROUPS).toHaveLength(12)
  })

  it('each group has exactly 4 teams', () => {
    GROUPS.forEach(g => {
      expect(g.teams).toHaveLength(4)
    })
  })

  it('group IDs are A through L', () => {
    const ids = GROUPS.map(g => g.id)
    expect(ids).toEqual(['A','B','C','D','E','F','G','H','I','J','K','L'])
  })

  it('no team appears in more than one group', () => {
    const all = GROUPS.flatMap(g => g.teams)
    const unique = new Set(all)
    expect(unique.size).toBe(all.length)
  })
})

describe('GROUP_MATCHES', () => {
  it('has 72 matches (12 groups × 6)', () => {
    expect(GROUP_MATCHES).toHaveLength(72)
  })

  it('every match has required fields', () => {
    GROUP_MATCHES.forEach(m => {
      expect(m.id).toBeTruthy()
      expect(m.home).toBeTruthy()
      expect(m.away).toBeTruthy()
      expect(m.group).toBeTruthy()
      expect([1, 2, 3]).toContain(m.matchday)
    })
  })

  it('no duplicate match IDs', () => {
    const ids = GROUP_MATCHES.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('home and away are never the same team', () => {
    GROUP_MATCHES.forEach(m => {
      expect(m.home).not.toBe(m.away)
    })
  })

  it('each group has exactly 6 matches', () => {
    const counts = {}
    GROUP_MATCHES.forEach(m => { counts[m.group] = (counts[m.group] ?? 0) + 1 })
    Object.values(counts).forEach(c => expect(c).toBe(6))
  })

  it('matchday 3 matches are marked simultaneous', () => {
    GROUP_MATCHES.filter(m => m.matchday === 3).forEach(m => {
      expect(m.simultaneous).toBe(true)
    })
  })

  it('matchday 1 and 2 matches are not simultaneous', () => {
    GROUP_MATCHES.filter(m => m.matchday !== 3).forEach(m => {
      expect(m.simultaneous).toBe(false)
    })
  })
})

describe('KO_ROUNDS', () => {
  it('has the correct rounds in order', () => {
    const ids = KO_ROUNDS.map(r => r.id)
    expect(ids).toEqual(['r32', 'r16', 'qf', 'sf', 'tp', 'final'])
  })

  it('each round has scoring with result < exact', () => {
    KO_ROUNDS.forEach(r => {
      expect(r.scoring.result).toBeGreaterThan(0)
      expect(r.scoring.exact).toBeGreaterThan(r.scoring.result)
    })
  })

  it('total KO matches = 32', () => {
    const total = KO_ROUNDS.reduce((s, r) => s + r.count, 0)
    expect(total).toBe(32)
  })

  it('scoring increases with round importance', () => {
    const pts = KO_ROUNDS.map(r => r.scoring.result)
    // r32(2) < r16(3) < qf(5) < sf(8), tp and final separate
    expect(pts[0]).toBeLessThan(pts[1])
    expect(pts[1]).toBeLessThan(pts[2])
    expect(pts[2]).toBeLessThan(pts[3])
  })
})

describe('GROUP_SCORING', () => {
  it('result = 1, exact = 3', () => {
    expect(GROUP_SCORING.result).toBe(1)
    expect(GROUP_SCORING.exact).toBe(3)
  })
})

describe('getFlag', () => {
  it('returns a flag emoji string for known teams', () => {
    const flag = getFlag('Mexico')
    expect(typeof flag).toBe('string')
    expect(flag.length).toBeGreaterThan(0)
  })

  it('returns empty string or fallback for unknown team', () => {
    const flag = getFlag('Narnia')
    expect(typeof flag).toBe('string')
  })

  it('handles null/undefined without throwing', () => {
    expect(() => getFlag(null)).not.toThrow()
    expect(() => getFlag(undefined)).not.toThrow()
  })
})
