import { useMemo } from 'react'
import { Users, Swords, BarChart3 } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import Countdown from '@/components/Countdown'
import { calcTotals } from '@/lib/scoring'
import { GROUP_MATCHES, KO_ROUNDS } from '@/data/worldcup'
import { cn } from '@/lib/utils'

// ── Podium card (top 3 visual) ────────────────────────────────
const PODIUM_H     = ['h-44 sm:h-52 lg:h-64', 'h-32 sm:h-40 lg:h-52', 'h-28 sm:h-36 lg:h-44']
const PODIUM_EMOJI = ['🥇', '🥈', '🥉']
const PODIUM_PTS   = ['text-[#FFD706]', 'text-[#C0C0C0]', 'text-[#CD7F32]']
const PODIUM_CARD  = [
  'border-[#FFD706]/50 bg-gradient-to-b from-[#FFD706]/12 to-transparent glow-yellow-sm',
  'border-[#A0A0A0]/25 bg-[#A0A0A0]/5',
  'border-[#CD7F32]/25 bg-[#CD7F32]/5',
]

function PodiumCard({ p, rank, isMe }) {
  if (!p) return <div className="flex-1" />
  return (
    <div className={cn(
      'flex-1 min-w-0 rounded-xl border flex flex-col items-center justify-between p-2 sm:p-4 lg:p-6 text-center transition-all',
      PODIUM_CARD[rank],
      PODIUM_H[rank],
    )}>
      <span className={rank === 0 ? 'text-3xl sm:text-4xl lg:text-5xl' : 'text-2xl sm:text-3xl lg:text-4xl'}>{PODIUM_EMOJI[rank]}</span>
      <div>
        <div className={cn('font-extrabold tabular-nums leading-none',
          rank === 0 ? 'text-3xl sm:text-4xl lg:text-5xl' : 'text-xl sm:text-2xl lg:text-3xl',
          PODIUM_PTS[rank],
        )}>
          {p.pts}
        </div>
        <div className="text-[10px] sm:text-xs lg:text-sm text-th-muted uppercase tracking-wider mt-0.5">pts</div>
      </div>
      <div className="w-full">
        <div className="text-[11px] sm:text-xs lg:text-sm font-bold text-th-text truncate px-1">
          {p.name}
          {isMe && <span className="ml-1 text-[#FFD706]">·you</span>}
        </div>
        <div className="text-[10px] sm:text-xs lg:text-xs text-th-muted mt-0.5">
          {p.correct} right · {p.exact} exact
        </div>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────
function StatCard({ icon: Icon, value, label }) {
  return (
    <div className="rounded-xl border border-th-border bg-th-border/20 p-3 text-center">
      <Icon className="h-3.5 w-3.5 text-th-muted mx-auto mb-1.5" />
      <div className="text-base sm:text-xl font-extrabold text-[#FFD706] tabular-nums leading-none truncate">{value}</div>
      <div className="text-[10px] sm:text-xs text-th-muted mt-1 uppercase tracking-wider">{label}</div>
    </div>
  )
}

// ── Section divider ───────────────────────────────────────────
function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-th-border" />
      <span className="text-[11px] text-th-muted uppercase tracking-[0.15em] shrink-0">{label}</span>
      <div className="flex-1 h-px bg-th-border" />
    </div>
  )
}

const SCORING_PILLS = [
  { label: 'Group', pts: '1/3' },
  { label: 'R32',   pts: '2/5' },
  { label: 'R16',   pts: '3/7' },
  { label: 'QF',    pts: '5/10' },
  { label: 'SF',    pts: '8/15' },
  { label: 'Final', pts: '12/22' },
]

export default function Leaderboard() {
  const { participants, allPicks, myPicks, results, user, allScorer, matchGoals } = useApp()

  const { played, stage } = useMemo(() => {
    const played = Object.keys(results).length
    const groupDone = GROUP_MATCHES.filter(m => results[m.id]).length
    const stage =
      groupDone === 0 ? 'Pre-Tournament'
      : groupDone < GROUP_MATCHES.length ? 'Group Stage'
      : 'Knockout'
    return { played, stage }
  }, [results])

  const ranked = useMemo(() => {
    return participants
      .filter(p => p.email !== '__admin__')
      .map(p => {
        const picks  = p.email === user?.email ? myPicks : (allPicks[p.email] || {})
        const scorer = allScorer[p.email] || {}
        return { ...p, ...calcTotals(picks, results, scorer, matchGoals) }
      })
      .sort((a, b) => b.pts - a.pts || b.correct - a.correct || b.exact - a.exact)
  }, [participants, allPicks, myPicks, results, user])

  const totalMatches = GROUP_MATCHES.length + KO_ROUNDS.reduce((s, r) => s + r.count, 0)

  const myRankIdx = ranked.findIndex(p => p.email === user?.email)
  const myEntry   = myRankIdx >= 0 ? ranked[myRankIdx] : null
  const showPodium = ranked.length >= 1
  const restOfList = ranked.length >= 3 ? ranked.slice(3) : []

  return (
    <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-6">

      {/* ── Page header ── */}
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-th-text tracking-tight">Standings</h1>
        <p className="text-th-muted text-sm mt-1">World Cup 2026 · Recurly Pool</p>
      </div>

      {/* ── Tournament stats ── */}
      <section className="grid grid-cols-3 gap-2 mb-5">
        <StatCard icon={Swords}    value={`${played}/${totalMatches}`} label="Played" />
        <StatCard icon={Users}     value={ranked.length}               label="Players" />
        <StatCard icon={BarChart3} value={stage}                       label="Stage" />
      </section>

      {/* ── Countdown ── */}
      <Countdown />

      {/* ── Podium (top 3) ── */}
      {showPodium && (
        <section>
          <SectionDivider label="Top 3" />
          {/* Order: 2nd | 1st | 3rd — with items-end for podium step effect */}
          <div className="flex items-end gap-2">
            <PodiumCard p={ranked[1]} rank={1} isMe={ranked[1]?.email === user?.email} />
            <PodiumCard p={ranked[0]} rank={0} isMe={ranked[0]?.email === user?.email} />
            <PodiumCard p={ranked[2]} rank={2} isMe={ranked[2]?.email === user?.email} />
          </div>
        </section>
      )}

      {/* ── My position (shown only when user is outside top 3) ── */}
      {myEntry && myRankIdx >= 3 && (
        <section>
          <SectionDivider label="Your position" />
          <div className="rounded-xl border border-[#FFD706]/25 bg-[#FFD706]/5 px-4 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-2xl font-extrabold text-th-text tabular-nums">#{myRankIdx + 1}</span>
                <span className="text-sm font-bold text-th-text truncate">{myEntry.name}</span>
                <span className="text-[10px] text-[#FFD706] font-bold bg-[#FFD706]/10 border border-[#FFD706]/20 px-1.5 py-0.5 rounded-full leading-none shrink-0">you</span>
              </div>
              <div className="text-xs text-th-muted">
                {myEntry.correct} right · {myEntry.exact} exact
                {ranked[myRankIdx - 1] && (
                  <span className="ml-2">
                    · <span className="text-[#FF8200] font-semibold">
                      {ranked[myRankIdx - 1].pts - myEntry.pts} pts
                    </span> behind #{myRankIdx}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-3xl font-extrabold text-[#FFD706] tabular-nums leading-none">{myEntry.pts}</div>
              <div className="text-[10px] text-th-muted uppercase tracking-wider mt-0.5">pts</div>
            </div>
          </div>
        </section>
      )}

      {/* ── Rest of rankings (4th onward) ── */}
      {restOfList.length > 0 && (
        <section>
          <SectionDivider label="All rankings" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5 stagger-children">
            {restOfList.map((p, idx) => {
              const i = idx + 3
              const isMe = p.email === user?.email
              return (
                <div key={p.email} className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all',
                  isMe
                    ? 'border-[#FFD706]/25 bg-[#FFD706]/5'
                    : 'border-th-border bg-th-border/20 hover:bg-th-border/40',
                )}>
                  <div className="w-6 text-sm font-bold text-th-muted text-center tabular-nums shrink-0">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-th-text truncate flex items-center gap-1.5">
                      {p.name}
                      {isMe && (
                        <span className="text-[10px] text-[#FFD706] font-bold bg-[#FFD706]/10 border border-[#FFD706]/20 px-1.5 py-0.5 rounded-full leading-none">you</span>
                      )}
                    </div>
                    <div className="text-xs text-th-muted mt-0.5">{p.correct} right · {p.exact} exact</div>
                  </div>
                  <div className="text-lg font-extrabold text-th-text tabular-nums shrink-0">{p.pts}</div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── If fewer than 4 total, show as compact list (no podium used for rank 4+) ── */}
      {ranked.length > 0 && ranked.length < 4 && (
        <section>
          <SectionDivider label="All rankings" />
          <div className="space-y-1.5 stagger-children">
            {ranked.map((p, i) => {
              const isMe = p.email === user?.email
              return (
                <div key={p.email} className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all',
                  isMe
                    ? 'border-[#FFD706]/25 bg-[#FFD706]/5'
                    : 'border-th-border bg-th-border/20 hover:bg-th-border/40',
                )}>
                  <div className="w-6 text-sm font-bold text-th-muted text-center">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-th-text truncate flex items-center gap-1.5">
                      {p.name}
                      {isMe && <span className="text-[10px] text-[#FFD706] font-bold bg-[#FFD706]/10 border border-[#FFD706]/20 px-1.5 py-0.5 rounded-full leading-none">you</span>}
                    </div>
                    <div className="text-xs text-th-muted mt-0.5">{p.correct} right · {p.exact} exact</div>
                  </div>
                  <div className="text-lg font-extrabold text-th-text tabular-nums">{p.pts}</div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Empty state ── */}
      {ranked.length === 0 && (
        <div className="text-center py-20 text-th-muted">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No participants yet</p>
          <p className="text-sm mt-1">Share the app link to get started!</p>
        </div>
      )}

      {ranked.length > 0 && (
        <section className="mt-6">
          <SectionDivider label="Scoring" />
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {SCORING_PILLS.map(({ label, pts }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 shrink-0 rounded-full border border-th-border bg-th-border/30 px-3 py-1"
              >
                <span className="text-[11px] text-th-muted">{label}</span>
                <span className="text-[11px] font-bold text-th-text">{pts}</span>
              </div>
            ))}
            <span className="shrink-0 text-[11px] text-th-muted pl-1 whitespace-nowrap">right / exact</span>
          </div>
        </section>
      )}
    </div>
  )
}
