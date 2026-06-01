import { useRef } from 'react'
import { Badge } from './ui/badge'
import { getFlag, GROUP_SCORING } from '@/data/worldcup'
import { calcMatchPoints } from '@/lib/scoring'
import { cn, fmtKickoff } from '@/lib/utils'

export default function MatchCard({ match, pick = {}, result, onSave, disabled = false, kickoff = null }) {
  const homeRef = useRef(null)
  const awayRef = useRef(null)
  const timerRef = useRef(null)

  const ki           = fmtKickoff(kickoff)
  const kickoffLocked = kickoff ? Date.now() >= new Date(kickoff).getTime() : false
  const locked    = !!result || disabled || kickoffLocked
  const hasPick   = pick.home != null && pick.away != null
  const pts       = result ? calcMatchPoints(pick, result, 'group') : null
  const isExact   = pts != null && pts >= GROUP_SCORING.exact
  const isCorrect = pts != null && pts >= GROUP_SCORING.result

  function queue() {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const h = parseInt(homeRef.current?.value)
      const a = parseInt(awayRef.current?.value)
      if (!isNaN(h) && !isNaN(a)) onSave?.(match.id, h, a, null)
    }, 700)
  }

  const scoreColor = isExact ? 'text-[#FFD706]' : isCorrect ? 'text-[#22c55e]' : 'text-[#807D73]'

  const borderClass = isExact   ? 'border-[#FFD706]/40 bg-[#FFD706]/5'
    : isCorrect ? 'border-[#22c55e]/30 bg-[#22c55e]/5'
    : ki?.isToday && !result ? 'border-[#FF8200]/40 bg-[#FF8200]/5'
    : locked    ? 'border-[#32312D] bg-[#0D0D0B]/60'
    :             'border-[#32312D] bg-[#0D0D0B]/60 hover:border-[#807D73]'

  return (
    <div className={cn('rounded-xl border p-4 transition-all', borderClass)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 text-xs text-[#807D73]">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="font-medium shrink-0">MD{match.matchday}</span>
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
            ? <Badge variant="success">✓ {result.home}–{result.away}</Badge>
            : kickoffLocked
              ? <Badge variant="locked">🔒 Locked</Badge>
              : hasPick
                ? <Badge variant="pending">Picked</Badge>
                : <Badge variant="locked">—</Badge>}
        </div>
      </div>

      {/* Teams + score */}
      <div className="grid grid-cols-[1fr_64px_1fr] items-center gap-1.5">
        {/* Home */}
        <div className="text-center">
          <div className="text-3xl leading-none mb-1">{getFlag(match.home)}</div>
          <div className="text-[10px] font-bold text-[#FFFDF2] leading-tight px-1 truncate">{match.home}</div>
        </div>

        {/* Score */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            {locked ? (
              <>
                <span className={cn('score-input flex items-center justify-center pointer-events-none', scoreColor)}>
                  {hasPick ? pick.home : '–'}
                </span>
                <span className="text-[#807D73] text-xs font-bold">–</span>
                <span className={cn('score-input flex items-center justify-center pointer-events-none', scoreColor)}>
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
          {!locked && ki && !ki.isLive && (
            <div className="text-[10px] text-[#807D73]">
              {ki.isToday && ki.hoursUntil > 0 ? `in ${ki.hoursUntil}h` : 'vs'}
            </div>
          )}
          {!locked && (!ki || ki.isLive) && <div className="text-[10px] text-[#807D73]">vs</div>}
        </div>

        {/* Away */}
        <div className="text-center">
          <div className="text-3xl leading-none mb-1">{getFlag(match.away)}</div>
          <div className="text-[10px] font-bold text-[#FFFDF2] leading-tight px-1 truncate">{match.away}</div>
        </div>
      </div>

      {/* Points earned */}
      {pts != null && (
        <div className="mt-3 flex justify-center">
          {isExact
            ? <span className="text-xs text-[#FFD706] font-bold bg-[#FFD706]/10 border border-[#FFD706]/20 rounded-full px-3 py-1">🎯 +{pts} pts — exact!</span>
            : isCorrect
              ? <span className="text-xs text-[#22c55e] font-semibold">✓ +{pts} pt</span>
              : <span className="text-xs text-[#807D73]">+0 pts</span>}
        </div>
      )}
    </div>
  )
}
