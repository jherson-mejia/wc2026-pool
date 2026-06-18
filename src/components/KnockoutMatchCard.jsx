import { useRef } from 'react'
import { Lock } from 'lucide-react'
import { Badge } from './ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select'
import ScorerPicker from './ScorerPicker'
import { getFlag } from '@/data/worldcup'
import { calcMatchPoints } from '@/lib/scoring'
import { cn, fmtKickoff } from '@/lib/utils'

export default function KnockoutMatchCard({ matchId, roundId, scoring, km, pick = {}, result, onSave, disabled, kickoff = null, lineup, homeRoster, awayRoster, myScorerHome, myScorerAway, matchGoals, onSaveScorer }) {
  const homeRef = useRef(null)
  const awayRef = useRef(null)
  const timerRef = useRef(null)

  const ki            = fmtKickoff(kickoff)
  const unlocked      = !!(km?.home && km?.away)
  const kickoffLocked = kickoff ? Date.now() >= new Date(kickoff).getTime() : false
  const locked        = !!result || disabled || kickoffLocked
  const hasPick       = pick.home != null && pick.away != null
  const pts     = result ? calcMatchPoints(pick, result, roundId) : null
  const isExact = pts != null && pts >= scoring.exact
  const isCor   = pts != null && pts >= scoring.result

  function queue() {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const h = parseInt(homeRef.current?.value)
      const a = parseInt(awayRef.current?.value)
      if (!isNaN(h) && !isNaN(a)) onSave?.(matchId, h, a, pick.winner || null)
    }, 700)
  }

  function onWinnerChange(val) {
    if (!hasPick) return
    onSave?.(matchId, pick.home, pick.away, val)
  }

  const matchNum = matchId.split('_')[1]
  const scoreColor = isExact ? 'text-[#FFD706]' : isCor ? 'text-[#22c55e]' : 'text-th-muted'

  if (!unlocked) {
    return (
      <div className="rounded-xl border border-th-border bg-th-bg/40 p-4 flex items-center gap-3 opacity-40">
        <Lock className="h-4 w-4 text-th-muted shrink-0" />
        <div>
          <div className="text-sm font-semibold text-th-muted">Match {matchNum}</div>
          <div className="text-xs text-th-muted mt-0.5">Teams TBD — unlocks once admin sets matchup</div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'rounded-xl border p-4 transition-all',
      isExact ? 'border-[#FFD706]/40 bg-[#FFD706]/5' :
      isCor   ? 'border-[#22c55e]/30 bg-[#22c55e]/5' :
      locked  ? 'border-th-border bg-th-bg/60' :
                'border-[#FFD706]/20 bg-th-bg/60 hover:border-[#FFD706]/50',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 text-xs text-th-muted">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="font-medium shrink-0">Match {matchNum}</span>
          {ki && (
            ki.isLive ? (
              <span className="flex items-center gap-1 text-[#FF8200] font-bold shrink-0">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FF8200] animate-pulse" />
                LIVE
              </span>
            ) : (
              <span className={cn('shrink-0', ki.isToday ? 'text-[#FF8200] font-semibold' : '')}>
                {ki.day} · {ki.time}
              </span>
            )
          )}
        </div>
        <div className="shrink-0 ml-2">
          {result
            ? <Badge variant="success">✓ {result.home}–{result.away}{result.homePens != null ? ` · pens ${result.homePens}–${result.awayPens}` : ''}</Badge>
            : kickoffLocked
              ? <Badge variant="locked">🔒 Locked</Badge>
              : hasPick
                ? <Badge variant="pending">Picked</Badge>
                : <Badge variant="tangerine">Open — pick now!</Badge>}
        </div>
      </div>

      {/* Teams + score */}
      <div className="grid grid-cols-[1fr_64px_1fr] items-center gap-1.5">
        {/* Home */}
        <div className="text-center">
          <div className="text-3xl sm:text-4xl leading-none mb-1">{getFlag(km.home)}</div>
          <div className="text-[10px] sm:text-xs font-bold text-th-text leading-tight px-1 truncate">{km.home}</div>
        </div>

        {/* Score */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            {locked ? (
              <>
                <span className={cn('score-input flex items-center justify-center pointer-events-none', scoreColor)}>
                  {hasPick ? pick.home : '–'}
                </span>
                <span className="text-th-muted text-xs">–</span>
                <span className={cn('score-input flex items-center justify-center pointer-events-none', scoreColor)}>
                  {hasPick ? pick.away : '–'}
                </span>
              </>
            ) : (
              <>
                <input ref={homeRef} type="number" min="0" max="99"
                  defaultValue={hasPick ? pick.home : ''} placeholder="-"
                  className="score-input" onChange={queue} />
                <span className="text-th-muted text-xs font-bold">–</span>
                <input ref={awayRef} type="number" min="0" max="99"
                  defaultValue={hasPick ? pick.away : ''} placeholder="-"
                  className="score-input" onChange={queue} />
              </>
            )}
          </div>
          {!locked && <div className="text-[10px] text-th-muted">vs</div>}
        </div>

        {/* Away */}
        <div className="text-center">
          <div className="text-3xl sm:text-4xl leading-none mb-1">{getFlag(km.away)}</div>
          <div className="text-[10px] sm:text-xs font-bold text-th-text leading-tight px-1 truncate">{km.away}</div>
        </div>
      </div>

      {/* Penalties display */}
      {result?.homePens != null && (
        <div className="text-center text-[10px] text-th-muted mt-1">
          Penalties: <span className="font-semibold text-th-text">{result.homePens}–{result.awayPens}</span>
        </div>
      )}

      {/* Winner selector */}
      {!locked && (
        <div className="mt-3 flex items-center gap-2 flex-wrap justify-center">
          <span className="text-xs text-th-muted">Winner if tied after 90 min:</span>
          <Select value={pick.winner || ''} onValueChange={onWinnerChange}>
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue placeholder="— select —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="home">{getFlag(km.home)} {km.home}</SelectItem>
              <SelectItem value="away">{getFlag(km.away)} {km.away}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Points */}
      {pts != null && (
        <div className="mt-3 flex justify-center">
          {isExact
            ? <span className="text-xs text-[#FFD706] font-bold bg-[#FFD706]/10 border border-[#FFD706]/20 rounded-full px-3 py-1">🎯 +{pts} pts — exact!</span>
            : isCor
              ? <span className="text-xs text-[#22c55e] font-semibold">✓ +{pts} pts</span>
              : <span className="text-xs text-th-muted">+0 pts</span>}
        </div>
      )}

      {/* Scorer picks — shown when lineup, roster, or a locked pick exists */}
      {(() => {
        const hasHL = !!(lineup?.homeLineup?.length || lineup?.homeBench?.length)
        const hasAL = !!(lineup?.awayLineup?.length || lineup?.awayBench?.length)
        if (!hasHL && !hasAL && !homeRoster?.players?.length && !awayRoster?.players?.length
          && !(locked && (myScorerHome || myScorerAway))) return null
        return (
          <div className="mt-3 pt-3 border-t border-th-border/50 space-y-2">
            {!hasHL && !hasAL && (
              <p className="text-[10px] text-th-muted text-center">Full squad — official lineup updates ~1h before kickoff</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-[10px] text-th-muted uppercase tracking-wide">{km.home} scorer</span>
                <ScorerPicker
                  lineup={lineup?.homeLineup}
                  bench={lineup?.homeBench}
                  roster={!hasHL ? homeRoster?.players : undefined}
                  pick={myScorerHome}
                  locked={locked}
                  matchGoals={matchGoals}
                  teamId={hasHL ? lineup.homeTeamId : homeRoster?.fdTeamId}
                  onSave={(playerId, playerName) => onSaveScorer?.(matchId, 'home', playerId, playerName)}
                />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-[10px] text-th-muted uppercase tracking-wide">{km.away} scorer</span>
                <ScorerPicker
                  lineup={lineup?.awayLineup}
                  bench={lineup?.awayBench}
                  roster={!hasAL ? awayRoster?.players : undefined}
                  pick={myScorerAway}
                  locked={locked}
                  matchGoals={matchGoals}
                  teamId={hasAL ? lineup.awayTeamId : awayRoster?.fdTeamId}
                  onSave={(playerId, playerName) => onSaveScorer?.(matchId, 'away', playerId, playerName)}
                />
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
