import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, ArrowRight, Settings, UserPlus, LogIn } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/components/ui/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TEAM_FLAGS } from '@/data/worldcup'

const ALL_FLAGS = Object.values(TEAM_FLAGS)

export default function Login() {
  const { login, loginByEmail, adminLogin, poolName } = useApp()
  const { toast } = useToast()
  const nav = useNavigate()

  const [mode, setMode]           = useState('signin') // 'signin' | 'register'
  const [email, setEmail]         = useState('')
  const [name, setName]           = useState('')
  const [adminPw, setAdminPw]     = useState('')
  const [showAdmin, setShowAdmin] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [emblemErr, setEmblemErr] = useState(false)

  function switchMode(m) {
    setMode(m)
    setEmail('')
    setName('')
    setLoading(false)
  }

  async function handleSignIn() {
    if (!email.trim() || !email.includes('@')) {
      toast({ title: 'Enter your work email', variant: 'destructive' }); return
    }
    setLoading(true)
    try {
      await loginByEmail(email.trim())
      nav('/leaderboard')
    } catch {
      toast({ title: 'No account found — register below', variant: 'destructive' })
      setMode('register')
    } finally { setLoading(false) }
  }

  async function handleRegister() {
    if (!name.trim()) {
      toast({ title: 'Enter your name', variant: 'destructive' }); return
    }
    if (!email.trim() || !email.includes('@')) {
      toast({ title: 'Enter a valid work email', variant: 'destructive' }); return
    }
    setLoading(true)
    try {
      await login(name.trim(), email.trim())
      nav('/leaderboard')
    } catch (e) {
      toast({ title: e.message, variant: 'destructive' })
    } finally { setLoading(false) }
  }

  async function handleAdmin() {
    setLoading(true)
    try { await adminLogin(adminPw); nav('/leaderboard') }
    catch { toast({ title: 'Wrong admin password', variant: 'destructive' }) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-th-bg relative flex flex-col items-center justify-center px-4 py-12 overflow-hidden">
      {/* Ambient blobs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-[#FFD706]/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-[#FF8200]/4 blur-[100px] pointer-events-none" />

      {/* Flag parade — top */}
      <div className="absolute top-0 left-0 right-0 flex justify-center flex-wrap gap-x-3 px-4 pt-3 pointer-events-none select-none overflow-hidden h-12">
        {ALL_FLAGS.map((f, i) => <span key={i} className="text-xl opacity-[0.12]">{f}</span>)}
      </div>

      {/* Flag parade — bottom */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center flex-wrap gap-x-3 px-4 pb-3 pointer-events-none select-none overflow-hidden h-12">
        {[...ALL_FLAGS].reverse().map((f, i) => <span key={i} className="text-xl opacity-[0.12]">{f}</span>)}
      </div>

      <div className="relative w-full max-w-sm animate-slide-up">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-[#FFD706] mb-5 glow-yellow overflow-hidden">
            {!emblemErr ? (
              <img
                src="https://crests.football-data.org/wm26.png"
                alt="FIFA World Cup 2026"
                className="w-20 h-20 object-contain"
                onError={() => setEmblemErr(true)}
              />
            ) : (
              <Trophy className="h-10 w-10 text-[#0D0D0B]" />
            )}
          </div>
          <div className="text-[11px] font-bold tracking-[0.25em] uppercase text-th-muted mb-2">
            FIFA World Cup 2026
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight leading-none text-th-text mb-1">
            {poolName}
          </h1>
          <p className="text-th-muted text-sm mt-2.5">🇺🇸 🇨🇦 🇲🇽 · June 11 – July 19</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl border border-th-border bg-th-border/20 p-1 mb-4 gap-1">
          <button
            onClick={() => switchMode('signin')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'signin'
                ? 'bg-[#FFD706] text-[#0D0D0B]'
                : 'text-th-muted hover:text-th-text'
            }`}
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign In
          </button>
          <button
            onClick={() => switchMode('register')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'register'
                ? 'bg-[#FFD706] text-[#0D0D0B]'
                : 'text-th-muted hover:text-th-text'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Register
          </button>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border border-th-border bg-th-border/20 p-6 space-y-4 backdrop-blur-sm"
          style={{ borderTop: '2px solid #FFD706' }}
        >
          {mode === 'signin' ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-th-subtle uppercase tracking-wider">Work Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="maria@recurly.com"
                  onKeyDown={e => e.key === 'Enter' && handleSignIn()}
                  className="h-11 bg-th-surface-alt text-th-text"
                  autoFocus
                />
              </div>
              <button
                onClick={handleSignIn}
                disabled={loading}
                className="w-full h-11 rounded-lg bg-[#FFD706] text-[#0D0D0B] font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 hover:bg-[#FFE033] glow-yellow-sm hover:glow-yellow"
              >
                {loading ? 'Signing in…' : <><span>Sign In</span><ArrowRight className="h-4 w-4" /></>}
              </button>
              <p className="text-xs text-th-muted text-center">
                New to the pool? &nbsp;&nbsp;
                <button onClick={() => switchMode('register')} className="text-[#FFD706] hover:underline font-semibold">
                  Register here
                </button>
              </p>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-th-subtle uppercase tracking-wider">Your Name</Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="John Doe"
                  onKeyDown={e => e.key === 'Enter' && handleRegister()}
                  className="h-11 bg-th-surface-alt text-th-text"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-th-subtle uppercase tracking-wider">
                  Work Email <span className="text-th-muted font-normal normal-case tracking-normal">· becomes your ID</span>
                </Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jdoe@recurly.com"
                  onKeyDown={e => e.key === 'Enter' && handleRegister()}
                  className="h-11 bg-th-surface-alt text-th-text"
                />
              </div>
              <button
                onClick={handleRegister}
                disabled={loading}
                className="w-full h-11 rounded-lg bg-[#FFD706] text-[#0D0D0B] font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 hover:bg-[#FFE033] glow-yellow-sm hover:glow-yellow"
              >
                {loading ? 'Joining…' : <><span>Join the Pool</span><ArrowRight className="h-4 w-4" /></>}
              </button>
              <p className="text-xs text-th-muted text-center">
                Already joined? &nbsp;&nbsp;
                <button onClick={() => switchMode('signin')} className="text-[#FFD706] hover:underline font-semibold">
                  Sign in
                </button>
              </p>
            </>
          )}

          {/* Admin */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-th-border" />
            <span className="text-[11px] text-th-muted">or</span>
            <div className="flex-1 h-px bg-th-border" />
          </div>

          <button
            onClick={() => setShowAdmin(v => !v)}
            className="flex items-center gap-1.5 text-xs text-th-muted hover:text-th-text transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Admin sign in
          </button>

          {showAdmin && (
            <div className="space-y-3">
              <Input
                type="password"
                value={adminPw}
                onChange={e => setAdminPw(e.target.value)}
                placeholder="Admin password"
                onKeyDown={e => e.key === 'Enter' && handleAdmin()}
                className="h-11 bg-th-surface-alt text-th-text"
              />
              <button
                onClick={handleAdmin}
                disabled={loading}
                className="w-full h-10 rounded-lg border border-th-border bg-th-border/60 text-th-text font-semibold text-sm hover:bg-th-border transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing in…' : 'Sign in as Admin'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
