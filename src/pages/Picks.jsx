import { useState, useMemo, useEffect, useRef } from 'react'
import { ChevronDown, Download, Lock, Target, CheckCircle2, Zap } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/components/ui/toast'
import { GROUP_MATCHES, KO_ROUNDS, getFlag } from '@/data/worldcup'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import KnockoutMatchCard from '@/components/KnockoutMatchCard'
import HowItWorks from '@/components/HowItWorks'
import { cn } from '@/lib/utils'
import Countdown from '@/components/Countdown'
import { calcTotals, calcMatchPoints, calcScorerPoints, SCORER_POINTS } from '@/lib/scoring'

// ── Next-match ticking countdown ─────────────────────────────
function TickingCountdown({ kickoff }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const ms = Math.max(0, new Date(kickoff).getTime() - now)
  if (ms === 0) return null
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  const str = d > 0
    ? `${d}d ${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
    : h > 0
      ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
      : `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  return (
    <div className="flex items-center justify-center gap-2 py-1.5 mb-1.5 rounded-lg bg-[#FFD706]/10 border border-[#FFD706]/30">
      <Zap className="h-3 w-3 text-[#FFD706] animate-pulse shrink-0" />
      <span className="text-xs font-bold text-[#FFD706] font-mono">{str} until kickoff</span>
    </div>
  )
}

// ── Scorer picker for one team ────────────────────────────────
function ScorerPicker({ lineup, bench, pick, locked, matchGoals, teamId, onSave }) {
  const players = [...(lineup ?? []), ...(bench ?? [])]
  if (!players.length) return null

  if (locked) {
    if (!pick) return <span className="text-[10px] text-th-muted italic">No scorer pick</span>
    const correct = matchGoals
      ? matchGoals.goals?.some(g => g.scorer_id === pick.playerId && g.team_id === teamId)
      : null
    return (
      <span className={cn(
        'text-[11px] font-semibold truncate max-w-full',
        correct === true  ? 'text-[#22c55e]'
        : correct === false ? 'text-th-muted'
        : 'text-th-text',
      )}>
        {correct === true && '✓ '}
        {pick.playerName}
        {correct === true && ` +${SCORER_POINTS}`}
      </span>
    )
  }

  return (
    <select
      className="w-full text-[11px] bg-th-surface-alt border border-th-border rounded px-1.5 py-1 text-th-text focus:outline-none focus:border-[#FFD706]/50 truncate"
      value={pick?.playerId ?? ''}
      onChange={e => {
        const player = players.find(p => String(p.id) === e.target.value)
        if (player) onSave(player.id, player.name)
      }}
    >
      <option value="">⚽ Pick scorer…</option>
      {lineup?.length > 0 && (
        <optgroup label="Starting XI">
          {lineup.map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.position ? ` · ${p.position}` : ''}</option>
          ))}
        </optgroup>
      )}
      {bench?.length > 0 && (
        <optgroup label="Bench">
          {bench.map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.position ? ` · ${p.position}` : ''}</option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

// ── Compact pick row (schedule-tab style with inline score input) ─
function PickRow({ match, pick = {}, result, kickoff, onSave, isNext, lineup, myScorerHome, myScorerAway, matchGoals, matchMeta, onSaveScorer }) {
  const homeRef  = useRef(null)
  const awayRef  = useRef(null)
  const timerRef = useRef(null)

  const kickoffLocked = kickoff ? Date.now() >= new Date(kickoff).getTime() : false
  const locked   = !!result || kickoffLocked
  const hasPick  = pick?.home != null && pick?.away != null
  const pts      = result ? calcMatchPoints(pick, result, 'group') : null
  const isExact  = pts != null && pts >= 3
  const isCorrect = pts != null && pts >= 1

  // Sync DOM values when pick loads from SSE after initial mount
  useEffect(() => {
    if (hasPick && homeRef.current && document.activeElement !== homeRef.current)
      homeRef.current.value = String(pick.home)
    if (hasPick && awayRef.current && document.activeElement !== awayRef.current)
      awayRef.current.value = String(pick.away)
  }, [pick?.home, pick?.away])

  function queue() {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const h = parseInt(homeRef.current?.value)
      const a = parseInt(awayRef.current?.value)
      if (!isNaN(h) && !isNaN(a)) onSave?.(match.id, h, a, null)
    }, 700)
  }

  const scoreColor = isExact ? 'text-[#FFD706] font-bold' : isCorrect ? 'text-[#22c55e] font-semibold' : 'text-th-muted'
  const borderCls  = isExact   ? 'border-[#FFD706]/40 bg-[#FFD706]/5'
    : isCorrect  ? 'border-[#22c55e]/30 bg-[#22c55e]/5'
    : isNext     ? 'border-[#FFD706]/60 bg-[#FFD706]/5'
    :              'border-th-border bg-th-border/20'

  const time = kickoff
    ? new Date(kickoff).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '–'

  const hasLineup = lineup != null

  return (
    <div className={cn('rounded-xl border px-3 py-2.5 transition-all', borderCls)}>
      {/* Main score row */}
      <div className="flex items-center gap-2">
        {/* Time */}
        <div className="text-[11px] text-th-muted shrink-0 w-14 tabular-nums">{time}</div>

        {/* Home */}
        <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
          <span className="text-xs font-semibold text-th-text truncate text-right">{match.home}</span>
          <span className="text-base leading-none shrink-0">{getFlag(match.home)}</span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-1 shrink-0">
          {locked ? (
            <>
              <span className={cn('w-8 h-7 flex items-center justify-center text-sm tabular-nums', scoreColor)}>
                {hasPick ? pick.home : '–'}
              </span>
              <span className="text-th-muted text-xs font-bold">–</span>
              <span className={cn('w-8 h-7 flex items-center justify-center text-sm tabular-nums', scoreColor)}>
                {hasPick ? pick.away : '–'}
              </span>
            </>
          ) : (
            <>
              <input ref={homeRef} type="number" min="0" max="99"
                defaultValue={hasPick ? pick.home : ''} placeholder="0"
                className="score-input-sm" onChange={queue} />
              <span className="text-th-muted text-xs font-bold">–</span>
              <input ref={awayRef} type="number" min="0" max="99"
                defaultValue={hasPick ? pick.away : ''} placeholder="0"
                className="score-input-sm" onChange={queue} />
            </>
          )}
        </div>

        {/* Away */}
        <div className="flex items-center gap-1.5 flex-1 justify-start min-w-0">
          <span className="text-base leading-none shrink-0">{getFlag(match.away)}</span>
          <span className="text-xs font-semibold text-th-text truncate">{match.away}</span>
        </div>

        {/* Right: pts earned or group badge */}
        <div className="shrink-0 min-w-[2rem] text-right">
          {pts != null ? (
            <span className={cn('text-xs font-bold tabular-nums', isExact ? 'text-[#FFD706]' : isCorrect ? 'text-[#22c55e]' : 'text-th-muted')}>
              {pts > 0 ? `+${pts}` : '0'}
            </span>
          ) : (
            <span className="text-[10px] text-th-muted">{`G${match.group}`}</span>
          )}
        </div>
      </div>

      {/* Odds — shown before kickoff when available */}
      {!locked && matchMeta?.oddsHome != null && (
        <div className="flex items-center justify-center gap-3 mt-1.5 text-[10px] text-th-muted">
          <span>H <span className="text-th-text tabular-nums">{matchMeta.oddsHome}</span></span>
          <span>D <span className="text-th-text tabular-nums">{matchMeta.oddsDraw}</span></span>
          <span>A <span className="text-th-text tabular-nums">{matchMeta.oddsAway}</span></span>
        </div>
      )}

      {/* Scorer picks — shown when lineup is available */}
      {hasLineup && (
        <div className="mt-2 pt-2 border-t border-th-border/50 space-y-2">
          {/* Venue + referee */}
          {(matchMeta?.venue || matchMeta?.referee) && (
            <div className="flex items-center justify-between text-[10px] text-th-muted">
              {matchMeta.venue   && <span>🏟 {matchMeta.venue}</span>}
              {matchMeta.referee && <span>Ref: {matchMeta.referee}</span>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] text-th-muted uppercase tracking-wide">{match.home} scorer</span>
              <ScorerPicker
                lineup={lineup.homeLineup}
                bench={lineup.homeBench}
                pick={myScorerHome}
                locked={locked}
                matchGoals={matchGoals}
                teamId={lineup.homeTeamId}
                onSave={(playerId, playerName) => onSaveScorer?.(match.id, 'home', playerId, playerName)}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] text-th-muted uppercase tracking-wide">{match.away} scorer</span>
              <ScorerPicker
                lineup={lineup.awayLineup}
                bench={lineup.awayBench}
                pick={myScorerAway}
                locked={locked}
                matchGoals={matchGoals}
                teamId={lineup.awayTeamId}
                onSave={(playerId, playerName) => onSaveScorer?.(match.id, 'away', playerId, playerName)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Single match-day section ──────────────────────────────────
function DaySection({ label, sublabel, isToday, allPast, hasNext, matches, myPicks, results, kickoffs, onSave, nextMatchId, lineups, myScorer, matchGoals, matchMeta, onSaveScorer }) {
  const [open, setOpen] = useState(isToday || hasNext)

  // Only show: picked matches OR upcoming (not yet locked) matches
  const visibleMatches = matches.filter(m => {
    const ko     = kickoffs[m.id]
    const locked = !!results[m.id] || (ko && Date.now() >= new Date(ko).getTime())
    const hasPick = myPicks[m.id]?.home != null
    return !locked || hasPick
  })

  const done  = visibleMatches.filter(m => results[m.id]).length
  const myPts = visibleMatches.reduce((s, m) =>
    s + calcMatchPoints(myPicks[m.id], results[m.id], 'group'), 0)

  if (visibleMatches.length === 0) return null

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden transition-all',
      isToday ? 'border-[#FF8200]/50' : 'border-th-border',
    )}>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3.5 transition-colors',
          isToday
            ? 'bg-[#FF8200]/10 hover:bg-[#FF8200]/15'
            : 'bg-th-border/50 hover:bg-th-border/80',
          allPast && !isToday && 'opacity-60',
        )}
      >
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className={cn('font-bold text-sm', isToday ? 'text-[#FF8200]' : 'text-th-text')}>
              {label}
            </span>
            {isToday && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-[#FF8200]">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FF8200] animate-pulse" />
                Today
              </span>
            )}
          </div>
          <div className="text-xs text-th-muted mt-0.5">{sublabel} · {visibleMatches.length} matches</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {myPts > 0 && <span className="text-xs font-bold text-[#FFD706]">+{myPts} pts</span>}
          {results && done > 0 && <span className="text-xs text-th-muted">{done}/{visibleMatches.length}</span>}
          <ChevronDown className={cn('h-4 w-4 text-th-muted transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="p-3 space-y-1.5 bg-th-bg/40">
          {visibleMatches.map(m => (
            <div key={m.id}>
              {m.id === nextMatchId && kickoffs[m.id] && (
                <TickingCountdown kickoff={kickoffs[m.id]} />
              )}
              <PickRow
                match={m}
                pick={myPicks[m.id]}
                result={results[m.id]}
                kickoff={kickoffs[m.id]}
                onSave={onSave}
                isNext={m.id === nextMatchId}
                lineup={lineups?.[m.id]}
                myScorerHome={myScorer?.[`${m.id}_home`]}
                myScorerAway={myScorer?.[`${m.id}_away`]}
                matchGoals={matchGoals?.[m.id]}
                matchMeta={matchMeta?.[m.id]}
                onSaveScorer={onSaveScorer}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Chronological match-day view ──────────────────────────────
const DEV_MATCH = import.meta.env.DEV
  ? { id: 'DEV_TEST', group: 'DEV', home: 'Home XI', away: 'Away XI', matchday: 1, round: 'group', simultaneous: false }
  : null

function MatchDayView({ myPicks, results, kickoffs, onSave, lineups, myScorer, matchGoals, matchMeta, onSaveScorer }) {
  const sorted = useMemo(() => {
    const base = DEV_MATCH ? [DEV_MATCH, ...GROUP_MATCHES] : [...GROUP_MATCHES]
    return base.sort((a, b) => {
      const ka = kickoffs[a.id] ? new Date(kickoffs[a.id]).getTime() : Infinity
      const kb = kickoffs[b.id] ? new Date(kickoffs[b.id]).getTime() : Infinity
      return ka - kb
    })
  }, [kickoffs])

  const nextMatchId = useMemo(() => {
    const now = Date.now()
    return sorted.find(m =>
      !results[m.id] && (!kickoffs[m.id] || now < new Date(kickoffs[m.id]).getTime())
    )?.id ?? null
  }, [sorted, results, kickoffs])

  const days = useMemo(() => {
    const map = new Map()
    const now  = new Date()
    const todayStr    = now.toDateString()
    const tomorrowStr = new Date(now.getTime() + 86_400_000).toDateString()

    for (const m of sorted) {
      const ko = kickoffs[m.id]
      let dateKey, label, sublabel, isToday

      if (ko) {
        const d   = new Date(ko)
        dateKey   = d.toDateString()
        isToday   = dateKey === todayStr
        const isTomorrow = dateKey === tomorrowStr
        label     = isToday ? 'Today' : isTomorrow ? 'Tomorrow'
                  : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        sublabel  = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      } else {
        dateKey  = '__tbd__'
        label    = 'Date TBD'
        sublabel = 'Kickoff time not set'
        isToday  = false
      }

      if (!map.has(dateKey)) map.set(dateKey, { dateKey, label, sublabel, isToday, matches: [] })
      map.get(dateKey).matches.push(m)
    }

    return [...map.values()].map(day => ({
      ...day,
      allPast:  day.matches.every(m => kickoffs[m.id] && Date.now() >= new Date(kickoffs[m.id]).getTime()),
      hasNext:  day.matches.some(m => m.id === nextMatchId),
    }))
  }, [sorted, kickoffs, nextMatchId])

  return (
    <div className="space-y-2">
      {days.map(day => (
        <DaySection
          key={day.dateKey}
          {...day}
          myPicks={myPicks}
          results={effectiveResults}
          kickoffs={kickoffs}
          onSave={onSave}
          nextMatchId={nextMatchId}
          lineups={lineups}
          myScorer={myScorer}
          matchGoals={matchGoals}
          matchMeta={matchMeta}
          onSaveScorer={onSaveScorer}
        />
      ))}
    </div>
  )
}

// ── Knockout round ─────────────────────────────────────────────
function KORound({ round, myPicks, results, koMatches, kickoffs, onSave, isAdmin }) {
  const allTBD = Array.from({ length: round.count }, (_, i) => `${round.id}_${i + 1}`)
    .every(mid => !koMatches[mid]?.home)

  if (allTBD) {
    return (
      <div className="rounded-xl border border-th-border bg-th-bg/40 p-8 text-center">
        <Lock className="h-8 w-8 text-th-subtle mx-auto mb-3" />
        <p className="font-semibold text-th-muted">{round.name} picks are locked</p>
        <p className="text-sm text-th-muted mt-1.5">
          Picks unlock match-by-match as soon as the admin confirms which teams are playing.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-th-muted bg-th-border/30 rounded-lg px-3 py-2">
        <span>📊 {round.name}: <span className="text-th-text font-semibold">{round.scoring.result}pts</span> winner · <span className="text-[#FFD706] font-semibold">{round.scoring.exact}pts</span> exact score</span>
      </div>
      {Array.from({ length: round.count }, (_, i) => {
        const mid = `${round.id}_${i + 1}`
        return (
          <KnockoutMatchCard
            key={mid}
            matchId={mid}
            roundId={round.id}
            scoring={round.scoring}
            km={koMatches[mid]}
            pick={myPicks[mid]}
            result={results[mid]}
            kickoff={kickoffs[mid]}
            onSave={onSave}
            disabled={isAdmin}
          />
        )
      })}
    </div>
  )
}

// ── My Progress section ───────────────────────────────────────
function PicksProgress({ myPicks, results, participants, allPicks, user, myScorer, matchGoals }) {
  const { pts, correct, exact } = useMemo(
    () => calcTotals(myPicks, results, myScorer, matchGoals),
    [myPicks, results, myScorer, matchGoals],
  )

  const playedIds      = Object.keys(results)
  const pickedOfPlayed = playedIds.filter(id => myPicks[id] != null).length
  const pct            = playedIds.length > 0 ? Math.round((pickedOfPlayed / playedIds.length) * 100) : 0

  const myRank = useMemo(() => {
    if (!participants.length) return null
    const ranked = participants
      .filter(p => p.email !== '__admin__')
      .map(p => {
        const picks  = p.email === user?.email ? myPicks : (allPicks[p.email] || {})
        const scorer = p.email === user?.email ? myScorer : {}
        return { email: p.email, pts: calcTotals(picks, results, scorer, matchGoals).pts }
      })
      .sort((a, b) => b.pts - a.pts)
    const idx = ranked.findIndex(p => p.email === user?.email)
    return idx >= 0 ? idx + 1 : null
  }, [participants, allPicks, myPicks, results, user, myScorer, matchGoals])

  const totalPlayed = playedIds.length

  return (
    <section className="rounded-xl border border-th-border bg-th-border/20 p-4 mb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold text-th-muted uppercase tracking-[0.15em]">My Progress</h2>
        {myRank && (
          <div className="flex items-center gap-1.5 text-xs text-th-muted">
            <span>Current rank</span>
            <span className="font-extrabold text-[#FFD706] text-sm">#{myRank}</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        <div className="rounded-lg bg-th-bg/60 border border-th-border p-2.5 text-center">
          <Target className="h-3 w-3 text-th-muted mx-auto mb-1" />
          <div className="text-xl font-extrabold text-[#FFD706] tabular-nums leading-none">{pts}</div>
          <div className="text-[9px] text-th-muted uppercase tracking-wider mt-1">Points</div>
        </div>
        <div className="rounded-lg bg-th-bg/60 border border-th-border p-2.5 text-center">
          <CheckCircle2 className="h-3 w-3 text-th-muted mx-auto mb-1" />
          <div className="text-xl font-extrabold text-th-text tabular-nums leading-none">{correct}</div>
          <div className="text-[9px] text-th-muted uppercase tracking-wider mt-1">Right result</div>
        </div>
        <div className="rounded-lg bg-th-bg/60 border border-th-border p-2.5 text-center">
          <Zap className="h-3 w-3 text-th-muted mx-auto mb-1" />
          <div className="text-xl font-extrabold text-th-text tabular-nums leading-none">{exact}</div>
          <div className="text-[9px] text-th-muted uppercase tracking-wider mt-1">Exact score</div>
        </div>
      </div>

      {/* Picks completion bar */}
      {totalPlayed > 0 && (
        <div>
          <div className="flex justify-between text-[11px] text-th-muted mb-1.5">
            <span>Picks vs played matches</span>
            <span className="font-semibold text-th-text">{pickedOfPlayed}/{totalPlayed}</span>
          </div>
          <div className="h-1.5 rounded-full bg-th-border overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: pct === 100 ? '#FFD706' : pct >= 50 ? '#FF8200' : '#807D73',
              }}
            />
          </div>
          {pickedOfPlayed < totalPlayed && (
            <p className="text-[11px] text-[#FF8200] mt-1.5">
              {totalPlayed - pickedOfPlayed} played match{totalPlayed - pickedOfPlayed !== 1 ? 'es' : ''} without a pick
            </p>
          )}
        </div>
      )}
    </section>
  )
}

// ── Main Picks page ────────────────────────────────────────────
export default function Picks() {
  const { myPicks, results, liveScores, koMatches, kickoffs, user, isAdmin, savePick, participants, allPicks, lineups, myScorer, matchGoals, matchMeta, saveScorerPick } = useApp()

  const effectiveResults = useMemo(() => {
    const live = {}
    for (const [mid, m] of Object.entries(liveScores)) {
      if (results[mid]) continue
      live[mid] = { matchId: mid, home: m.homeScore, away: m.awayScore, winner: null }
    }
    return Object.keys(live).length ? { ...results, ...live } : results
  }, [results, liveScores])
  const { toast } = useToast()

  async function handleSave(matchId, home, away, winner) {
    try {
      await savePick(matchId, home, away, winner)
      toast({ title: 'Pick saved ✓' })
    } catch (e) {
      toast({ title: 'Failed to save pick', variant: 'destructive' })
    }
  }

  async function handleSaveScorer(matchId, team, playerId, playerName) {
    try {
      await saveScorerPick(matchId, team, playerId, playerName)
      toast({ title: 'Scorer pick saved ✓' })
    } catch (e) {
      toast({ title: 'Failed to save scorer pick', variant: 'destructive' })
    }
  }

  function exportPicks() {
    const data = { email: user?.email, name: user?.name, picks: myPicks, exported: new Date().toISOString() }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = `wc2026-picks-${user?.name?.replace(/\s+/g, '-') || 'me'}.json`
    a.click()
  }

  if (isAdmin) {
    return (
      <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-6">
        <div className="rounded-xl border border-th-border bg-th-border/20 p-6 text-center text-th-muted">
          <Lock className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-semibold">Admins can't enter picks</p>
          <p className="text-sm mt-1">Log in with a participant account to pick scores.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-th-text tracking-tight">My Picks</h1>
          <p className="text-th-muted text-sm mt-0.5">{user?.name}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={exportPicks}>
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      {/* My progress */}
      <PicksProgress
        myPicks={myPicks}
        results={effectiveResults}
        participants={participants}
        allPicks={allPicks}
        user={user}
        myScorer={myScorer}
        matchGoals={matchGoals}
      />

      <Countdown />

      <HowItWorks />

      <Tabs defaultValue="group">
        <TabsList className="w-full mb-4 overflow-x-auto h-auto gap-1 justify-start">
          <TabsTrigger value="group">Group Stage</TabsTrigger>
          <TabsTrigger value="r32">R32</TabsTrigger>
          <TabsTrigger value="r16">R16</TabsTrigger>
          <TabsTrigger value="qf">QF</TabsTrigger>
          <TabsTrigger value="sf">SF</TabsTrigger>
          <TabsTrigger value="tp">3rd Place</TabsTrigger>
          <TabsTrigger value="final">Final</TabsTrigger>
        </TabsList>

        <TabsContent value="group">
          <div className="text-xs text-th-muted bg-th-border/30 rounded-lg px-3 py-2 mb-4">
            📊 Group Stage: <span className="text-th-text font-semibold">1pt</span> right result · <span className="text-[#FFD706] font-semibold">3pts</span> exact score
          </div>
          <MatchDayView
            myPicks={myPicks}
            results={effectiveResults}
            kickoffs={kickoffs}
            onSave={handleSave}
            lineups={lineups}
            myScorer={myScorer}
            matchGoals={matchGoals}
            matchMeta={matchMeta}
            onSaveScorer={handleSaveScorer}
          />
        </TabsContent>

        {KO_ROUNDS.map(round => (
          <TabsContent key={round.id} value={round.id}>
            <KORound
              round={round}
              myPicks={myPicks}
              results={effectiveResults}
              koMatches={koMatches}
              kickoffs={kickoffs}
              onSave={handleSave}
              isAdmin={isAdmin}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
