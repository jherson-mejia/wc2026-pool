import { useState } from 'react'
import { Trophy, LogOut, Settings, Sun, Moon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { useTheme } from '@/context/ThemeContext'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/leaderboard', label: 'Standings',  emoji: '🏆' },
  { to: '/tournament',  label: 'Tournament', emoji: '🌍' },
  { to: '/picks',       label: 'My Picks',   emoji: '⚽' },
]

export default function Header() {
  const { user, isAdmin, poolName, logout } = useApp()
  const { theme, toggle } = useTheme()
  const [emblemErr, setEmblemErr] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-th-bg/95 backdrop-blur-md border-b border-th-border">
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
            <div className="text-[10px] text-th-muted leading-none mt-0.5 flex items-center gap-1">
              🇺🇸🇨🇦🇲🇽 · Jun 11 – Jul 19
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-th-subtle bg-th-border/60 border border-th-border px-2.5 py-1.5 rounded-full max-w-[120px] sm:max-w-none truncate">
            {isAdmin ? '🔧' : '⚽'} <span className="truncate">{isAdmin ? 'Admin' : user?.name}</span>
          </span>
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-th-muted hover:text-th-text hover:bg-th-border/60 transition-all"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={logout}
            title="Log out"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-th-muted hover:text-th-text hover:bg-th-border/60 transition-all"
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
                  : 'border-transparent text-th-muted hover:text-th-text hover:border-th-border'
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
                  : 'border-transparent text-th-muted hover:text-th-text hover:border-th-border'
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
