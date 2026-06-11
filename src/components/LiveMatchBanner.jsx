import { getFlag } from '@/data/worldcup'
import { useApp } from '@/context/AppContext'
import { cn } from '@/lib/utils'

function formatMinute(match) {
  if (match.status === 'PAUSED') {
    return match.minute >= 105 ? 'ET HT' : 'HT'
  }
  if (match.minute == null) return null
  if (match.injuryTime) return `${match.minute}+${match.injuryTime}'`
  return `${match.minute}'`
}

function LiveCard({ match }) {
  const minute = formatMinute(match)
  const lastGoal = match.goals?.at(-1)

  return (
    <div className="rounded-xl border border-[#FF4444]/40 bg-[#FF4444]/8 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        {/* Home */}
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
          <span className="text-xs font-semibold text-th-text truncate text-right">{match.home}</span>
          <span className="text-lg leading-none shrink-0">{getFlag(match.home)}</span>
        </div>

        {/* Score + minute */}
        <div className="shrink-0 text-center">
          <div className="text-xl font-extrabold text-th-text tabular-nums leading-none">
            {match.homeScore} – {match.awayScore}
          </div>
          <div className={cn(
            'text-[10px] font-bold mt-0.5 tabular-nums',
            match.status === 'PAUSED' ? 'text-[#FFD706]' : 'text-[#FF4444]'
          )}>
            {minute ?? '—'}
          </div>
        </div>

        {/* Away */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg leading-none shrink-0">{getFlag(match.away)}</span>
          <span className="text-xs font-semibold text-th-text truncate">{match.away}</span>
        </div>
      </div>

      {lastGoal && (
        <div className="mt-1.5 text-[10px] text-th-muted text-center">
          ⚽ {lastGoal.scorerName ?? 'Unknown'} {lastGoal.minute ? `${lastGoal.minute}'` : ''}
        </div>
      )}
    </div>
  )
}

export default function LiveMatchBanner() {
  const { liveScores } = useApp()
  const matches = Object.values(liveScores)
  if (!matches.length) return null

  return (
    <div className="space-y-2 mb-4">
      <div className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-[#FF4444] animate-pulse" />
        <span className="text-xs font-bold text-[#FF4444] uppercase tracking-wider">Live</span>
      </div>
      {matches.map(m => (
        <LiveCard key={m.matchId} match={m} />
      ))}
    </div>
  )
}
