import { useState, useEffect } from 'react'
import { RefreshCw, Calendar, Globe } from 'lucide-react'
import { getFlag } from '@/data/worldcup'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import TopScorers from '@/components/TopScorers'

// ── Team name normalization ───────────────────────────────────
const TEAM_NAME_MAP = {
  'Korea Republic': 'South Korea',
  "Côte d'Ivoire": 'Ivory Coast',
  'Ivory Coast': 'Ivory Coast',
  'Türkiye': 'Turkey',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Cabo Verde': 'Cape Verde',
  'Congo DR': 'DR Congo',
  'Democratic Republic of Congo': 'DR Congo',
  'USA': 'United States',
  'United States of America': 'United States',
  'Czech Republic': 'Czech Republic',
  'Czechia': 'Czech Republic',
  'IR Iran': 'Iran',
  'Curacao': 'Curaçao',
}
const normalize = n => TEAM_NAME_MAP[n] ?? n

// ── Shared skeleton / error / empty ──────────────────────────
function Skeletons() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 rounded-xl border border-[#32312D] animate-pulse" />
      ))}
    </div>
  )
}

function ErrorState({ msg, onRetry }) {
  return (
    <div className="rounded-xl border border-[#32312D] bg-[#32312D]/20 px-4 py-5 flex items-center justify-between gap-3">
      <p className="text-xs text-[#807D73]">{msg}</p>
      <button onClick={onRetry} className="text-xs text-[#FFD706] hover:underline flex items-center gap-1 shrink-0">
        <RefreshCw className="h-3 w-3" /> Retry
      </button>
    </div>
  )
}

function EmptyState({ icon: Icon, msg }) {
  return (
    <div className="py-16 text-center text-[#807D73]">
      <Icon className="h-8 w-8 mx-auto mb-3 opacity-40" />
      <p className="text-sm">{msg}</p>
    </div>
  )
}

// ── Date divider ─────────────────────────────────────────────
function DateDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-[#32312D]" />
      <span className="text-[11px] text-[#807D73] uppercase tracking-[0.12em] shrink-0">{label}</span>
      <div className="flex-1 h-px bg-[#32312D]" />
    </div>
  )
}

// ── Stage label map ───────────────────────────────────────────
const STAGE_MAP = {
  GROUP_STAGE: null, // handled separately
  ROUND_OF_32: 'R32',
  ROUND_OF_16: 'R16',
  QUARTER_FINALS: 'QF',
  SEMI_FINALS: 'SF',
  THIRD_PLACE: '3rd',
  FINAL: 'Final',
}

function stageLabel(match) {
  if (match.stage === 'GROUP_STAGE') {
    const g = match.group?.replace('GROUP_', '') ?? ''
    return g ? `Group ${g}` : 'Group Stage'
  }
  return STAGE_MAP[match.stage] ?? match.stage ?? ''
}

function shortDate(utcStr) {
  return new Date(utcStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function localDateKey(utcStr) {
  const d = new Date(utcStr)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function relativeDate(utcStr) {
  const d = new Date(utcStr)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, tomorrow)) return 'Tomorrow'
  return shortDate(utcStr)
}

function localTime(utcStr) {
  return new Date(utcStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── GroupsTab ─────────────────────────────────────────────────
const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L']

function GroupsTab() {
  const [standings, setStandings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeGroup, setActiveGroup] = useState('A')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/football-data/competitions/WC/standings?season=2026')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `API ${res.status}`)
      // filter TOTAL type only
      const total = (json.standings ?? []).filter(s => s.type === 'TOTAL')
      setStandings(total)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return <Skeletons />
  if (error) return <ErrorState msg={error} onRetry={load} />
  if (!standings?.length) return <EmptyState icon={Globe} msg="No standings available yet" />

  // Build map: group letter → table rows
  const groupMap = {}
  for (const s of standings) {
    const letter = s.group?.replace('GROUP_', '') ?? ''
    if (letter) groupMap[letter] = s.table ?? []
  }

  const availableGroups = GROUP_LETTERS.filter(g => groupMap[g])
  const currentLetter = availableGroups.includes(activeGroup) ? activeGroup : availableGroups[0] ?? 'A'
  const rows = groupMap[currentLetter] ?? []

  return (
    <div>
      {/* Group selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none mb-4">
        {availableGroups.map(g => (
          <button
            key={g}
            onClick={() => setActiveGroup(g)}
            className={cn(
              'shrink-0 w-9 h-9 rounded-lg text-sm font-bold transition-all border',
              g === currentLetter
                ? 'bg-[#FFD706] text-[#0D0D0B] border-[#FFD706]'
                : 'bg-transparent text-[#807D73] border-[#32312D] hover:text-[#FFFDF2] hover:border-[#FFFDF2]/30'
            )}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#32312D] overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-3 px-3 py-2 bg-[#32312D]/40 text-[10px] text-[#807D73] uppercase tracking-wider">
          <span>Team</span>
          <span className="text-center w-6">P</span>
          <span className="text-center w-6">W</span>
          <span className="text-center w-6">D</span>
          <span className="text-center w-6">L</span>
          <span className="text-center w-8">GD</span>
          <span className="text-center w-8">Pts</span>
        </div>

        {rows.map((row, i) => {
          const name = normalize(row.team?.name ?? '')
          const flag = getFlag(name)
          const gd = row.goalDifference ?? 0
          const advances = i < 2

          return (
            <div
              key={row.team?.id ?? i}
              className={cn(
                'grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-3 px-3 py-2.5 items-center border-t border-[#32312D] transition-all',
                advances
                  ? 'border-l-2 border-l-[#FFD706]/60 bg-[#FFD706]/5'
                  : 'border-l-2 border-l-transparent'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-[#807D73] w-3 shrink-0">{row.position}</span>
                <span className="text-base leading-none shrink-0">{flag}</span>
                <span className="text-xs font-semibold text-[#FFFDF2] truncate">{name}</span>
              </div>
              <span className="text-xs text-[#FFFDF2] text-center w-6 tabular-nums">{row.playedGames}</span>
              <span className="text-xs text-[#FFFDF2] text-center w-6 tabular-nums">{row.won}</span>
              <span className="text-xs text-[#FFFDF2] text-center w-6 tabular-nums">{row.draw}</span>
              <span className="text-xs text-[#FFFDF2] text-center w-6 tabular-nums">{row.lost}</span>
              <span className={cn(
                'text-xs font-semibold text-center w-8 tabular-nums',
                gd > 0 ? 'text-green-400' : gd < 0 ? 'text-red-400' : 'text-[#807D73]'
              )}>
                {gd > 0 ? `+${gd}` : gd}
              </span>
              <span className="text-xs font-extrabold text-center w-8 tabular-nums text-[#FFD706]">{row.points}</span>
            </div>
          )
        })}
      </div>
      {rows.length > 0 && (
        <p className="text-[10px] text-[#807D73] mt-2 pl-1">Top 2 advance · highlighted in yellow</p>
      )}
    </div>
  )
}

// ── ResultsTab ────────────────────────────────────────────────
function ResultsTab() {
  const [matches, setMatches] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/football-data/competitions/WC/matches?season=2026&status=FINISHED')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `API ${res.status}`)
      const sorted = (json.matches ?? []).sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
      setMatches(sorted.slice(0, 20))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return <Skeletons />
  if (error) return <ErrorState msg={error} onRetry={load} />
  if (!matches?.length) return <EmptyState icon={Calendar} msg="No results yet" />

  // group by date
  const groups = []
  let lastKey = null
  for (const m of matches) {
    const key = localDateKey(m.utcDate)
    if (key !== lastKey) {
      groups.push({ key, label: shortDate(m.utcDate), items: [] })
      lastKey = key
    }
    groups[groups.length - 1].items.push(m)
  }

  return (
    <div>
      {groups.map(({ key, label, items }) => (
        <div key={key}>
          <DateDivider label={label} />
          <div className="space-y-1.5">
            {items.map((m, i) => {
              const home = normalize(m.homeTeam?.name ?? '')
              const away = normalize(m.awayTeam?.name ?? '')
              const homeFlag = getFlag(home)
              const awayFlag = getFlag(away)
              const hs = m.score?.fullTime?.home ?? 0
              const as_ = m.score?.fullTime?.away ?? 0
              const winner = m.score?.winner

              return (
                <div key={m.id ?? i} className="flex items-center gap-2 rounded-xl border border-[#32312D] bg-[#32312D]/20 px-3 py-2.5">
                  {/* Home */}
                  <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                    <span className={cn(
                      'text-xs truncate text-right',
                      winner === 'HOME_TEAM' ? 'font-bold text-[#FFFDF2]' : 'text-[#807D73]'
                    )}>{home}</span>
                    <span className="text-base leading-none shrink-0">{homeFlag}</span>
                  </div>

                  {/* Score */}
                  <div className="text-sm font-extrabold text-[#FFFDF2] tabular-nums shrink-0 text-center w-16">
                    {hs} – {as_}
                  </div>

                  {/* Away */}
                  <div className="flex items-center gap-1.5 flex-1 justify-start min-w-0">
                    <span className="text-base leading-none shrink-0">{awayFlag}</span>
                    <span className={cn(
                      'text-xs truncate',
                      winner === 'AWAY_TEAM' ? 'font-bold text-[#FFFDF2]' : 'text-[#807D73]'
                    )}>{away}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── ScheduleTab ───────────────────────────────────────────────
function ScheduleTab() {
  const [matches, setMatches] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/football-data/competitions/WC/matches?season=2026')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `API ${res.status}`)
      const upcoming = (json.matches ?? [])
        .filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED')
        .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
        .slice(0, 20)
      setMatches(upcoming)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return <Skeletons />
  if (error) return <ErrorState msg={error} onRetry={load} />
  if (!matches?.length) return <EmptyState icon={Calendar} msg="No upcoming matches" />

  // group by date
  const groups = []
  let lastKey = null
  for (const m of matches) {
    const key = localDateKey(m.utcDate)
    if (key !== lastKey) {
      groups.push({ key, label: relativeDate(m.utcDate), items: [] })
      lastKey = key
    }
    groups[groups.length - 1].items.push(m)
  }

  return (
    <div>
      {groups.map(({ key, label, items }) => (
        <div key={key}>
          <DateDivider label={label} />
          <div className="space-y-1.5">
            {items.map((m, i) => {
              const home = normalize(m.homeTeam?.name ?? '')
              const away = normalize(m.awayTeam?.name ?? '')
              const homeFlag = getFlag(home)
              const awayFlag = getFlag(away)
              const sl = stageLabel(m)

              return (
                <div key={m.id ?? i} className="flex items-center gap-2 rounded-xl border border-[#32312D] bg-[#32312D]/20 px-3 py-2.5">
                  {/* Time */}
                  <div className="text-[11px] text-[#807D73] shrink-0 w-16 tabular-nums">{localTime(m.utcDate)}</div>

                  {/* Home */}
                  <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                    <span className="text-xs font-semibold text-[#FFFDF2] truncate text-right">{home}</span>
                    <span className="text-base leading-none shrink-0">{homeFlag}</span>
                  </div>

                  {/* vs */}
                  <div className="text-[11px] text-[#807D73] shrink-0 w-6 text-center">vs</div>

                  {/* Away */}
                  <div className="flex items-center gap-1.5 flex-1 justify-start min-w-0">
                    <span className="text-base leading-none shrink-0">{awayFlag}</span>
                    <span className="text-xs font-semibold text-[#FFFDF2] truncate">{away}</span>
                  </div>

                  {/* Stage */}
                  {sl && (
                    <div className="shrink-0 text-[10px] text-[#807D73] bg-[#32312D] border border-[#32312D] rounded-full px-2 py-0.5 leading-none whitespace-nowrap">
                      {sl}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tournament page ───────────────────────────────────────────
export default function Tournament() {
  return (
    <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-3xl font-extrabold text-[#FFFDF2] tracking-tight mb-5">Tournament</h1>
      <Tabs defaultValue="groups">
        <TabsList className="mb-1 flex-wrap">
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="scorers">Scorers</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>
        <TabsContent value="groups"><GroupsTab /></TabsContent>
        <TabsContent value="scorers"><TopScorers /></TabsContent>
        <TabsContent value="results"><ResultsTab /></TabsContent>
        <TabsContent value="schedule"><ScheduleTab /></TabsContent>
      </Tabs>
    </div>
  )
}
