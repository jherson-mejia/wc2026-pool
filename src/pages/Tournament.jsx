import { useState, useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { getFlag, GROUP_MATCHES, GROUPS, KO_ROUNDS } from '@/data/worldcup'
import { useApp } from '@/context/AppContext'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import TopScorers from '@/components/TopScorers'
import Bracket from '@/components/Bracket'
import LiveMatchBanner from '@/components/LiveMatchBanner'

// ── Shared empty ─────────────────────────────────────────────
function EmptyState({ icon: Icon, msg }) {
  return (
    <div className="py-16 text-center text-th-muted">
      <Icon className="h-8 w-8 mx-auto mb-3 opacity-40" />
      <p className="text-sm">{msg}</p>
    </div>
  )
}

// ── Date divider ─────────────────────────────────────────────
function DateDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-th-border" />
      <span className="text-[11px] text-th-muted uppercase tracking-[0.12em] shrink-0">{label}</span>
      <div className="flex-1 h-px bg-th-border" />
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

// ── GroupsTab — computed from local results (no external API) ──
const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L']

function computeStandings(results) {
  const stats = {}
  const init = name => {
    if (!stats[name]) stats[name] = { name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }
  }
  for (const m of GROUP_MATCHES) {
    const r = results[m.id]
    if (!r || r.home == null || r.away == null) continue
    init(m.home); init(m.away)
    const h = Number(r.home), a = Number(r.away)
    stats[m.home].p++; stats[m.away].p++
    stats[m.home].gf += h; stats[m.home].ga += a
    stats[m.away].gf += a; stats[m.away].ga += h
    if (h > a) {
      stats[m.home].w++; stats[m.home].pts += 3
      stats[m.away].l++
    } else if (a > h) {
      stats[m.away].w++; stats[m.away].pts += 3
      stats[m.home].l++
    } else {
      stats[m.home].d++; stats[m.home].pts++
      stats[m.away].d++; stats[m.away].pts++
    }
  }
  return stats
}

function GroupsTab() {
  const { results } = useApp()
  const [activeGroup, setActiveGroup] = useState('A')

  const groupMap = useMemo(() => {
    const stats = computeStandings(results)
    const map = {}
    for (const g of GROUPS) {
      const rows = g.teams.map(name => ({
        name,
        ...(stats[name] ?? { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }),
        gd: (stats[name]?.gf ?? 0) - (stats[name]?.ga ?? 0),
      }))
      rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
      map[g.id] = rows
    }
    return map
  }, [results])

  const rows = groupMap[activeGroup] ?? []

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none mb-4">
        {GROUP_LETTERS.map(g => (
          <button
            key={g}
            onClick={() => setActiveGroup(g)}
            className={cn(
              'shrink-0 w-9 h-9 rounded-lg text-sm font-bold transition-all border',
              g === activeGroup
                ? 'bg-[#FFD706] text-[#0D0D0B] border-[#FFD706]'
                : 'bg-transparent text-th-muted border-th-border hover:text-th-text hover:border-th-text/30'
            )}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-th-border overflow-x-auto">
       <div className="min-w-[380px]">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-3 px-4 py-2.5 bg-th-border/40 text-xs text-th-muted uppercase tracking-wider font-semibold">
          <span>Team</span>
          <span className="text-center w-7">P</span>
          <span className="text-center w-7">W</span>
          <span className="text-center w-7">D</span>
          <span className="text-center w-7">L</span>
          <span className="text-center w-9">GD</span>
          <span className="text-center w-9">Pts</span>
        </div>

        {rows.map((row, i) => {
          const advances = i < 2
          return (
            <div
              key={row.name}
              className={cn(
                'grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-3 px-4 py-3 items-center border-t border-th-border transition-all',
                advances ? 'border-l-2 border-l-[#FFD706]/60 bg-[#FFD706]/5' : 'border-l-2 border-l-transparent'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-sm text-th-muted w-4 shrink-0 tabular-nums">{i + 1}</span>
                <span className="text-lg leading-none shrink-0">{getFlag(row.name)}</span>
                <span className="text-sm font-semibold text-th-text truncate">{row.name}</span>
              </div>
              {row.p === 0 ? (
                <>
                  <span className="text-sm text-[#3a3835] text-center w-7 tabular-nums">–</span>
                  <span className="text-sm text-[#3a3835] text-center w-7 tabular-nums">–</span>
                  <span className="text-sm text-[#3a3835] text-center w-7 tabular-nums">–</span>
                  <span className="text-sm text-[#3a3835] text-center w-7 tabular-nums">–</span>
                  <span className="text-sm text-[#3a3835] text-center w-9 tabular-nums">–</span>
                  <span className="text-sm text-[#3a3835] text-center w-9 tabular-nums">–</span>
                </>
              ) : (
                <>
                  <span className="text-sm text-th-text text-center w-7 tabular-nums">{row.p}</span>
                  <span className="text-sm text-th-text text-center w-7 tabular-nums">{row.w}</span>
                  <span className="text-sm text-th-text text-center w-7 tabular-nums">{row.d}</span>
                  <span className="text-sm text-th-text text-center w-7 tabular-nums">{row.l}</span>
                  <span className={cn('text-sm font-semibold text-center w-9 tabular-nums',
                    row.gd > 0 ? 'text-green-400' : row.gd < 0 ? 'text-red-400' : 'text-th-muted'
                  )}>
                    {row.gd > 0 ? `+${row.gd}` : row.gd}
                  </span>
                  <span className="text-sm font-extrabold text-center w-9 tabular-nums text-[#FFD706]">{row.pts}</span>
                </>
              )}
            </div>
          )
        })}
       </div>
      </div>
      <p className="text-xs text-th-muted mt-2 pl-1">Top 2 advance · highlighted in yellow</p>
    </div>
  )
}

// ── ResultsTab — reads from Supabase via AppContext (no API) ──
function ResultsTab() {
  const { results, kickoffs, koMatches } = useApp()

  const groupFinished = GROUP_MATCHES
    .filter(m => results[m.id])
    .map(m => ({
      id: m.id, home: m.home, away: m.away,
      homeScore: results[m.id].home, awayScore: results[m.id].away,
      winner: results[m.id].winner,
      kickoff: kickoffs[m.id] ?? null,
      label: `Group ${m.group}`,
    }))

  const koFinished = KO_ROUNDS.flatMap(round =>
    Array.from({ length: round.count }, (_, i) => {
      const mid = `${round.id}_${i + 1}`
      const r = results[mid]
      const km = koMatches[mid]
      if (!r || !km?.home) return null
      return {
        id: mid, home: km.home, away: km.away,
        homeScore: r.home, awayScore: r.away,
        winner: r.winner,
        kickoff: kickoffs[mid] ?? null,
        label: round.name,
      }
    }).filter(Boolean)
  )

  const finished = [...groupFinished, ...koFinished]
    .sort((a, b) => {
      if (a.kickoff && b.kickoff) return new Date(b.kickoff) - new Date(a.kickoff)
      return 0
    })

  return (
    <div>
      <LiveMatchBanner />
      {!finished.length
        ? <EmptyState icon={Calendar} msg="No results yet" />
        : <ResultsList finished={finished} />}
    </div>
  )
}

function ResultsList({ finished }) {

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
              <div key={m.id} className="flex items-center gap-2 rounded-xl border border-th-border bg-th-border/20 px-3 py-2.5">
                <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                  <span className={cn(
                    'text-xs truncate text-right',
                    m.winner === 'home' || (!m.winner && m.homeScore > m.awayScore) ? 'font-bold text-th-text' : 'text-th-muted'
                  )}>{m.home}</span>
                  <span className="text-base leading-none shrink-0">{getFlag(m.home)}</span>
                </div>
                <div className="text-sm font-extrabold text-th-text tabular-nums shrink-0 text-center w-16">
                  {m.homeScore} – {m.awayScore}
                </div>
                <div className="flex items-center gap-1.5 flex-1 justify-start min-w-0">
                  <span className="text-base leading-none shrink-0">{getFlag(m.away)}</span>
                  <span className={cn(
                    'text-xs truncate',
                    m.winner === 'away' || (!m.winner && m.awayScore > m.homeScore) ? 'font-bold text-th-text' : 'text-th-muted'
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

// ── ScheduleTab — all group matches, score shown when available ─
function ScheduleTab() {
  const { results, kickoffs } = useApp()
  const now = Date.now()

  const sorted = [...GROUP_MATCHES]
    .map(m => ({
      id: m.id,
      home: m.home,
      away: m.away,
      group: m.group,
      kickoff: kickoffs[m.id] ?? null,
      result: results[m.id] ?? null,
    }))
    .sort((a, b) => {
      const ta = a.kickoff ? new Date(a.kickoff).getTime() : Infinity
      const tb = b.kickoff ? new Date(b.kickoff).getTime() : Infinity
      return ta - tb
    })

  if (!sorted.length) return <EmptyState icon={Calendar} msg="No group matches found" />

  const groups = []
  let lastKey = null
  for (const m of sorted) {
    const key   = m.kickoff ? localDateKey(m.kickoff) : '__tbd__'
    const label = m.kickoff ? relativeDate(m.kickoff) : 'Date TBD'
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
            {items.map(m => {
              const finished = !!m.result
              const inFuture = m.kickoff && new Date(m.kickoff).getTime() > now
              return (
                <div key={m.id} className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2.5',
                  finished ? 'border-th-border bg-th-border/20' : 'border-th-border bg-th-border/10 opacity-80',
                )}>
                  {/* Time / FT */}
                  <div className="text-[11px] shrink-0 w-16 tabular-nums text-center">
                    {finished
                      ? <span className="text-[#22c55e] font-bold">FT</span>
                      : m.kickoff
                        ? <span className="text-th-muted">{localTime(m.kickoff)}</span>
                        : <span className="text-[#3a3835]">TBD</span>}
                  </div>

                  {/* Home */}
                  <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                    <span className={cn(
                      'text-xs truncate text-right',
                      finished && m.result.winner === 'home' ? 'font-bold text-th-text' : 'font-semibold text-th-text',
                    )}>{m.home}</span>
                    <span className="text-base leading-none shrink-0">{getFlag(m.home)}</span>
                  </div>

                  {/* Score / vs */}
                  <div className="shrink-0 w-16 text-center">
                    {finished
                      ? <span className="text-sm font-extrabold text-th-text tabular-nums">
                          {m.result.home} – {m.result.away}
                        </span>
                      : <span className="text-[11px] text-th-muted">vs</span>}
                  </div>

                  {/* Away */}
                  <div className="flex items-center gap-1.5 flex-1 justify-start min-w-0">
                    <span className="text-base leading-none shrink-0">{getFlag(m.away)}</span>
                    <span className={cn(
                      'text-xs truncate',
                      finished && m.result.winner === 'away' ? 'font-bold text-th-text' : 'font-semibold text-th-text',
                    )}>{m.away}</span>
                  </div>

                  {/* Group badge */}
                  <div className="shrink-0 text-[10px] text-th-muted bg-th-border border border-th-border rounded-full px-2 py-0.5 leading-none whitespace-nowrap">
                    G{m.group}
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

// ── Tournament page ───────────────────────────────────────────
export default function Tournament() {
  return (
    <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-3xl font-extrabold text-th-text tracking-tight mb-5">Tournament</h1>
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
