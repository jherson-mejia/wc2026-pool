import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fmtKickoff } from '@/lib/utils'

function setNow(iso) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

afterEach(() => vi.useRealTimers())

describe('fmtKickoff', () => {
  it('null → null', () => {
    expect(fmtKickoff(null)).toBeNull()
  })

  it('undefined → null', () => {
    expect(fmtKickoff(undefined)).toBeNull()
  })

  it('future match → not live, not past', () => {
    setNow('2026-06-11T10:00:00Z')
    const result = fmtKickoff('2026-06-11T18:00:00Z')
    expect(result.isLive).toBe(false)
    expect(result.isPast).toBe(false)
    expect(result.isToday).toBe(true)
    expect(result.hoursUntil).toBe(8)
  })

  it('match just kicked off → isLive', () => {
    setNow('2026-06-11T18:05:00Z')
    const result = fmtKickoff('2026-06-11T18:00:00Z')
    expect(result.isLive).toBe(true)
    expect(result.isPast).toBe(false)
  })

  it('match 90 min in → still live', () => {
    setNow('2026-06-11T19:30:00Z')
    const result = fmtKickoff('2026-06-11T18:00:00Z')
    expect(result.isLive).toBe(true)
  })

  it('match 111 min after kickoff → past (not live)', () => {
    setNow('2026-06-11T19:51:00Z')
    const result = fmtKickoff('2026-06-11T18:00:00Z')
    expect(result.isLive).toBe(false)
    expect(result.isPast).toBe(true)
  })

  it('today label', () => {
    setNow('2026-06-11T10:00:00Z')
    const result = fmtKickoff('2026-06-11T18:00:00Z')
    expect(result.day).toBe('Today')
    expect(result.isToday).toBe(true)
    expect(result.isTomorrow).toBe(false)
  })

  it('tomorrow label', () => {
    setNow('2026-06-11T10:00:00Z')
    const result = fmtKickoff('2026-06-12T18:00:00Z')
    expect(result.day).toBe('Tomorrow')
    expect(result.isTomorrow).toBe(true)
    expect(result.isToday).toBe(false)
  })

  it('other date → formatted string', () => {
    setNow('2026-06-11T10:00:00Z')
    const result = fmtKickoff('2026-06-20T18:00:00Z')
    expect(result.isToday).toBe(false)
    expect(result.isTomorrow).toBe(false)
    expect(result.day).toMatch(/\w+, \w+ \d+/)
  })

  it('returns time string', () => {
    setNow('2026-06-11T10:00:00Z')
    const result = fmtKickoff('2026-06-11T18:00:00Z')
    expect(typeof result.time).toBe('string')
    expect(result.time.length).toBeGreaterThan(0)
  })

  it('returns date object', () => {
    setNow('2026-06-11T10:00:00Z')
    const result = fmtKickoff('2026-06-11T18:00:00Z')
    expect(result.date).toBeInstanceOf(Date)
  })
})
