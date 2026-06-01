import { useState, useEffect, useMemo } from 'react'
import { Timer, Zap } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { GROUP_MATCHES } from '@/data/worldcup'

function formatTimeLeft(ms) {
  if (ms <= 0) return null
  const totalSecs = Math.floor(ms / 1000)
  const d = Math.floor(totalSecs / 86400)
  const h = Math.floor((totalSecs % 86400) / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60

  if (d > 0) return `${d}d ${h}h ${String(m).padStart(2, '0')}m`
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

export default function Countdown() {
  const { kickoffs, results, koMatches } = useApp()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const nextMatch = useMemo(() => {
    const upcoming = []

    for (const m of GROUP_MATCHES) {
      if (results[m.id] || !kickoffs[m.id]) continue
      const ts = new Date(kickoffs[m.id]).getTime()
      if (ts > now) upcoming.push({ ts, label: `${m.home} vs ${m.away}` })
    }

    for (const [mid, km] of Object.entries(koMatches)) {
      if (!km?.home || results[mid] || !kickoffs[mid]) continue
      const ts = new Date(kickoffs[mid]).getTime()
      if (ts > now) upcoming.push({ ts, label: `${km.home} vs ${km.away}` })
    }

    upcoming.sort((a, b) => a.ts - b.ts)
    return upcoming[0] ?? null
  }, [kickoffs, results, koMatches, now])

  if (!nextMatch) return null

  const ms = nextMatch.ts - now
  const formatted = formatTimeLeft(ms)
  const isUrgent = ms < 3600_000

  return (
    <div className={`rounded-xl border px-4 py-3.5 mb-5 flex items-center justify-between gap-4 transition-all ${
      isUrgent
        ? 'border-[#FF8200]/40 bg-[#FF8200]/6 shadow-[0_0_24px_rgba(255,130,0,0.1)]'
        : 'border-[#32312D] bg-[#32312D]/20'
    }`}>
      <div className="flex items-center gap-3 min-w-0">
        {isUrgent
          ? <Zap className="h-4 w-4 shrink-0 text-[#FF8200] animate-pulse" />
          : <Timer className="h-4 w-4 shrink-0 text-[#807D73]" />
        }
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[#807D73]">Next pick deadline</div>
          <div className="text-sm font-semibold text-[#FFFDF2] truncate mt-0.5">{nextMatch.label}</div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-mono font-bold text-xl tabular-nums ${isUrgent ? 'text-[#FF8200]' : 'text-[#FFD706]'}`}>
          {formatted}
        </div>
        <div className="text-[10px] text-[#807D73] uppercase tracking-wider mt-0.5">until lock</div>
      </div>
    </div>
  )
}
