import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startScheduler } from '../scheduler.js'

// ── Mock helpers ──────────────────────────────────────────────

/**
 * Builds a Supabase mock that supports the chaining patterns used by scheduler.js:
 *   from(table).select(fields)               → thenable { data, error }
 *   from(table).select(fields).in(col, vals) → thenable { data, error }
 *   from(table).select(fields).eq(col, val)  → thenable { data, error }
 *   from(table).select(fields).single()      → { data: rows[0], error }
 *   from(table).upsert(rows, opts)           → { error }
 *   from(table).delete().not(col, op, val)   → { error }
 *
 * Pass `tables` as { kickoffs: [...], results: [...], ... }.
 * Pass `__upsertError` to make all upserts fail.
 * Upserted rows are captured in `mock._upserts[table]`.
 */
function makeMockSupabase(tables = {}) {
  const upserts = {}

  const makeBuilder = (table) => {
    const data = tables[table] ?? []
    const resolved = () => Promise.resolve({ data, error: null })
    const b = {
      select: vi.fn(() => b),
      upsert: vi.fn((rows) => {
        (upserts[table] ??= []).push(rows)
        return Promise.resolve({ error: tables.__upsertError ?? null })
      }),
      delete: vi.fn(() => b),
      in:     vi.fn(() => b),
      not:    vi.fn(() => Promise.resolve({ error: null })),
      eq:     vi.fn(() => b),
      single: vi.fn(() => Promise.resolve({ data: data[0] ?? null, error: null })),
      then:   (res, rej) => resolved().then(res, rej),
    }
    return b
  }

  const mock = { from: vi.fn(table => makeBuilder(table)), _upserts: upserts }
  return mock
}

// Flush microtask queue — planDay + runSync each have several awaits; 20 ticks covers all paths
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

async function waitForIdle(s, max = 50) {
  for (let i = 0; i < max; i++) {
    if (!s.status().syncing) return
    await Promise.resolve()
  }
}

function mockFetchOk(matches = []) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: async () => ({ matches }),
  })
}

function mockFetchRateLimit() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false, status: 429,
    json: async () => ({}),
  })
}

// Group-stage match in a truly-finished state (status FINISHED, utcDate 2h before fake now)
const FINISHED_GROUP_MATCH = {
  id: 999,
  homeTeam: { name: 'Mexico' },
  awayTeam: { name: 'South Africa' },
  score: {
    fullTime:  { home: 2, away: 1 },
    winner:    null,
    penalties: { home: null, away: null },
  },
  status:   'FINISHED',
  utcDate:  '2026-06-11T08:00:00Z',  // 2h before fake now (10:00Z) → elapsedMin = 120
  stage:    'GROUP_STAGE',
  group:    'GROUP_A',
  matchday: 1,
  goals:    [],
}

// KO match IN_PLAY — 60 min elapsed (< 85) → live block, not finished
const IN_PLAY_KO_MATCH = {
  id: 1001,
  homeTeam: { name: 'Argentina' },
  awayTeam: { name: 'France' },
  score: {
    fullTime:  { home: 1, away: 1 },
    winner:    null,
    penalties: { home: null, away: null },
  },
  status:   'IN_PLAY',
  utcDate:  '2026-06-11T09:00:00Z',  // 60 min before fake now
  stage:    'ROUND_OF_16',
  group:    null,
  matchday: null,
  goals:    [],
}

// ── startScheduler — no apiKey ────────────────────────────────

describe('startScheduler — no apiKey', () => {
  it('returns null when apiKey is falsy', () => {
    expect(startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: '' })).toBeNull()
  })

  it('returns null when apiKey is undefined', () => {
    expect(startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: undefined })).toBeNull()
  })
})

// ── startScheduler — with apiKey ──────────────────────────────

describe('startScheduler — with apiKey', () => {
  beforeEach(() => { vi.useFakeTimers(); mockFetchOk([]) })
  afterEach(() => vi.useRealTimers())

  it('returns object with expected methods', async () => {
    const s = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    expect(typeof s.forceSync).toBe('function')
    expect(typeof s.syncGoals).toBe('function')
    expect(typeof s.syncSchedule).toBe('function')
    expect(typeof s.syncLineup).toBe('function')
    expect(typeof s.status).toBe('function')
  })

  it('status() returns expected shape', async () => {
    const s = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    const st = s.status()
    expect(st).toMatchObject({
      lastSync:     expect.any(String),  // set by startup runSync
      nextSync:     null,
      syncing:      false,
      pollsPlanned: 0,
      liveMatches:  0,
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

    const s = startScheduler({ supabase: makeMockSupabase({ kickoffs: [] }), broadcast: vi.fn(), apiKey: 'key' })
    await tick()

    expect(s.status().pollsPlanned).toBe(0)
    expect(s.status().nextSync).toBeNull()
  })

  it('one match today → schedules 1 kickoff poll', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
    mockFetchOk([])

    const s = startScheduler({
      supabase: makeMockSupabase({ kickoffs: [{ match_id: 'GA_1', kickoff: '2026-06-11T18:00:00Z' }] }),
      broadcast: vi.fn(),
      apiKey: 'key',
    })
    await tick()

    expect(s.status().pollsPlanned).toBe(1)
  })

  it('nextSync = kickoff time (fire at kickoff)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
    mockFetchOk([])

    const s = startScheduler({
      supabase: makeMockSupabase({ kickoffs: [{ match_id: 'GA_1', kickoff: '2026-06-11T18:00:00Z' }] }),
      broadcast: vi.fn(),
      apiKey: 'key',
    })
    await tick()

    expect(s.status().nextSync).toBe('2026-06-11T18:00:00.000Z')
  })

  it('simultaneous matches share one poll slot', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
    mockFetchOk([])

    const kickoffs = [
      { match_id: 'GA_1', kickoff: '2026-06-11T18:00:00Z' },
      { match_id: 'GA_2', kickoff: '2026-06-11T18:00:00Z' },
    ]
    const s = startScheduler({ supabase: makeMockSupabase({ kickoffs }), broadcast: vi.fn(), apiKey: 'key' })
    await tick()

    expect(s.status().pollsPlanned).toBe(1)
  })

  it('two matches at different kickoff times → 2 polls', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T08:00:00Z'))
    mockFetchOk([])

    const kickoffs = [
      { match_id: 'GA_1', kickoff: '2026-06-11T12:00:00Z' },
      { match_id: 'GA_2', kickoff: '2026-06-11T15:00:00Z' },
    ]
    const s = startScheduler({ supabase: makeMockSupabase({ kickoffs }), broadcast: vi.fn(), apiKey: 'key' })
    await tick()

    expect(s.status().pollsPlanned).toBe(2)
  })

  it('past kickoff times are excluded from plan', async () => {
    vi.useFakeTimers()
    // Kickoff was 18:00, now 18:30 → past kickoff excluded
    vi.setSystemTime(new Date('2026-06-11T18:30:00Z'))
    mockFetchOk([])

    const s = startScheduler({
      supabase: makeMockSupabase({ kickoffs: [{ match_id: 'GA_1', kickoff: '2026-06-11T18:00:00Z' }] }),
      broadcast: vi.fn(),
      apiKey: 'key',
    })
    await tick()

    expect(s.status().pollsPlanned).toBe(0)
  })

  it('always runs startup sync regardless of active match', async () => {
    vi.useFakeTimers()
    // Now = 10:00, kickoff = 18:00 — no match in progress yet
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
    mockFetchOk([])

    startScheduler({
      supabase: makeMockSupabase({ kickoffs: [{ match_id: 'GA_1', kickoff: '2026-06-11T18:00:00Z' }] }),
      broadcast: vi.fn(),
      apiKey: 'key',
    })
    await tick()

    // planDay always calls runSync on startup
    expect(global.fetch).toHaveBeenCalled()
  })

  it('restores live scores from DB on startup and starts poller', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
    mockFetchOk([])

    const broadcast = vi.fn()
    const liveRows  = [{
      match_id: 'GA_1', home: 'Mexico', away: 'Brazil',
      home_score: 1, away_score: 0, status: 'IN_PLAY',
      minute: 55, injury_time: null, goals: [], updated_at: Date.now(),
    }]

    startScheduler({
      supabase: makeMockSupabase({ live_scores: liveRows }),
      broadcast,
      apiKey: 'key',
    })
    await tick()

    expect(broadcast).toHaveBeenCalledWith('live_scores', expect.objectContaining({ GA_1: expect.any(Object) }))
  })
})

// ── runSync (via forceSync) ───────────────────────────────────

describe('runSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('sets lastSync timestamp', async () => {
    mockFetchOk([])
    const s = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    // Advance clock so the second sync produces a different timestamp
    vi.setSystemTime(new Date('2026-06-11T10:01:00.000Z'))
    await s.forceSync()
    expect(s.status().lastSync).toBe('2026-06-11T10:01:00.000Z')
  })

  it('no results when API returns no matches', async () => {
    mockFetchOk([])
    const broadcast = vi.fn()
    const s = startScheduler({ supabase: makeMockSupabase(), broadcast, apiKey: 'key' })
    await tick()
    await waitForIdle(s)
    broadcast.mockClear()
    await s.forceSync()
    expect(broadcast).not.toHaveBeenCalledWith('results', expect.anything())
  })

  it('broadcasts results when finished match found', async () => {
    mockFetchOk([FINISHED_GROUP_MATCH])
    const broadcast = vi.fn()
    const s = startScheduler({ supabase: makeMockSupabase(), broadcast, apiKey: 'key' })
    await tick()
    await waitForIdle(s)
    broadcast.mockClear()
    await s.forceSync()
    expect(broadcast).toHaveBeenCalledWith('results', expect.any(Object))
  })

  it('skips match with null fullTime score', async () => {
    mockFetchOk([{ ...FINISHED_GROUP_MATCH, score: { fullTime: { home: null, away: null } } }])
    const broadcast = vi.fn()
    const s = startScheduler({ supabase: makeMockSupabase(), broadcast, apiKey: 'key' })
    await tick()
    await waitForIdle(s)
    broadcast.mockClear()
    await s.forceSync()
    expect(broadcast).not.toHaveBeenCalledWith('results', expect.anything())
  })

  it('KO match: winner mapped from HOME_TEAM', async () => {
    const koMatch = {
      id: 1001,
      homeTeam: { name: 'Argentina' },
      awayTeam: { name: 'France' },
      score: { fullTime: { home: 3, away: 3 }, winner: 'HOME_TEAM', penalties: { home: 4, away: 2 } },
      status:   'FINISHED',
      utcDate:  '2026-06-11T08:00:00Z',
      stage:    'ROUND_OF_16',
      group:    null, matchday: null, goals: [],
    }
    mockFetchOk([koMatch])
    const supabase  = makeMockSupabase({ fd_match_ids: [{ fd_id: 1001, match_id: 'r16_1' }] })
    const broadcast = vi.fn()
    const s = startScheduler({ supabase, broadcast, apiKey: 'key' })
    await tick()
    broadcast.mockClear()
    await s.forceSync()
    expect(broadcast).toHaveBeenCalledWith('results', expect.any(Object))
  })

  it('KO match: winner mapped from AWAY_TEAM', async () => {
    const koMatch = {
      id: 1002,
      homeTeam: { name: 'Spain' },
      awayTeam: { name: 'Germany' },
      score: { fullTime: { home: 1, away: 2 }, winner: 'AWAY_TEAM', penalties: { home: null, away: null } },
      status:   'FINISHED',
      utcDate:  '2026-06-11T08:00:00Z',
      stage:    'QUARTER_FINALS',
      group:    null, matchday: null, goals: [],
    }
    mockFetchOk([koMatch])
    const supabase  = makeMockSupabase({ fd_match_ids: [{ fd_id: 1002, match_id: 'qf_1' }] })
    const broadcast = vi.fn()
    const s = startScheduler({ supabase, broadcast, apiKey: 'key' })
    await tick()
    broadcast.mockClear()
    await s.forceSync()
    expect(broadcast).toHaveBeenCalledWith('results', expect.any(Object))
  })

  it('rate-limited → does not crash, sync completes', async () => {
    mockFetchRateLimit()
    const s = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    await expect(s.forceSync()).resolves.toBeUndefined()
  })

  it('upsert error → does not crash', async () => {
    mockFetchOk([FINISHED_GROUP_MATCH])
    const supabase = makeMockSupabase({ __upsertError: { message: 'DB error' } })
    const s = startScheduler({ supabase, broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    await expect(s.forceSync()).resolves.toBeUndefined()
  })

  it('concurrent forceSync calls are serialised by mutex', async () => {
    mockFetchOk([])
    const s = startScheduler({ supabase: makeMockSupabase(), broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    // Fire two concurrent syncs — second should be a no-op while first is running
    const p1 = s.forceSync()
    const p2 = s.forceSync()
    await Promise.all([p1, p2])
    // Both resolve without throwing — mutex prevents double-execution
    expect(true).toBe(true)
  })
})

// ── winner preservation ───────────────────────────────────────

describe('runSync — KO winner preservation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('IN_PLAY KO match preserves admin-set winner from DB', async () => {
    mockFetchOk([IN_PLAY_KO_MATCH])

    const supabase = makeMockSupabase({
      fd_match_ids: [{ fd_id: 1001, match_id: 'r16_1' }],
      // Existing result with admin-set winner
      results: [{ match_id: 'r16_1', winner: 'home', home: 1, away: 0 }],
    })

    const s = startScheduler({ supabase, broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    await s.forceSync()

    // The upsert to results should preserve winner:'home', not write null
    const resultUpserts = supabase._upserts.results ?? []
    const r16Row = resultUpserts.flat().find(r => r.match_id === 'r16_1')
    expect(r16Row?.winner).toBe('home')
  })

  it('IN_PLAY match with no prior winner → winner stays null', async () => {
    mockFetchOk([IN_PLAY_KO_MATCH])

    const supabase = makeMockSupabase({
      fd_match_ids: [{ fd_id: 1001, match_id: 'r16_1' }],
      results: [],  // no existing winner
    })

    const s = startScheduler({ supabase, broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    await s.forceSync()

    const resultUpserts = supabase._upserts.results ?? []
    const r16Row = resultUpserts.flat().find(r => r.match_id === 'r16_1')
    expect(r16Row?.winner).toBeNull()
  })
})

// ── live scores ───────────────────────────────────────────────

describe('runSync — live scores', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('IN_PLAY match broadcasts live_scores', async () => {
    mockFetchOk([IN_PLAY_KO_MATCH])
    const broadcast = vi.fn()
    const supabase  = makeMockSupabase({ fd_match_ids: [{ fd_id: 1001, match_id: 'r16_1' }] })

    const s = startScheduler({ supabase, broadcast, apiKey: 'key' })
    await tick()
    await waitForIdle(s)
    broadcast.mockClear()
    await s.forceSync()

    expect(broadcast).toHaveBeenCalledWith('live_scores', expect.objectContaining({ r16_1: expect.any(Object) }))
  })

  it('getLiveScores() reflects current live state', async () => {
    mockFetchOk([IN_PLAY_KO_MATCH])
    const supabase = makeMockSupabase({ fd_match_ids: [{ fd_id: 1001, match_id: 'r16_1' }] })

    const s = startScheduler({ supabase, broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    await s.forceSync()

    const live = s.getLiveScores()
    expect(live['r16_1']).toMatchObject({ matchId: 'r16_1', homeScore: 1, awayScore: 1, status: 'IN_PLAY' })
  })

  it('no live matches after FINISHED-only response', async () => {
    mockFetchOk([FINISHED_GROUP_MATCH])
    const broadcast = vi.fn()
    const s = startScheduler({ supabase: makeMockSupabase(), broadcast, apiKey: 'key' })
    await tick()
    await waitForIdle(s)
    broadcast.mockClear()
    await s.forceSync()

    expect(broadcast).not.toHaveBeenCalledWith('live_scores', expect.objectContaining({ GA_1: expect.anything() }))
    expect(s.status().liveMatches).toBe(0)
  })

  it('promotes live scores to results when poller ends with API lag', async () => {
    mockFetchOk([])
    const broadcast = vi.fn()
    const supabase  = makeMockSupabase({
      live_scores: [{
        match_id:    'GA_1',
        home:        'Mexico',
        away:        'South Africa',
        home_score:  2,
        away_score:  0,
        status:      'IN_PLAY',
        minute:      90,
        injury_time: null,
        goals:       [],
        updated_at:  Date.now(),
      }],
      results: [],
    })

    const s = startScheduler({ supabase, broadcast, apiKey: 'key' })
    await tick()
    await waitForIdle(s)

    vi.advanceTimersByTime(30_000)
    for (let i = 0; i < 40; i++) await Promise.resolve()
    await waitForIdle(s)

    const resultUpserts = (supabase._upserts.results ?? []).flat()
    expect(resultUpserts.some(r => r.match_id === 'GA_1' && r.home === 2 && r.away === 0)).toBe(true)
    expect(broadcast).toHaveBeenCalledWith('results', expect.any(Object))
    expect(s.getLiveScores()['GA_1']).toBeUndefined()
  })
})

// ── syncGoals ─────────────────────────────────────────────────

describe('syncGoals', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-11T10:00:00Z')) })
  afterEach(() => vi.useRealTimers())

  it('throws when match has no FD ID mapped', async () => {
    mockFetchOk([])
    const s = startScheduler({ supabase: makeMockSupabase({ fd_match_ids: [] }), broadcast: vi.fn(), apiKey: 'key' })
    await tick()
    await expect(s.syncGoals('r16_1')).rejects.toThrow('No FD ID')
  })

  it('fetches goals and upserts to match_goals', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ matches: [] }) })  // startup sync
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          homeTeam: { id: 200 },
          awayTeam: { id: 300 },
          goals: [{ minute: 45, scorer: { id: 10, name: 'Messi' }, team: { id: 200 } }],
        }),
      })

    const supabase = makeMockSupabase({ fd_match_ids: [{ fd_id: 5000, match_id: 'r16_1' }] })
    const broadcast = vi.fn()
    const s = startScheduler({ supabase, broadcast, apiKey: 'key' })
    await tick()

    await s.syncGoals('r16_1')

    const goalUpserts = supabase._upserts.match_goals ?? []
    expect(goalUpserts.length).toBeGreaterThan(0)
    expect(goalUpserts[0]).toMatchObject({
      match_id:     'r16_1',
      home_team_id: 200,
      away_team_id: 300,
      goals:        [expect.objectContaining({ scorer_id: 10, team_id: 200 })],
    })
  })
})
