import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch before importing the module so the module-level cache is fresh per test
let cachedFetch
let invalidate

beforeEach(async () => {
  vi.resetModules()
  global.fetch = vi.fn()
  const mod = await import('@/lib/apiCache')
  cachedFetch = mod.cachedFetch
  invalidate = mod.invalidate
})

function mockOk(data) {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => data,
  })
}

function mockFail(status, body = {}) {
  global.fetch.mockResolvedValue({
    ok: false,
    status,
    json: async () => body,
  })
}

describe('cachedFetch', () => {
  it('fetches and returns data on cache miss', async () => {
    mockOk({ hello: 'world' })
    const result = await cachedFetch('k1', '/api/test')
    expect(result).toEqual({ hello: 'world' })
    expect(global.fetch).toHaveBeenCalledOnce()
  })

  it('returns cached data within TTL without re-fetching', async () => {
    mockOk({ v: 1 })
    await cachedFetch('k2', '/api/test', 60_000)
    await cachedFetch('k2', '/api/test', 60_000)
    expect(global.fetch).toHaveBeenCalledOnce()
  })

  it('re-fetches after TTL expires', async () => {
    vi.useFakeTimers()
    mockOk({ v: 1 })
    await cachedFetch('k3', '/api/test', 1_000)
    vi.advanceTimersByTime(2_000)
    mockOk({ v: 2 })
    const result = await cachedFetch('k3', '/api/test', 1_000)
    expect(result).toEqual({ v: 2 })
    expect(global.fetch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('throws on non-ok response', async () => {
    mockFail(429, { error: 'rate limited' })
    await expect(cachedFetch('k4', '/api/test')).rejects.toThrow('rate limited')
  })

  it('throws with status fallback when no error field', async () => {
    mockFail(500, {})
    await expect(cachedFetch('k5', '/api/test')).rejects.toThrow('API 500')
  })

  it('does not cache failed responses', async () => {
    mockFail(500, { error: 'oops' })
    await expect(cachedFetch('k6', '/api/test')).rejects.toThrow()
    mockOk({ ok: true })
    const result = await cachedFetch('k6', '/api/test')
    expect(result).toEqual({ ok: true })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('different keys are cached independently', async () => {
    mockOk({ a: 1 })
    await cachedFetch('keyA', '/api/a')
    mockOk({ b: 2 })
    const b = await cachedFetch('keyB', '/api/b')
    expect(b).toEqual({ b: 2 })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})

describe('invalidate', () => {
  it('forces re-fetch after invalidation', async () => {
    mockOk({ v: 1 })
    await cachedFetch('kInv', '/api/test', 60_000)
    invalidate('kInv')
    mockOk({ v: 2 })
    const result = await cachedFetch('kInv', '/api/test', 60_000)
    expect(result).toEqual({ v: 2 })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('invalidating unknown key is a no-op', () => {
    expect(() => invalidate('nonexistent')).not.toThrow()
  })
})
