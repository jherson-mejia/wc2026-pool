import { useState, useEffect } from 'react'
import { Target, RefreshCw } from 'lucide-react'
import { getFlag } from '@/data/worldcup'
import { cachedFetch } from '@/lib/apiCache'
import { cn } from '@/lib/utils'

const TEAM_NAME_MAP = {
  'Korea Republic':               'South Korea',
  "Côte d'Ivoire":                'Ivory Coast',
  'Ivory Coast':                  'Ivory Coast',
  'Türkiye':                      'Turkey',
  'Bosnia-Herzegovina':           'Bosnia and Herzegovina',
  'Cabo Verde':                   'Cape Verde',
  'Congo DR':                     'DR Congo',
  'Democratic Republic of Congo': 'DR Congo',
  'USA':                          'United States',
  'United States of America':     'United States',
  'Czech Republic':               'Czech Republic',
  'Czechia':                      'Czech Republic',
  'IR Iran':                      'Iran',
  'Curacao':                      'Curaçao',
}
const normalize = n => TEAM_NAME_MAP[n] ?? n

const MEDALS = ['🥇', '🥈', '🥉']
const LIMIT  = 10

export default function TopScorers() {
  const [scorers, setScorers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const json = await cachedFetch(
        'scorers-2026',
        `/api/football-data/competitions/WC/scorers?season=2026&limit=${LIMIT}`,
        30 * 60 * 1000,
      )
      setScorers(json.scorers ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl border border-th-border bg-th-border/20 animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-th-border bg-th-border/20 px-4 py-5 flex items-center justify-between gap-3">
        <p className="text-xs text-th-muted">{error}</p>
        <button onClick={load} className="text-xs text-[#FFD706] hover:underline flex items-center gap-1 shrink-0">
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    )
  }

  if (!scorers?.length) {
    return (
      <div className="rounded-xl border border-th-border bg-th-border/20 px-4 py-8 text-center">
        <Target className="h-7 w-7 text-th-subtle mx-auto mb-2" />
        <p className="text-sm text-th-muted">No goals scored yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {scorers.map((s, i) => {
        const team     = normalize(s.team?.name ?? '')
        const flag     = getFlag(team)
        const goals    = s.goals ?? 0
        const assists  = s.assists ?? 0
        const pens     = s.penalties ?? 0

        return (
          <div key={s.player?.id ?? i} className={cn(
            'flex items-center gap-3 rounded-xl border px-3 sm:px-4 py-3 transition-all',
            i === 0 ? 'border-[#FFD706]/30 bg-[#FFD706]/5'
            : i === 1 ? 'border-[#A0A0A0]/20 bg-[#A0A0A0]/5'
            : i === 2 ? 'border-[#CD7F32]/20 bg-[#CD7F32]/5'
            : 'border-th-border bg-th-border/20 hover:bg-th-border/40',
          )}>
            {/* Rank */}
            <div className="w-6 text-center shrink-0">
              {i < 3
                ? <span className="text-base sm:text-lg">{MEDALS[i]}</span>
                : <span className="text-xs font-bold text-th-muted tabular-nums">{i + 1}</span>}
            </div>

            {/* Flag + player + team */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-base sm:text-lg leading-none shrink-0">{flag}</span>
                <span className="text-sm sm:text-base font-semibold text-th-text truncate">{s.player?.name}</span>
              </div>
              <div className="text-[10px] sm:text-xs text-th-muted mt-0.5 truncate">{team}</div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
              <div className="text-center">
                <div className={cn('text-xl sm:text-2xl font-extrabold tabular-nums leading-none',
                  i === 0 ? 'text-[#FFD706]' : 'text-th-text'
                )}>{goals}</div>
                <div className="text-[9px] sm:text-[10px] text-th-muted uppercase tracking-wider mt-0.5">Goals</div>
              </div>
              {assists > 0 && (
                <div className="text-center hidden sm:block">
                  <div className="text-base font-bold text-th-muted tabular-nums leading-none">{assists}</div>
                  <div className="text-[9px] text-th-muted uppercase tracking-wider mt-0.5">Ast</div>
                </div>
              )}
              {pens > 0 && (
                <div className="text-center hidden sm:block">
                  <div className="text-base font-bold text-th-muted tabular-nums leading-none">{pens}</div>
                  <div className="text-[9px] text-th-muted uppercase tracking-wider mt-0.5">Pens</div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
