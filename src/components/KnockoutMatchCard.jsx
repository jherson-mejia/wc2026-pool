import { useRef } from 'react'
import { Lock } from 'lucide-react'
import { Badge } from './ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select'
import { getFlag } from '@/data/worldcup'
import { calcMatchPoints } from '@/lib/scoring'
import { cn } from '@/lib/utils'

export default function KnockoutMatchCard({ matchId, roundId, scoring, km, pick = {}, result, onSave, disabled, kickoff = null }) {
  const homeRef = useRef(null)
  const awayRef = useRef(null)
  const timerRef = useRef(null)

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

  if (!unlocked) {
    return (
      <div className="rounded-xl border border-[#32312D] bg-[#0D0D0B]/40 p-4 flex items-center gap-3 opacity-40">
        <Lock className="h-4 w-4 text-[#807D73] shrink-0" />
        <div>
          <div className="text-sm font-semibold text-[#807D73]">Match {matchNum}</div>
          <div className="text-xs text-[#807D73] mt-0.5">Teams TBD — unlocks once admin sets matchup</div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'rounded-xl border p-4 transition-all',
      isExact   ? 'border-[#FFD706]/40 bg-[#FFD706]/5' :
      isCor     ? 'border-[#22c55e]/30 bg-[#22c55e]/5' :
      locked    ? 'border-[#32312D] bg-[#0D0D0B]/60' :
                  'border-[#FFD706]/20 bg-[#0D0D0B]/60 hover:border-[#FFD706]/50',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 text-xs text-[#807D73]">
        <span className="font-medium">Match {matchNum}</span>
        {result
          ? <Badge variant="success">✓ {km.home} {result.home}–{result.away} {km.away}</Badge>
          : kickoffLocked
            ? <Badge variant="locked">🔒 Locked</Badge>
            : hasPick
              ? <Badge variant="pending">Picked</Badge>
              : <Badge variant="tangerine">Open — pick now!</Badge>}
      </div>

      {/* Teams + score */}
      <div className="grid grid-cols-[1fr_72px_1fr] items-center gap-2">
        <div className="text-right text-sm font-bold">{getFlag(km.home)} {km.home}</div>

        <div className="flex items-center justify-center gap-1">
          {locked ? (
            <>
              <span className={cn('score-input flex items-center justify-center pointer-events-none',
                isExact ? 'text-[#FFD706]' : isCor ? 'text-[#22c55e]' : 'text-[#807D73]'
              )}>
                {hasPick ? pick.home : '–'}
              </span>
              <span className="text-[#807D73] text-xs">–</span>
              <span className={cn('score-input flex items-center justify-center pointer-events-none',
                isExact ? 'text-[#FFD706]' : isCor ? 'text-[#22c55e]' : 'text-[#807D73]'
              )}>
                {hasPick ? pick.away : '–'}
              </span>
            </>
          ) : (
            <>
              <input ref={homeRef} type="number" min="0" max="99"
                defaultValue={hasPick ? pick.home : ''} placeholder="0"
                className="score-input" onChange={queue} />
              <span className="text-[#807D73] text-xs font-bold">–</span>
              <input ref={awayRef} type="number" min="0" max="99"
                defaultValue={hasPick ? pick.away : ''} placeholder="0"
                className="score-input" onChange={queue} />
            </>
          )}
        </div>

        <div className="text-left text-sm font-bold">{getFlag(km.away)} {km.away}</div>
      </div>

      {/* Winner selector */}
      {!locked && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[#807D73]">Winner if tied after 90 min:</span>
          <Select value={pick.winner || ''} onValueChange={onWinnerChange}>
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue placeholder="— select —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="home">{km.home}</SelectItem>
              <SelectItem value="away">{km.away}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Points */}
      {pts != null && (
        <div className="mt-3 flex justify-end">
          {isExact
            ? <span className="text-xs text-[#FFD706] font-bold bg-[#FFD706]/10 border border-[#FFD706]/20 rounded-full px-2.5 py-1">🎯 +{pts} pts — exact!</span>
            : isCor
              ? <span className="text-xs text-[#22c55e] font-semibold">✓ +{pts} pts</span>
              : <span className="text-xs text-[#807D73]">+0 pts</span>}
        </div>
      )}
    </div>
  )
}
