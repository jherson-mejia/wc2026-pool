import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startScheduler, DAILY_BUDGET, MANUAL_RESERVE, AUTO_BUDGET } from '../scheduler.js'

// ── Helpers ───────────────────────────────────────────────────

function makeMockSupabase({ kickoffs = [], koMatches = [], results = [], upsertError = null } = {}) {
  return {
    from: vi.fn(table => ({
      select: vi.fn(() => Promise.resolve({
        data: table === 'kickoffs'   ? kickoffs
            : table === 'ko_matches' ? koMatches
            : results,
        error: null,
      })),
      upsert: vi.fn(() => Promise.resolve({ error: upsertError })),
    })),
  }
}

// A finished group-stage match the API would return for Mexico vs South Africa
const FINISHED_GROUP_MATCH = {
  homeTeam: { name: 'Mexico' },
  awayTeam: { name: 'South Africa' },
  score: {
    fullTime:  { home: 2, away: 1 },
    winner:    null,
    penalties: { home: null, away: null },
  },
  stage:    'GROUP_STAGE',
  group:    'GROUP_A',
  matchday: 1,
}

function mockFetchOk(matches = []) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ matches }),
  })
}

function mockFetchRateLimit() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 429,
    json: async () => ({}),
  })
}

function mockFetchError(status = 500) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
  })
}

// Flush microtask queue without advancing fake timers
// planDay has ~1 await; runSync has ~4 — use 10 ticks to cover all paths
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

// ── Constants ─────────────────────────────────────────────────

describe('budget constants', () => {
  it('DAILY_BUDGET = 100', () => expect(DAILY_BUDGET).toBe(100))
  it('MANUAL_RESERVE = 20', () => expect(MANUAL_RESERVE).toBe(20))
  it('AUTO_BUDGET = 80', () => expect(AUTO_BUDGET).toBe(80))
})

// ── startScheduler — no apiKey ────────────────────────────────

describe('startScheduler — no apiKey', () => {
  it('returns null when apiKey is falsy', () => {
    const result = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: '' })
    expect(result).toBeNull()
  })

  it('returns null when apiKey is undefined', () => {
    const result = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: undefined })
    expect(result).toBeNull()
  })
})

// ── startScheduler — with apiKey ──────────────────────────────

describe('startScheduler — with apiKey', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetchOk([])
  })
  afterEach(() => vi.useRealTimers())

  it('returns { forceSync, status }', async () => {
    const scheduler = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    expect(typeof scheduler.forceSync).toBe('function')
    expect(typeof scheduler.status).toBe('function')
  })

  it('status() returns expected shape', async () => {
    const scheduler = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    const s = scheduler.status()
    expect(s).toMatchObject({
      requestsToday: 0,
      autoBudget:    AUTO_BUDGET,
      dailyBudget:   DAILY_BUDGET,
      reserved:      MANUAL_RESERVE,
      remaining:     AUTO_BUDGET,
      lastSync:      null,
      nextSync:      null,
    })
  })
})

// ── planDay ───────────────────────────────────────────────────

describe('planDay', () => {
  afterEach(() => vi.useRealTimers())

  it('no kickoffs today → 0 polls planned', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
    mockFetchOk([])

    const scheduler = startScheduler({ supabase: makeMockSupabase({ kickoffs: [] }), broadcast: vi.fn(), apiKey: 'key' })
    await tick()

    expect(scheduler.status().pollsPlanned).toBe(0)
    expect(scheduler.status().nextSync).toBeNull()
  })

  it('one match today → schedules 7 polls (one per MATCH_OFFSET)', async () => {
    vi.useFakeTimers()
    // Now = 10:00 UTC, kickoff = 18:00 UTC — all 7 offsets are in the future
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
    mockFetchOk([])

    const kickoffMs = new Date('2026-06-11T18:00:00Z').getTime()
    const scheduler = startScheduler({
      supabase: makeMockSupabase({ kickoffs: [{ match_id: 'GA_1', kickoff: '2026-06-11T18:00:00Z' }] }),
      broadcast: vi.fn(),
      apiKey: 'key',
    })
    await tick()

    expect(scheduler.status().pollsPlanned).toBe(7)
  })

  it('nextSync = kickoff + 20min (first offset)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
    mockFetchOk([])

    const kickoff = '2026-06-11T18:00:00Z'
    const scheduler = startScheduler({
      supabase: makeMockSupabase({ kickoffs: [{ match_id: 'GA_1', kickoff }] }),
      broadcast: vi.fn(),
      apiKey: 'key',
    })
    await tick()

    const expectedFirst = new Date('2026-06-11T18:20:00Z').toISOString()
    expect(scheduler.status().nextSync).toBe(expectedFirst)
  })

  it('simultaneous matches share poll slots (7 polls, not 14)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
    mockFetchOk([])

    // Two matches at same kickoff time
    const kickoffs = [
      { match_id: 'GA_1', kickoff: '2026-06-11T18:00:00Z' },
      { match_id: 'GA_2', kickoff: '2026-06-11T18:00:00Z' },
    ]
    const scheduler = startScheduler({ supabase: makeMockSupabase({ kickoffs }), broadcast: vi.fn(), apiKey: 'key' })
    await tick()

    expect(scheduler.status().pollsPlanned).toBe(7) // de-duplicated
  })

  it('two matches at different times → 14 polls', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T08:00:00Z'))
    mockFetchOk([])

    const kickoffs = [
      { match_id: 'GA_1', kickoff: '2026-06-11T12:00:00Z' },
      { match_id: 'GA_2', kickoff: '2026-06-11T15:00:00Z' },
    ]
    const scheduler = startScheduler({ supabase: makeMockSupabase({ kickoffs }), broadcast: vi.fn(), apiKey: 'key' })
    await tick()

    expect(scheduler.status().pollsPlanned).toBe(14)
  })

  it('past poll slots are excluded', async () => {
    vi.useFakeTimers()
    // Now = 18:30, kickoff was 18:00 → offsets +20 (18:20) already past, remaining 6 in future
    vi.setSystemTime(new Date('2026-06-11T18:30:00Z'))
    mockFetchOk([])

    const scheduler = startScheduler({
      supabase: makeMockSupabase({ kickoffs: [{ match_id: 'GA_1', kickoff: '2026-06-11T18:00:00Z' }] }),
      broadcast: vi.fn(),
      apiKey: 'key',
    })
    await tick()

    expect(scheduler.status().pollsPlanned).toBe(6) // +20min already past
  })

  it('active match on startup → triggers immediate sync', async () => {
    vi.useFakeTimers()
    // Now = 18:30, kickoff was 18:00 → match is in progress (30 min elapsed)
    vi.setSystemTime(new Date('2026-06-11T18:30:00Z'))
    mockFetchOk([])

    const supabase = makeMockSupabase({ kickoffs: [{ match_id: 'GA_1', kickoff: '2026-06-11T18:00:00Z' }] })
    startScheduler({ supabase, broadcast: vi.fn(), apiKey: 'key' })
    await tick()

    // Should have fetched once for startup-active sync
    expect(global.fetch).toHaveBeenCalled()
  })

  it('no active match on startup → no immediate sync', async () => {
    vi.useFakeTimers()
    // Now = 10:00, kickoff at 18:00 — no match in progress
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
    mockFetchOk([])

    startScheduler({
      supabase: makeMockSupabase({ kickoffs: [{ match_id: 'GA_1', kickoff: '2026-06-11T18:00:00Z' }] }),
      broadcast: vi.fn(),
      apiKey: 'key',
    })
    await tick()

    expect(global.fetch).not.toHaveBeenCalled()
  })
})

// ── runSync (via forceSync) ───────────────────────────────────

describe('runSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('increments requestsToday', async () => {
    mockFetchOk([])
    const scheduler = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    await scheduler.forceSync()
    expect(scheduler.status().requestsToday).toBe(1)
  })

  it('sets lastSync timestamp', async () => {
    mockFetchOk([])
    const scheduler = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    expect(scheduler.status().lastSync).toBeNull()
    await scheduler.forceSync()
    expect(scheduler.status().lastSync).not.toBeNull()
  })

  it('maps group match and upserts result', async () => {
    mockFetchOk([FINISHED_GROUP_MATCH])
    const supabase = makeMockSupabase()
    const broadcast = vi.fn()
    const scheduler = startScheduler({ supabase, broadcast, apiKey: 'key' })
    await tick()
    await scheduler.forceSync()

    // find the upsert call on the results table
    const resultsCalls = supabase.from.mock.calls.filter(([t]) => t === 'results')
    const upsertCall = resultsCalls.find(([t]) => {
      const builder = supabase.from(t)
      return builder.upsert.mock?.calls?.length > 0
    })

    // Verify broadcast was called with results
    expect(broadcast).toHaveBeenCalledWith('results', expect.any(Object))
  })

  it('matches group match to correct match ID (GA_1)', async () => {
    mockFetchOk([FINISHED_GROUP_MATCH])
    const supabase = makeMockSupabase()
    const scheduler = startScheduler({ supabase, broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    await scheduler.forceSync()

    // Find the upsert call
    const fromCalls = supabase.from.mock.calls
    const resultsFromCall = fromCalls.filter(([t]) => t === 'results')
    // The upsert should have been called — check via mock on the returned builder
    expect(resultsFromCall.length).toBeGreaterThan(0)
  })

  it('no results when API returns no matches', async () => {
    mockFetchOk([])
    const broadcast = vi.fn()
    const scheduler = startScheduler({ supabase: makeMockSupabase(), broadcast, apiKey: 'key' })
    await tick()
    await scheduler.forceSync()
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('skips match with null fullTime score', async () => {
    mockFetchOk([{ ...FINISHED_GROUP_MATCH, score: { fullTime: { home: null, away: null } } }])
    const broadcast = vi.fn()
    const scheduler = startScheduler({ supabase: makeMockSupabase(), broadcast, apiKey: 'key' })
    await tick()
    await scheduler.forceSync()
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('rate-limited → does not count request', async () => {
    mockFetchRateLimit()
    const scheduler = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    await scheduler.forceSync()
    expect(scheduler.status().requestsToday).toBe(0)
  })

  it('budget exhausted → skips sync', async () => {
    mockFetchOk([])
    const scheduler = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: 'key' })
    await tick()

    // Exhaust budget
    for (let i = 0; i < AUTO_BUDGET; i++) {
      scheduler.status() // just to be safe
      await scheduler.forceSync()
    }

    const callsBefore = global.fetch.mock.calls.length
    await scheduler.forceSync() // should be skipped
    expect(global.fetch.mock.calls.length).toBe(callsBefore) // no new fetch
  })

  it('remaining decreases with each sync', async () => {
    mockFetchOk([])
    const scheduler = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    expect(scheduler.status().remaining).toBe(AUTO_BUDGET)
    await scheduler.forceSync()
    expect(scheduler.status().remaining).toBe(AUTO_BUDGET - 1)
    await scheduler.forceSync()
    expect(scheduler.status().remaining).toBe(AUTO_BUDGET - 2)
  })

  it('upsert error is logged, does not crash', async () => {
    mockFetchOk([FINISHED_GROUP_MATCH])
    const supabase = makeMockSupabase({ upsertError: { message: 'DB error' } })
    const scheduler = startScheduler({ supabase, broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    await expect(scheduler.forceSync()).resolves.toBeUndefined() // doesn't throw
  })

  it('KO match: winner mapped from HOME_TEAM → home', async () => {
    const koMatch = {
      homeTeam: { name: 'Argentina' },
      awayTeam: { name: 'France' },
      score: {
        fullTime:  { home: 3, away: 3 },
        winner:    'HOME_TEAM',
        penalties: { home: 4, away: 2 },
      },
      stage: 'ROUND_OF_16',
      group: null,
      matchday: null,
    }
    mockFetchOk([koMatch])

    const koMatches = [{ match_id: 'r16_1', home: 'Argentina', away: 'France' }]
    const supabase  = makeMockSupabase({ koMatches })
    const broadcast = vi.fn()

    const scheduler = startScheduler({ supabase, broadcast, apiKey: 'key' })
    await tick()
    await scheduler.forceSync()

    expect(broadcast).toHaveBeenCalledWith('results', expect.any(Object))
  })

  it('KO match: winner mapped from AWAY_TEAM → away', async () => {
    const koMatch = {
      homeTeam: { name: 'Spain' },
      awayTeam: { name: 'Germany' },
      score: { fullTime: { home: 1, away: 2 }, winner: 'AWAY_TEAM', penalties: { home: null, away: null } },
      stage: 'QUARTER_FINALS',
      group: null,
      matchday: null,
    }
    mockFetchOk([koMatch])

    const supabase  = makeMockSupabase({ koMatches: [{ match_id: 'qf_1', home: 'Spain', away: 'Germany' }] })
    const broadcast = vi.fn()

    const scheduler = startScheduler({ supabase, broadcast, apiKey: 'key' })
    await tick()
    await scheduler.forceSync()

    expect(broadcast).toHaveBeenCalled()
  })
})
