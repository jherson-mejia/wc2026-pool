import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, Cloud, HardDrive, ChevronRight } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export default function Setup() {
  const { saveConfig } = useApp()
  const { toast } = useToast()
  const nav = useNavigate()

  const [mode, setMode]       = useState(null)
  const [poolName, setPoolName] = useState('Recurly WC2026 Pool')
  const [adminPass, setAdminPass] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!mode) { toast({ title: 'Choose a storage mode', variant: 'destructive' }); return }
    if (mode === 'local' && !adminPass) { toast({ title: 'Set an admin password', variant: 'destructive' }); return }

    setLoading(true)
    try {
      if (mode === 'server') {
        // Verify the server is reachable before saving config
        const res = await fetch('/api/config').catch(() => null)
        if (!res?.ok) {
          toast({ title: 'Cannot reach the pool server — is it running?', variant: 'destructive' })
          setLoading(false)
          return
        }
      }
      await saveConfig({ mode, poolName: poolName || 'Recurly WC2026 Pool', adminPassword: adminPass })
      nav('/login')
    } catch (e) {
      toast({ title: e.message || 'Setup failed', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0D0D0B] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FFD706] mb-4">
            <Trophy className="h-8 w-8 text-[#0D0D0B]" />
          </div>
          <h1 className="text-3xl font-extrabold text-[#FFFDF2] tracking-tight">World Cup 2026 Pool</h1>
          <p className="text-[#807D73] text-sm mt-2">One-time setup — only the pool organiser does this</p>
        </div>

        {/* Step 1 — Mode */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-[#FFD706] text-[#0D0D0B] text-xs font-bold flex items-center justify-center">1</span>
            <span className="text-sm font-semibold text-[#FFFDF2]">Choose Storage Mode</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                id: 'server',
                icon: Cloud,
                title: 'Server + Supabase',
                sub: 'Real-time · All devices · Credentials stay on server · Recommended',
              },
              {
                id: 'local',
                icon: HardDrive,
                title: 'Local Only',
                sub: 'Single browser · No server needed · Offline',
              },
            ].map(({ id, icon: Icon, title, sub }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={cn(
                  'flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all',
                  mode === id
                    ? 'border-[#FFD706] bg-[#FFD706]/5'
                    : 'border-[#32312D] bg-[#32312D]/40 hover:border-[#807D73]'
                )}
              >
                <Icon className={cn('h-5 w-5', mode === id ? 'text-[#FFD706]' : 'text-[#807D73]')} />
                <div>
                  <div className={cn('font-bold text-sm', mode === id ? 'text-[#FFD706]' : 'text-[#FFFDF2]')}>{title}</div>
                  <div className="text-xs text-[#807D73] mt-0.5">{sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Server mode info */}
        {mode === 'server' && (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#FFD706] text-[#0D0D0B] text-xs font-bold flex items-center justify-center">2</span>
                <CardTitle className="text-base">Server Setup</CardTitle>
              </div>
              <CardDescription className="text-xs space-y-1">
                <p>Pool name and admin password are set in the server's <code className="bg-[#32312D] px-1 rounded">.env</code> file — no credentials are stored in the browser.</p>
                <p className="mt-1">Make sure the server is running (<code className="bg-[#32312D] px-1 rounded">npm run server</code>) before continuing.</p>
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Local mode settings */}
        {mode === 'local' && (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#FFD706] text-[#0D0D0B] text-xs font-bold flex items-center justify-center">2</span>
                <CardTitle className="text-base">Pool Settings</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Pool Name</Label>
                <Input className="mt-1" value={poolName} onChange={e => setPoolName(e.target.value)} placeholder="Recurly WC2026 Pool" />
              </div>
              <div>
                <Label>Admin Password <span className="text-[#807D73] font-normal">(only you need this)</span></Label>
                <Input className="mt-1" type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} placeholder="Set a password…" />
              </div>
            </CardContent>
          </Card>
        )}

        {mode && (
          <Button className="w-full h-12 text-base" onClick={handleCreate} disabled={loading}>
            {loading ? 'Connecting…' : mode === 'server' ? 'Connect to Server' : 'Create Pool'}
            {!loading && <ChevronRight className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  )
}
