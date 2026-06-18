import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalizeTeamName, mapSquadPlayers, syncRosters } from '../rosters.js'

describe('normalizeTeamName', () => {
  it('maps known aliases', () => {
    expect(normalizeTeamName('Korea Republic')).toBe('South Korea')
    expect(normalizeTeamName('USA')).toBe('United States')
    expect(normalizeTeamName("Côte d'Ivoire")).toBe('Ivory Coast')
    expect(normalizeTeamName('Türkiye')).toBe('Turkey')
    expect(normalizeTeamName('IR Iran')).toBe('Iran')
    expect(normalizeTeamName('Czechia')).toBe('Czech Republic')
    expect(normalizeTeamName('Curacao')).toBe('Curaçao')
  })

  it('passes canonical names through unchanged', () => {
    expect(normalizeTeamName('Mexico')).toBe('Mexico')
    expect(normalizeTeamName('Brazil')).toBe('Brazil')
    expect(normalizeTeamName('France')).toBe('France')
    expect(normalizeTeamName('South Korea')).toBe('South Korea')
  })
})

describe('mapSquadPlayers', () => {
  it('maps FD squad array to player objects', () => {
    const squad = [
      { id: 1, name: 'Player One', position: 'Goalkeeper', shirtNumber: 1 },
      { id: 2, name: 'Player Two', position: 'Midfielder', shirtNumber: 8 },
    ]
    const result = mapSquadPlayers(squad)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: 1, name: 'Player One', position: 'Goalkeeper', shirtNumber: 1 })
    expect(result[1]).toEqual({ id: 2, name: 'Player Two', position: 'Midfielder', shirtNumber: 8 })
  })

  it('handles null/undefined/empty squad', () => {
    expect(mapSquadPlayers(null)).toEqual([])
    expect(mapSquadPlayers(undefined)).toEqual([])
    expect(mapSquadPlayers([])).toEqual([])
  })

  it('fills missing optional fields with null', () => {
    const result = mapSquadPlayers([{ id: 5, name: 'Player Five' }])
    expect(result[0]).toEqual({ id: 5, name: 'Player Five', position: null, shirtNumber: null })
  })
})

describe('syncRosters', () => {
  function makeMockSupabase() {
    const upserts = {}
    const makeBuilder = table => {
      const b = {
        select: vi.fn(() => b),
        upsert: vi.fn(row => {
          ;(upserts[table] ??= []).push(row)
          return Promise.resolve({ error: null })
        }),
        then: res => Promise.resolve({ data: [], error: null }).then(res),
      }
      return b
    }
    return { from: vi.fn(t => makeBuilder(t)), _upserts: upserts }
  }

  const makeTeamsResponse  = teams  => ({ ok: true, status: 200, json: async () => ({ teams }) })
  const makeSquadResponse  = squad  => ({ ok: true, status: 200, json: async () => ({ squad }) })

  const SAMPLE_SQUAD = [{ id: 100, name: 'G. Ochoa', position: 'Goalkeeper', shirtNumber: 13 }]

  beforeEach(() => vi.clearAllMocks())

  it('upserts mapped teams and calls broadcastFn', async () => {
    const broadcastFn = vi.fn()
    const supabase = makeMockSupabase()
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeTeamsResponse([{ id: 9, name: 'Mexico' }, { id: 3, name: 'USA' }]))
      .mockResolvedValueOnce(makeSquadResponse(SAMPLE_SQUAD))
      .mockResolvedValueOnce(makeSquadResponse(SAMPLE_SQUAD))

    const result = await syncRosters({ supabase, apiKey: 'test', broadcastFn, delayMs: 0 })

    expect(result.synced).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(broadcastFn).toHaveBeenCalledWith('team_rosters', expect.any(Object))
  })

  it('skips and logs unmapped FD team names', async () => {
    const broadcastFn = vi.fn()
    const supabase = makeMockSupabase()
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeTeamsResponse([{ id: 99, name: 'SomeUnknownFC' }]))

    const result = await syncRosters({ supabase, apiKey: 'test', broadcastFn, delayMs: 0 })

    expect(result.synced).toBe(0)
    expect(result.skipped).toBe(1)
    expect(broadcastFn).toHaveBeenCalled()
  })

  it('does not crash on empty squad', async () => {
    const broadcastFn = vi.fn()
    const supabase = makeMockSupabase()
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeTeamsResponse([{ id: 9, name: 'Mexico' }]))
      .mockResolvedValueOnce(makeSquadResponse([]))

    const result = await syncRosters({ supabase, apiKey: 'test', broadcastFn, delayMs: 0 })

    expect(result.synced).toBe(1)
    expect(broadcastFn).toHaveBeenCalled()
  })

  it('normalizes team names before lookup', async () => {
    const broadcastFn = vi.fn()
    const supabase = makeMockSupabase()
    global.fetch = vi.fn()
      .mockResolvedValueOnce(makeTeamsResponse([{ id: 3, name: 'USA' }]))
      .mockResolvedValueOnce(makeSquadResponse(SAMPLE_SQUAD))

    const result = await syncRosters({ supabase, apiKey: 'test', broadcastFn, delayMs: 0 })

    expect(result.synced).toBe(1)
    const upserted = supabase._upserts['team_rosters']?.[0]
    expect(upserted?.team_name).toBe('United States')
    expect(upserted?.fd_team_id).toBe(3)
  })
})
