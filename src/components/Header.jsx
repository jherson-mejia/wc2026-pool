import { useState } from 'react'
import { Trophy, LogOut, Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/leaderboard', label: 'Standings',  emoji: '🏆' },
  { to: '/tournament',  label: 'Tournament', emoji: '🌍' },
  { to: '/picks',       label: 'My Picks',   emoji: '⚽' },
]

export default function Header() {
  const { user, isAdmin, poolName, logout } = useApp()
  const [emblemErr, setEmblemErr] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-[#0D0D0B]/95 backdrop-blur-md border-b border-[#1A1A17]">
      {/* Yellow → tangerine gradient accent line */}
      <div
        className="h-0.5 w-full"
        style={{ background: 'linear-gradient(90deg, #FFD706 0%, #FF8200 55%, transparent 100%)' }}
      />

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 max-w-4xl mx-auto">
        <div className="flex items-center gap-2.5">
          {/* WC emblem */}
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#FFD706] shrink-0 overflow-hidden">
            {!emblemErr ? (
              <img
                src="https://crests.football-data.org/wm26.png"
                alt="WC 2026"
                className="w-8 h-8 object-contain"
                onError={() => setEmblemErr(true)}
              />
            ) : (
              <Trophy className="h-4 w-4 text-[#0D0D0B]" />
            )}
          </div>
          <div>
            <div className="text-lg font-extrabold leading-tight tracking-tight text-gradient">
              {poolName}
            </div>
            <div className="text-[10px] text-[#807D73] leading-none mt-0.5 flex items-center gap-1">
              🇺🇸🇨🇦🇲🇽 · Jun 11 – Jul 19
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-[#CCC9B8] bg-[#32312D]/60 border border-[#32312D] px-2.5 py-1.5 rounded-full max-w-[120px] sm:max-w-none truncate">
            {isAdmin ? '🔧' : '⚽'} <span className="truncate">{isAdmin ? 'Admin' : user?.name}</span>
          </span>
          <button
            onClick={logout}
            title="Log out"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#807D73] hover:text-[#FFFDF2] hover:bg-[#32312D]/60 transition-all"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Nav tabs */}
      <nav className="flex overflow-x-auto max-w-4xl mx-auto px-4">
        {NAV.map(({ to, label, emoji }) => (
          <NavLink key={to} to={to}>
            {({ isActive }) => (
              <button className={cn(
                'px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5',
                isActive
                  ? 'border-[#FFD706] text-[#FFD706]'
                  : 'border-transparent text-[#807D73] hover:text-[#FFFDF2] hover:border-[#32312D]'
              )}>
                {isActive && <span className="text-[13px]">{emoji}</span>}
                {label}
              </button>
            )}
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink to="/admin">
            {({ isActive }) => (
              <button className={cn(
                'px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5',
                isActive
                  ? 'border-[#FF8200] text-[#FF8200]'
                  : 'border-transparent text-[#807D73] hover:text-[#FFFDF2] hover:border-[#32312D]'
              )}>
                <Settings className="h-3.5 w-3.5" />
                Admin
              </button>
            )}
          </NavLink>
        )}
      </nav>
    </header>
  )
}
