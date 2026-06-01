import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function fmtKickoff(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const elapsed = now - d
  const isLive    = elapsed >= 0 && elapsed < 110 * 60 * 1000
  const isPast    = elapsed > 110 * 60 * 1000
  const isToday   = d.toDateString() === now.toDateString()
  const isTomorrow = d.toDateString() === new Date(now.getTime() + 86400000).toDateString()
  const hoursUntil = Math.round((d - now) / 3600000)
  const day  = isToday    ? 'Today'
             : isTomorrow ? 'Tomorrow'
             : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return { day, time, isLive, isPast, isToday, isTomorrow, hoursUntil, date: d }
}
