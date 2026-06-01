import { useState, useEffect, useMemo, useRef } from 'react'
import { Zap, Timer } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { GROUP_MATCHES } from '@/data/worldcup'
import { cn } from '@/lib/utils'

function useFlash(value) {
  const [flash, setFlash] = useState(false)
  const prev = useRef(value)
  useEffect(() => {
    if (prev.current !== value) {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 300)
      prev.current = value
      return () => clearTimeout(t)
    }
  }, [value])
  return flash
}

function TimeUnit({ value, label, urgent }) {
  const flash = useFlash(value)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn(
        'relative w-14 sm:w-16 h-14 sm:h-16 rounded-xl border flex items-center justify-center overflow-hidden transition-all duration-300',
        urgent
          ? 'border-[#FF8200]/50 bg-[#FF8200]/10'
          : 'border-[#32312D] bg-[#0D0D0B]/60',
        flash && 'scale-105',
      )}>
        {/* Divider line */}
        <div className={cn(
          'absolute inset-x-0 top-1/2 h-px',
          urgent ? 'bg-[#FF8200]/20' : 'bg-[#32312D]/80',
        )} />
        <span className={cn(
          'font-mono font-extrabold text-2xl sm:text-3xl tabular-nums leading-none transition-all duration-200',
          flash ? 'scale-110' : 'scale-100',
          urgent ? 'text-[#FF8200]' : 'text-[#FFD706]',
        )}>
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className={cn(
        'text-[9px] sm:text-[10px] uppercase tracking-widest font-semibold',
        urgent ? 'text-[#FF8200]/70' : 'text-[#807D73]',
      )}>{label}</span>
    </div>
  )
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

  const ms       = nextMatch.ts - now
  const isUrgent = ms < 3_600_000
  const total    = Math.max(0, Math.floor(ms / 1000))
  const d        = Math.floor(total / 86400)
  const h        = Math.floor((total % 86400) / 3600)
  const m        = Math.floor((total % 3600) / 60)
  const s        = total % 60

  return (
    <div className={cn(
      'rounded-xl border px-4 py-4 mb-5 transition-all duration-500',
      isUrgent
        ? 'border-[#FF8200]/40 bg-[#FF8200]/6 shadow-[0_0_32px_rgba(255,130,0,0.12)]'
        : 'border-[#32312D] bg-[#32312D]/20',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {isUrgent
            ? <Zap className="h-3.5 w-3.5 shrink-0 text-[#FF8200] animate-pulse" />
            : <Timer className="h-3.5 w-3.5 shrink-0 text-[#807D73]" />
          }
          <div className="min-w-0">
            <div className={cn('text-[10px] sm:text-xs uppercase tracking-wider font-semibold', isUrgent ? 'text-[#FF8200]' : 'text-[#807D73]')}>
              Next pick deadline
            </div>
            <div className="text-sm sm:text-base font-semibold text-[#FFFDF2] truncate">{nextMatch.label}</div>
          </div>
        </div>
        {isUrgent && (
          <span className="shrink-0 text-[10px] font-bold text-[#FF8200] bg-[#FF8200]/10 border border-[#FF8200]/30 rounded-full px-2 py-0.5 animate-pulse">
            SOON
          </span>
        )}
      </div>

      {/* Segmented time units */}
      <div className="flex items-end justify-center gap-2 sm:gap-3">
        {d > 0 && <TimeUnit value={d} label="Days" urgent={isUrgent} />}
        <TimeUnit value={h} label="Hrs" urgent={isUrgent} />
        <div className={cn('text-2xl sm:text-3xl font-bold mb-3.5 tabular-nums leading-none', isUrgent ? 'text-[#FF8200]/60' : 'text-[#32312D]')}>:</div>
        <TimeUnit value={m} label="Min" urgent={isUrgent} />
        <div className={cn('text-2xl sm:text-3xl font-bold mb-3.5 tabular-nums leading-none', isUrgent ? 'text-[#FF8200]/60' : 'text-[#32312D]')}>:</div>
        <TimeUnit value={s} label="Sec" urgent={isUrgent} />
      </div>
    </div>
  )
}
