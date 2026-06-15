import { useMemo, useState, useEffect } from 'react'
import { Users, Swords, BarChart3, Brain, Play, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import Countdown from '@/components/Countdown'
import LiveMatchBanner from '@/components/LiveMatchBanner'
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
          {p.correct} winner · {p.exact} exact · {p.scorers} scorer{p.scorers !== 1 ? 's' : ''}
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

const TWELVE_HOURS = 12 * 60 * 60 * 1000

function useCountdown(targetMs) {
  const [remaining, setRemaining] = useState(() => Math.max(0, targetMs - Date.now()))
  useEffect(() => {
    if (!targetMs) return
    const tick = () => setRemaining(Math.max(0, targetMs - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetMs])
  if (!targetMs || remaining <= 0) return null
  const h = Math.floor(remaining / 3_600_000)
  const m = Math.floor((remaining % 3_600_000) / 60_000)
  const s = Math.floor((remaining % 60_000) / 1000)
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

// ── Trivia sidebar ────────────────────────────────────────────
function TriviaLeaderboard() {
  const { triviaState, user } = useApp()
  const { questions, leaderboard, answers } = triviaState

  const now = Date.now()

  // All active prompts within their 12h window, newest first
  const activeQuestions = useMemo(() =>
    questions
      .filter(q => q.availableAt <= now && now < q.availableAt + TWELVE_HOURS)
      .sort((a, b) => b.availableAt - a.availableAt)
  , [questions, now])

  // Next future prompt (not yet active)
  const nextQuestion = useMemo(() =>
    questions.filter(q => q.availableAt > now).sort((a, b) => a.availableAt - b.availableAt)[0] ?? null
  , [questions, now])

  const myActiveAnswers = useMemo(() =>
    activeQuestions.map(q => answers.find(a => a.userId === user?.userId && a.promptId === q.promptId) ?? null)
  , [activeQuestions, answers, user])

  const hasUnanswered = myActiveAnswers.some(a => a === null)
  const answeredCount = myActiveAnswers.filter(Boolean).length
  const allAnswered = activeQuestions.length > 0 && !hasUnanswered
  const correctCount = myActiveAnswers.filter(a => a?.isCorrect).length

  const expiresAt = allAnswered && activeQuestions.length > 0 ? activeQuestions[0].availableAt + TWELVE_HOURS : null
  const countdown = useCountdown(allAnswered ? expiresAt : null)
  const nextCountdown = useCountdown(activeQuestions.length === 0 && nextQuestion ? nextQuestion.availableAt : null)

  const [showAllTrivia, setShowAllTrivia] = useState(false)
  const visibleTrivia  = showAllTrivia ? leaderboard : leaderboard.slice(0, 10)
  const hiddenTrivia   = leaderboard.length - 10

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="rounded-xl border border-[#FFD706]/30 bg-gradient-to-b from-[#FFD706]/8 to-transparent overflow-hidden">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#FFD706]/15">
        <div className="flex items-center gap-2 my-1">
          <Brain className="h-4 w-4 text-[#FFD706] shrink-0" />
          <span className="text-sm font-extrabold text-th-text tracking-tight">WC Trivia Challenge</span>
        </div>
        <p className="text-[11px] text-th-muted leading-snug">
          Bonus points for knowing your World Cup history. New question every 12 hours.
        </p>
      </div>

      {/* ── CTA block ── */}
      <div className="px-4 py-3 border-b border-[#FFD706]/10">
        {activeQuestions.length === 0 && !nextQuestion && (
          <div className="flex items-center gap-2 text-[11px] text-th-muted">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Next question coming soon</span>
          </div>
        )}

        {activeQuestions.length === 0 && nextQuestion && (
          <div className="flex items-center gap-2 text-[11px] text-th-muted">
            <Clock className="h-3.5 w-3.5 text-[#FFD706] shrink-0" />
            <span>Next question in <span className="font-bold text-th-text">{nextCountdown ?? '…'}</span></span>
          </div>
        )}

        {activeQuestions.length > 0 && hasUnanswered && (
          <div className="space-y-1.5">
            <button
              id="trivia-cta"
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#FFD706] hover:bg-[#FFD706]/90 active:scale-95 transition-all px-4 py-2.5"
            >
              <Play className="h-3.5 w-3.5 text-black fill-black shrink-0" />
              <span className="text-sm font-extrabold text-black tracking-tight">Answer Today's Question</span>
            </button>
            {answeredCount > 0 && (
              <p className="text-[11px] text-th-muted text-center">{answeredCount} of {activeQuestions.length} answered</p>
            )}
          </div>
        )}

        {allAnswered && correctCount === activeQuestions.length && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-sm font-bold text-emerald-400">Nailed it! +{correctCount} point{correctCount > 1 ? 's' : ''}</span>
            </div>
            {countdown && (
              <div className="flex items-center gap-1.5 text-[11px] text-th-muted">
                <Clock className="h-3 w-3 shrink-0" />
                <span>Next question in <span className="font-semibold text-th-text">{countdown}</span></span>
              </div>
            )}
          </div>
        )}

        {allAnswered && correctCount < activeQuestions.length && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              {correctCount > 0
                ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
              <span className="text-sm font-bold text-th-text">
                {correctCount > 0 ? `${correctCount}/${activeQuestions.length} correct!` : 'Keep trying!'}
              </span>
            </div>
            <p className="text-[11px] text-th-muted">Better luck on the next one.</p>
            {countdown && (
              <div className="flex items-center gap-1.5 text-[11px] text-th-muted">
                <Clock className="h-3 w-3 shrink-0" />
                <span>Next question in <span className="font-semibold text-th-text">{countdown}</span></span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Leaderboard ── */}
      {leaderboard.length === 0 ? (
        <div className="px-4 py-5 text-center">
          <p className="text-xs font-semibold text-th-text">No scores yet</p>
          <p className="text-[11px] text-th-muted mt-0.5">Be the first to answer correctly!</p>
        </div>
      ) : (
        <>
        <div className="divide-y divide-th-border/60">
          {visibleTrivia.map((entry, i) => {
            const isMe = entry.userId === user?.userId
            return (
              <div key={entry.userId} className={cn(
                'flex items-center gap-2.5 px-4 py-2.5 transition-colors',
                isMe ? 'bg-[#FFD706]/8' : 'hover:bg-th-border/20',
              )}>
                <span className="w-5 text-center shrink-0 text-sm leading-none">
                  {i < 3
                    ? medals[i]
                    : <span className="text-xs font-bold text-th-muted tabular-nums">{i + 1}</span>}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={cn('text-xs font-semibold truncate block', isMe ? 'text-[#FFD706]' : 'text-th-text')}>
                    {entry.name}
                    {isMe && <span className="ml-1 text-[10px] text-[#FFD706]/60 font-normal">you</span>}
                  </span>
                </span>
                <div className="text-right shrink-0">
                  <span className="text-sm font-extrabold text-[#FFD706] tabular-nums">{entry.pts}</span>
                  <span className="text-[10px] text-th-muted ml-0.5">pts</span>
                </div>
              </div>
            )
          })}
        </div>
        {!showAllTrivia && hiddenTrivia > 0 && (
          <button
            onClick={() => setShowAllTrivia(true)}
            className="w-full text-xs font-semibold text-th-muted hover:text-th-text border-t border-[#FFD706]/10 py-2.5 transition-colors"
          >
            View {hiddenTrivia} more
          </button>
        )}
        </>
      )}

      <div className="px-4 py-2.5 border-t border-[#FFD706]/10 bg-[#FFD706]/5">
        <p className="text-[10px] text-th-muted text-center">1 pt per correct answer · separate from pool picks</p>
      </div>
    </div>
  )
}

export default function Leaderboard() {
  const { participants, allPicks, myPicks, results, liveScores, user, allScorer, matchGoals, lineups } = useApp()

  // Merge live scores as provisional results so picks score in real-time
  const effectiveResults = useMemo(() => {
    const live = {}
    for (const [mid, m] of Object.entries(liveScores)) {
      if (results[mid]) continue  // finished result takes priority
      live[mid] = { matchId: mid, home: m.homeScore, away: m.awayScore, winner: null }
    }
    return Object.keys(live).length ? { ...results, ...live } : results
  }, [results, liveScores])

  const { played, stage } = useMemo(() => {
    const played = Object.keys(effectiveResults).length
    const groupDone = GROUP_MATCHES.filter(m => effectiveResults[m.id]).length
    const stage =
      groupDone === 0 ? 'Pre-Tournament'
      : groupDone < GROUP_MATCHES.length ? 'Group Stage'
      : 'Knockout'
    return { played, stage }
  }, [effectiveResults])

  const ranked = useMemo(() => {
    return participants
      .filter(p => p.email !== '__admin__')
      .map(p => {
        const picks  = p.email === user?.email ? myPicks : (allPicks[p.email] || {})
        const scorer = allScorer[p.email] || {}
        return { ...p, ...calcTotals(picks, effectiveResults, scorer, matchGoals, lineups) }
      })
      .sort((a, b) => b.pts - a.pts || b.correct - a.correct || b.exact - a.exact || (a.joined_at ?? 0) - (b.joined_at ?? 0))
  }, [participants, allPicks, myPicks, effectiveResults, user, allScorer, matchGoals])

  const totalMatches = GROUP_MATCHES.length + KO_ROUNDS.reduce((s, r) => s + r.count, 0)

  const myRankIdx  = ranked.findIndex(p => p.email === user?.email)
  const myEntry    = myRankIdx >= 0 ? ranked[myRankIdx] : null
  const showPodium = ranked.length >= 1
  const restOfList = ranked.length >= 3 ? ranked.slice(3) : []

  const [showAllMain, setShowAllMain] = useState(false)
  const visibleMain   = showAllMain ? restOfList : restOfList.slice(0, 10)
  const hiddenMain    = restOfList.length - 10

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 lg:grid lg:grid-cols-[1fr_260px] lg:gap-6 lg:items-start">
    <div>

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

      {/* ── Live matches ── */}
      <LiveMatchBanner />

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
                {myEntry.correct} winner · {myEntry.exact} exact · {myEntry.scorers} scorer{myEntry.scorers !== 1 ? 's' : ''}
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
            {visibleMain.map((p, idx) => {
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
                    <div className="text-xs text-th-muted mt-0.5">{p.correct} winner · {p.exact} exact · {p.scorers} scorer{p.scorers !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="text-lg font-extrabold text-th-text tabular-nums shrink-0">{p.pts}</div>
                </div>
              )
            })}
          </div>
          {!showAllMain && hiddenMain > 0 && (
            <button
              onClick={() => setShowAllMain(true)}
              className="mt-3 w-full text-xs font-semibold text-th-muted hover:text-th-text border border-th-border rounded-lg py-2 transition-colors"
            >
              View {hiddenMain} more
            </button>
          )}
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
                    <div className="text-xs text-th-muted mt-0.5">{p.correct} winner · {p.exact} exact · {p.scorers} scorer{p.scorers !== 1 ? 's' : ''}</div>
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
            <span className="shrink-0 text-[11px] text-th-muted pl-1 whitespace-nowrap">winner / exact</span>
          </div>
        </section>
      )}
    </div>

      <aside className="mt-6 lg:mt-0 lg:sticky lg:top-24 pt-2">
        <TriviaLeaderboard />
      </aside>
    </div>
  )
}
