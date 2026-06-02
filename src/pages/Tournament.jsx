import { useState, useEffect } from 'react'
import { RefreshCw, Calendar, Globe } from 'lucide-react'
import { getFlag, GROUP_MATCHES, GROUPS } from '@/data/worldcup'
import { useApp } from '@/context/AppContext'
import { cachedFetch } from '@/lib/apiCache'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import TopScorers from '@/components/TopScorers'
import Bracket from '@/components/Bracket'

// ── Team name normalization ───────────────────────────────────
const TEAM_NAME_MAP = {
  'Korea Republic': 'South Korea',
  "Côte d'Ivoire": 'Ivory Coast',
  'Ivory Coast': 'Ivory Coast',
  'Türkiye': 'Turkey',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Cabo Verde': 'Cape Verde',
  'Cape Verde Islands': 'Cape Verde',
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

// Map normalized team name → group letter (for pre-tournament flat API response)
const TEAM_TO_GROUP = {}
for (const g of GROUPS) {
  for (const t of g.teams) TEAM_TO_GROUP[t] = g.id
}

// ── GroupsTab — cached API call (30 min TTL) ──────────────────
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
      const json = await cachedFetch(
        'standings-2026',
        '/api/football-data/competitions/WC/standings?season=2026',
        30 * 60 * 1000,
      )
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

  const groupMap = {}
  let flatSplit = false
  for (const s of standings) {
    const letter = s.group?.replace('GROUP_', '') ?? ''
    if (letter) {
      groupMap[letter] = s.table ?? []
    } else {
      flatSplit = true
      for (const row of s.table ?? []) {
        const name = normalize(row.team?.name ?? '')
        const g = TEAM_TO_GROUP[name] ?? null
        if (g) {
          if (!groupMap[g]) groupMap[g] = []
          groupMap[g].push(row)
        }
      }
    }
  }
  // Re-index positions 1–4 within each group when built from a flat list
  if (flatSplit) {
    for (const rows of Object.values(groupMap)) {
      rows.forEach((row, i) => { row.position = i + 1 })
    }
  }

  const availableGroups = GROUP_LETTERS.filter(g => groupMap[g])
  const currentLetter = availableGroups.includes(activeGroup) ? activeGroup : availableGroups[0] ?? 'A'
  const rows = groupMap[currentLetter] ?? []

  return (
    <div>
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

      <div className="rounded-xl border border-[#32312D] overflow-x-auto">
       <div className="min-w-[380px]">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-3 px-4 py-2.5 bg-[#32312D]/40 text-xs text-[#807D73] uppercase tracking-wider font-semibold">
          <span>Team</span>
          <span className="text-center w-7">P</span>
          <span className="text-center w-7">W</span>
          <span className="text-center w-7">D</span>
          <span className="text-center w-7">L</span>
          <span className="text-center w-9">GD</span>
          <span className="text-center w-9">Pts</span>
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
                'grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-3 px-4 py-3 items-center border-t border-[#32312D] transition-all',
                advances ? 'border-l-2 border-l-[#FFD706]/60 bg-[#FFD706]/5' : 'border-l-2 border-l-transparent'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-sm text-[#807D73] w-4 shrink-0 tabular-nums">{row.position}</span>
                <span className="text-lg leading-none shrink-0">{flag}</span>
                <span className="text-sm font-semibold text-[#FFFDF2] truncate">{name}</span>
              </div>
              {(() => {
                const p = row.playedGames ?? 0
                if (p === 0) return (
                  <>
                    <span className="text-sm text-[#32312D] text-center w-7 tabular-nums">–</span>
                    <span className="text-sm text-[#32312D] text-center w-7 tabular-nums">–</span>
                    <span className="text-sm text-[#32312D] text-center w-7 tabular-nums">–</span>
                    <span className="text-sm text-[#32312D] text-center w-7 tabular-nums">–</span>
                    <span className="text-sm text-[#32312D] text-center w-9 tabular-nums">–</span>
                    <span className="text-sm text-[#32312D] text-center w-9 tabular-nums">–</span>
                  </>
                )
                return (
                  <>
                    <span className="text-sm text-[#FFFDF2] text-center w-7 tabular-nums">{p}</span>
                    <span className="text-sm text-[#FFFDF2] text-center w-7 tabular-nums">{row.won}</span>
                    <span className="text-sm text-[#FFFDF2] text-center w-7 tabular-nums">{row.draw}</span>
                    <span className="text-sm text-[#FFFDF2] text-center w-7 tabular-nums">{row.lost}</span>
                    <span className={cn(
                      'text-sm font-semibold text-center w-9 tabular-nums',
                      gd > 0 ? 'text-green-400' : gd < 0 ? 'text-red-400' : 'text-[#807D73]'
                    )}>
                      {gd > 0 ? `+${gd}` : gd}
                    </span>
                    <span className="text-sm font-extrabold text-center w-9 tabular-nums text-[#FFD706]">{row.points}</span>
                  </>
                )
              })()}
            </div>
          )
        })}
       </div>
      </div>
      {rows.length > 0 && (
        <p className="text-xs text-[#807D73] mt-2 pl-1">Top 2 advance · highlighted in yellow</p>
      )}
    </div>
  )
}

// ── ResultsTab — reads from Supabase via AppContext (no API) ──
function ResultsTab() {
  const { results, kickoffs } = useApp()

  const finished = GROUP_MATCHES
    .filter(m => results[m.id])
    .map(m => ({
      id: m.id,
      home: m.home,
      away: m.away,
      homeScore: results[m.id].home,
      awayScore: results[m.id].away,
      winner: results[m.id].winner,
      kickoff: kickoffs[m.id] ?? null,
      label: `Group ${m.group}`,
    }))
    .sort((a, b) => {
      if (a.kickoff && b.kickoff) return new Date(b.kickoff) - new Date(a.kickoff)
      return 0
    })

  if (!finished.length) return <EmptyState icon={Calendar} msg="No results yet" />

  const groups = []
  let lastKey = null
  for (const m of finished) {
    const key = m.kickoff ? localDateKey(m.kickoff) : '_'
    const label = m.kickoff ? shortDate(m.kickoff) : 'Unknown'
    if (key !== lastKey) {
      groups.push({ key, label, items: [] })
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
            {items.map(m => (
              <div key={m.id} className="flex items-center gap-2 rounded-xl border border-[#32312D] bg-[#32312D]/20 px-3 py-2.5">
                <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                  <span className={cn(
                    'text-xs truncate text-right',
                    m.winner === 'HOME_TEAM' ? 'font-bold text-[#FFFDF2]' : 'text-[#807D73]'
                  )}>{m.home}</span>
                  <span className="text-base leading-none shrink-0">{getFlag(m.home)}</span>
                </div>
                <div className="text-sm font-extrabold text-[#FFFDF2] tabular-nums shrink-0 text-center w-16">
                  {m.homeScore} – {m.awayScore}
                </div>
                <div className="flex items-center gap-1.5 flex-1 justify-start min-w-0">
                  <span className="text-base leading-none shrink-0">{getFlag(m.away)}</span>
                  <span className={cn(
                    'text-xs truncate',
                    m.winner === 'AWAY_TEAM' ? 'font-bold text-[#FFFDF2]' : 'text-[#807D73]'
                  )}>{m.away}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── ScheduleTab — reads from Supabase via AppContext (no API) ─
function ScheduleTab() {
  const { results, kickoffs } = useApp()
  const now = Date.now()

  const upcoming = GROUP_MATCHES
    .filter(m => !results[m.id] && kickoffs[m.id] && new Date(kickoffs[m.id]).getTime() > now)
    .map(m => ({
      id: m.id,
      home: m.home,
      away: m.away,
      kickoff: kickoffs[m.id],
      label: `Group ${m.group}`,
    }))
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
    .slice(0, 20)

  if (!upcoming.length) return <EmptyState icon={Calendar} msg="No upcoming group matches" />

  const groups = []
  let lastKey = null
  for (const m of upcoming) {
    const key = localDateKey(m.kickoff)
    if (key !== lastKey) {
      groups.push({ key, label: relativeDate(m.kickoff), items: [] })
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
            {items.map(m => (
              <div key={m.id} className="flex items-center gap-2 rounded-xl border border-[#32312D] bg-[#32312D]/20 px-3 py-2.5">
                <div className="text-[11px] text-[#807D73] shrink-0 w-16 tabular-nums">{localTime(m.kickoff)}</div>
                <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                  <span className="text-xs font-semibold text-[#FFFDF2] truncate text-right">{m.home}</span>
                  <span className="text-base leading-none shrink-0">{getFlag(m.home)}</span>
                </div>
                <div className="text-[11px] text-[#807D73] shrink-0 w-6 text-center">vs</div>
                <div className="flex items-center gap-1.5 flex-1 justify-start min-w-0">
                  <span className="text-base leading-none shrink-0">{getFlag(m.away)}</span>
                  <span className="text-xs font-semibold text-[#FFFDF2] truncate">{m.away}</span>
                </div>
                <div className="shrink-0 text-[10px] text-[#807D73] bg-[#32312D] border border-[#32312D] rounded-full px-2 py-0.5 leading-none whitespace-nowrap">
                  {m.label}
                </div>
              </div>
            ))}
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
      <Tabs defaultValue="schedule">
        <TabsList className="mb-1 flex-wrap">
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="knockouts">Knockouts</TabsTrigger>
          <TabsTrigger value="scorers">Scorers</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>
        <TabsContent value="schedule"><ScheduleTab /></TabsContent>
        <TabsContent value="groups"><GroupsTab /></TabsContent>
        <TabsContent value="knockouts"><Bracket /></TabsContent>
        <TabsContent value="scorers"><TopScorers /></TabsContent>
        <TabsContent value="results"><ResultsTab /></TabsContent>
      </Tabs>
    </div>
  )
}
