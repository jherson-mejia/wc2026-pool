import { useRef } from 'react'
import { Badge } from './ui/badge'
import { getFlag, GROUP_SCORING } from '@/data/worldcup'
import { calcMatchPoints } from '@/lib/scoring'
import { cn } from '@/lib/utils'

export default function MatchCard({ match, pick = {}, result, onSave, disabled = false, kickoff = null }) {
  const homeRef = useRef(null)
  const awayRef = useRef(null)
  const timerRef = useRef(null)

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

  return (
    <div className={cn(
      'rounded-xl border p-4 transition-all',
      isExact   ? 'border-[#FFD706]/40 bg-[#FFD706]/5' :
      isCorrect ? 'border-[#22c55e]/30 bg-[#22c55e]/5' :
      locked    ? 'border-[#32312D] bg-[#0D0D0B]/60' :
                  'border-[#32312D] bg-[#0D0D0B]/60 hover:border-[#807D73]',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 text-xs text-[#807D73]">
        <span className="font-medium">MD{match.matchday}{match.simultaneous ? ' · sim' : ''}</span>
        {result
          ? <Badge variant="success">✓ {result.home}–{result.away}</Badge>
          : kickoffLocked
            ? <Badge variant="locked">🔒 Locked</Badge>
            : hasPick
              ? <Badge variant="pending">Picked</Badge>
              : <Badge variant="locked">—</Badge>}
      </div>

      {/* Teams + score */}
      <div className="grid grid-cols-[1fr_80px_1fr] items-center gap-2">
        {/* Home */}
        <div className="text-center">
          <div className="text-4xl leading-none mb-1.5">{getFlag(match.home)}</div>
          <div className="text-[11px] font-bold text-[#FFFDF2] leading-tight px-1 truncate">{match.home}</div>
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
          {!locked && <div className="text-[10px] text-[#807D73]">vs</div>}
        </div>

        {/* Away */}
        <div className="text-center">
          <div className="text-4xl leading-none mb-1.5">{getFlag(match.away)}</div>
          <div className="text-[11px] font-bold text-[#FFFDF2] leading-tight px-1 truncate">{match.away}</div>
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
