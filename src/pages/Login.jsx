import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, ArrowRight, Settings } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/components/ui/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Login() {
  const { login, adminLogin, poolName } = useApp()
  const { toast } = useToast()
  const nav = useNavigate()

  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [adminPw, setAdminPw]     = useState('')
  const [showAdmin, setShowAdmin] = useState(false)
  const [loading, setLoading]     = useState(false)

  async function handleJoin() {
    if (!name.trim() || !email.trim() || !email.includes('@')) {
      toast({ title: 'Enter a valid name and work email', variant: 'destructive' }); return
    }
    setLoading(true)
    try { await login(name.trim(), email.trim()); nav('/leaderboard') }
    catch (e) { toast({ title: e.message, variant: 'destructive' }) }
    finally { setLoading(false) }
  }

  async function handleAdmin() {
    setLoading(true)
    try { await adminLogin(adminPw); nav('/leaderboard') }
    catch (e) { toast({ title: 'Wrong admin password', variant: 'destructive' }) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-[#0D0D0B] relative flex flex-col items-center justify-center px-4 py-12 overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-[#FFD706]/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-[#FF8200]/4 blur-[100px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/4 w-48 h-48 rounded-full bg-[#FFD706]/3 blur-[80px] pointer-events-none" />

      <div className="relative w-full max-w-sm animate-slide-up">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FFD706] mb-5 glow-yellow">
            <Trophy className="h-8 w-8 text-[#0D0D0B]" />
          </div>
          <div className="text-[11px] font-bold tracking-[0.25em] uppercase text-[#807D73] mb-2">
            World Cup 2026 · Pool
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight leading-none text-[#FFFDF2] mb-1">
            {poolName}
          </h1>
          <p className="text-[#807D73] text-sm mt-2.5">
            June 11 – July 19 · USA · Canada · Mexico
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border border-[#32312D] bg-[#32312D]/20 p-6 space-y-4 backdrop-blur-sm"
          style={{ borderTop: '2px solid #FFD706' }}
        >
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold text-[#CCC9B8] uppercase tracking-wider">
              Your Name
            </Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Maria Rodriguez"
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold text-[#CCC9B8] uppercase tracking-wider">
              Work Email <span className="text-[#807D73] font-normal normal-case tracking-normal">· your unique ID</span>
            </Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="maria@recurly.com"
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              className="h-11"
            />
          </div>

          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full h-11 rounded-lg bg-[#FFD706] text-[#0D0D0B] font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 hover:bg-[#FFE033] glow-yellow-sm hover:glow-yellow"
          >
            {loading ? 'Joining…' : <><span>Join the Pool</span><ArrowRight className="h-4 w-4" /></>}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-[#32312D]" />
            <span className="text-[11px] text-[#807D73]">or</span>
            <div className="flex-1 h-px bg-[#32312D]" />
          </div>

          <button
            onClick={() => setShowAdmin(v => !v)}
            className="flex items-center gap-1.5 text-xs text-[#807D73] hover:text-[#FFFDF2] transition-colors"
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
                className="h-11"
              />
              <button
                onClick={handleAdmin}
                disabled={loading}
                className="w-full h-10 rounded-lg border border-[#32312D] bg-[#32312D]/60 text-[#FFFDF2] font-semibold text-sm hover:bg-[#32312D] transition-colors disabled:opacity-50"
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
