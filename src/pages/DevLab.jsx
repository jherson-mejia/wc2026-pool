import { useState, useEffect, useRef } from 'react'
import { useApp } from '@/context/AppContext'
import { GROUP_MATCHES, KO_ROUNDS } from '@/data/worldcup'
import { calcTotals } from '@/lib/scoring'
import { LS } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { RefreshCw, Zap, Trash2, Radio, FlaskConical, Lock } from 'lucide-react'

// All known match IDs for the selector
const ALL_MATCH_IDS = [
  ...GROUP_MATCHES.map(m => m.id),
  ...KO_ROUNDS.flatMap(r => Array.from({ length: r.count }, (_, i) => `${r.id}_${i + 1}`)),
]

function adminHeaders() {
  const pw = LS.get('adminPw')
  return pw ? { 'Content-Type': 'application/json', 'X-Admin-Password': pw } : { 'Content-Type': 'application/json' }
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(path, { headers: adminHeaders(), ...opts })
  return res.json()
}

// ── SSE event log ─────────────────────────────────────────────
function useSSELog() {
  const [log, setLog] = useState([])
  const push = entry => setLog(l => [entry, ...l].slice(0, 50))

  useEffect(() => {
    const es = new EventSource('/api/events')
    const events = ['results', 'picks', 'ko_matches', 'kickoffs', 'participants']
    events.forEach(ev => {
      es.addEventListener(ev, e => {
        push({
          ts:   new Date().toLocaleTimeString(),
          ev,
          data: JSON.parse(e.data),
        })
      })
    })
    es.onerror = () => push({ ts: new Date().toLocaleTimeString(), ev: 'error', data: 'reconnecting…' })
    return () => es.close()
  }, [])

  return { log, clear: () => setLog([]) }
}

// ── Scheduler status panel ────────────────────────────────────
function SchedulerPanel() {
  const [status, setStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)

  async function refresh() {
    const s = await apiFetch('/api/scheduler-status')
    setStatus(s)
  }

  const [schedSyncing, setSchedSyncing] = useState(false)
  const [schedLog, setSchedLog]         = useState(null)

  async function forceSync() {
    setSyncing(true)
    await apiFetch('/api/scheduler-force', { method: 'POST' })
    await refresh()
    setSyncing(false)
  }

  async function forceSyncSchedule() {
    setSchedSyncing(true)
    setSchedLog(null)
    try {
      const r = await apiFetch('/api/scheduler-sync-schedule', { method: 'POST' })
      setSchedLog(`✓ ${r.kickoffs} kickoffs · ${r.fdIds} FD IDs · ${r.odds} odds`)
    } catch (e) {
      setSchedLog(`✗ ${e.message}`)
    } finally {
      setSchedSyncing(false)
      refresh()
    }
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5_000)
    return () => clearInterval(id)
  }, [])

  if (!status || status.error) return (
    <div className="text-xs text-[#807D73] p-3">Scheduler not running — set FD_API_KEY in .env</div>
  )

  const pct = Math.round((status.requestsToday / status.autoBudget) * 100)

  return (
    <div className="space-y-3">
      {/* Budget bar */}
      <div>
        <div className="flex justify-between text-xs text-[#807D73] mb-1">
          <span>Budget</span>
          <span className="font-mono text-[#FFFDF2]">{status.requestsToday} / {status.autoBudget}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[#32312D] overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(pct,100)}%`, background: pct>=90?'#FF4444':pct>=60?'#FF8200':'#FFD706' }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-[#1a1a18] rounded p-2 border border-[#32312D]">
          <div className="text-[#807D73]">Next poll</div>
          <div className="font-semibold text-[#FFFDF2] font-mono">
            {status.nextSync ? new Date(status.nextSync).toLocaleTimeString() : '—'}
          </div>
          <div className="text-[#807D73]">{status.pollsPlanned} planned</div>
        </div>
        <div className="bg-[#1a1a18] rounded p-2 border border-[#32312D]">
          <div className="text-[#807D73]">Last sync</div>
          <div className="font-semibold text-[#FFFDF2] font-mono">
            {status.lastSync ? new Date(status.lastSync).toLocaleTimeString() : 'Never'}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={forceSync}
          disabled={syncing || schedSyncing}
          className="flex items-center justify-center gap-2 py-2 rounded-lg bg-[#32312D] text-xs font-bold text-[#FFFDF2] hover:bg-[#FFD706] hover:text-[#0D0D0B] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
          {syncing ? 'Syncing…' : 'Sync Results'}
        </button>
        <button
          onClick={forceSyncSchedule}
          disabled={syncing || schedSyncing}
          className="flex items-center justify-center gap-2 py-2 rounded-lg bg-[#32312D] text-xs font-bold text-[#FFFDF2] hover:bg-[#FF8200] hover:text-[#0D0D0B] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', schedSyncing && 'animate-spin')} />
          {schedSyncing ? 'Syncing…' : 'Sync Schedule'}
        </button>
      </div>
      {schedLog && <div className="text-[10px] text-[#807D73] text-center">{schedLog}</div>}
    </div>
  )
}

// ── Result injection tool ─────────────────────────────────────
function ResultInjector({ onResult }) {
  const [matchId, setMatchId] = useState('GA_1')
  const [custom, setCustom]   = useState(false)
  const [home, setHome]       = useState('')
  const [away, setAway]       = useState('')
  const [winner, setWinner]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [log, setLog]         = useState('')

  const isKO = !matchId.startsWith('G')

  async function setResult() {
    if (home === '' || away === '') return
    setSaving(true)
    setLog('Setting result…')
    try {
      const body = { home: Number(home), away: Number(away), winner: winner || null, home_pens: null, away_pens: null }
      await apiFetch(`/api/results/${encodeURIComponent(matchId)}`, {
        method: 'PUT', body: JSON.stringify(body),
      })
      setLog(`✓ Result set: ${matchId} → ${home}–${away}${winner ? ` (${winner})` : ''}`)
      onResult?.()
    } catch (e) {
      setLog(`✗ ${e.message}`)
    } finally { setSaving(false) }
  }

  async function clearResult() {
    setSaving(true)
    setLog('Clearing…')
    try {
      await apiFetch(`/api/results/${encodeURIComponent(matchId)}`, { method: 'DELETE' })
      setLog(`✓ Cleared: ${matchId}`)
      onResult?.()
    } catch (e) {
      setLog(`✗ ${e.message}`)
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      {/* Match selector */}
      <div>
        <label className="text-[10px] font-bold text-[#807D73] uppercase tracking-wider block mb-1">Match ID</label>
        <div className="flex gap-2">
          {custom ? (
            <input
              value={matchId}
              onChange={e => setMatchId(e.target.value)}
              placeholder="e.g. GA_1 or r16_1"
              className="flex-1 rounded border border-[#32312D] bg-[#1a1a18] text-[#FFFDF2] text-xs px-2 py-1.5 font-mono focus:outline-none focus:border-[#FFD706]"
            />
          ) : (
            <select
              value={matchId}
              onChange={e => setMatchId(e.target.value)}
              className="flex-1 rounded border border-[#32312D] bg-[#1a1a18] text-[#FFFDF2] text-xs px-2 py-1.5 font-mono focus:outline-none focus:border-[#FFD706]"
            >
              <optgroup label="Group Stage">
                {GROUP_MATCHES.map(m => (
                  <option key={m.id} value={m.id}>{m.id} — {m.home} vs {m.away}</option>
                ))}
              </optgroup>
              {KO_ROUNDS.map(r => (
                <optgroup key={r.id} label={r.name}>
                  {Array.from({ length: r.count }, (_, i) => `${r.id}_${i+1}`).map(id => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          <button
            onClick={() => setCustom(v => !v)}
            className="text-[10px] text-[#807D73] hover:text-[#FFFDF2] px-2 border border-[#32312D] rounded transition-colors whitespace-nowrap"
          >
            {custom ? 'use list' : 'free text'}
          </button>
        </div>
      </div>

      {/* Score inputs */}
      <div>
        <label className="text-[10px] font-bold text-[#807D73] uppercase tracking-wider block mb-1">Score</label>
        <div className="flex items-center gap-2">
          <input type="number" min="0" max="99" value={home} onChange={e => setHome(e.target.value)}
            placeholder="0" className="w-14 text-center rounded border border-[#32312D] bg-[#1a1a18] text-[#FFFDF2] text-sm font-bold py-1.5 focus:outline-none focus:border-[#FFD706]" />
          <span className="text-[#807D73] font-bold">–</span>
          <input type="number" min="0" max="99" value={away} onChange={e => setAway(e.target.value)}
            placeholder="0" className="w-14 text-center rounded border border-[#32312D] bg-[#1a1a18] text-[#FFFDF2] text-sm font-bold py-1.5 focus:outline-none focus:border-[#FFD706]" />
        </div>
      </div>

      {/* Winner (KO only) */}
      {isKO && (
        <div>
          <label className="text-[10px] font-bold text-[#807D73] uppercase tracking-wider block mb-1">Winner</label>
          <select value={winner} onChange={e => setWinner(e.target.value)}
            className="w-full rounded border border-[#32312D] bg-[#1a1a18] text-[#FFFDF2] text-xs px-2 py-1.5 focus:outline-none focus:border-[#FFD706]">
            <option value="">— none (regular time) —</option>
            <option value="home">home</option>
            <option value="away">away</option>
          </select>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={setResult} disabled={saving || home === '' || away === ''}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#FFD706] text-[#0D0D0B] text-xs font-bold hover:bg-[#FFD706]/80 transition-colors disabled:opacity-40">
          <Zap className="h-3.5 w-3.5" />
          {saving ? 'Setting…' : 'Set Result → broadcast'}
        </button>
        <button onClick={clearResult} disabled={saving}
          className="px-3 py-2 rounded-lg border border-[#32312D] text-[#807D73] text-xs hover:text-red-400 hover:border-red-400/30 transition-colors disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {log && (
        <div className="text-[11px] font-mono text-[#807D73] bg-[#1a1a18] rounded p-2 border border-[#32312D]">
          {log}
        </div>
      )}
    </div>
  )
}

// ── Score impact table ────────────────────────────────────────
function ScoreImpact({ matchId, home, away, winner }) {
  const { participants, allPicks, myPicks, results, user } = useApp()

  if (!matchId || home === '' || away === '') return (
    <div className="text-xs text-[#807D73] text-center py-4">Set a score above to preview impact</div>
  )

  const testResult = { home: Number(home), away: Number(away), winner: winner || null }
  const testResults = { ...results, [matchId]: testResult }

  const rows = participants
    .filter(p => p.email !== '__admin__')
    .map(p => {
      const picks = p.email === user?.email ? myPicks : (allPicks[p.email] || {})
      const before = calcTotals(picks, results)
      const after  = calcTotals(picks, testResults)
      return { name: p.name, before: before.pts, after: after.pts, delta: after.pts - before.pts }
    })
    .sort((a, b) => b.after - a.after)

  if (!rows.length) return <div className="text-xs text-[#807D73] text-center py-4">No participants yet</div>

  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-[#32312D]/40 last:border-0">
          <span className="text-[#807D73] w-4 text-right shrink-0">{i+1}</span>
          <span className="flex-1 text-[#FFFDF2] truncate">{r.name}</span>
          <span className="text-[#807D73] tabular-nums">{r.before}</span>
          <span className="text-[#807D73]">→</span>
          <span className="font-bold text-[#FFFDF2] tabular-nums">{r.after}</span>
          {r.delta !== 0 && (
            <span className={cn('tabular-nums font-bold', r.delta > 0 ? 'text-[#22c55e]' : 'text-red-400')}>
              {r.delta > 0 ? `+${r.delta}` : r.delta}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── SSE event log panel ───────────────────────────────────────
function EventLog({ log, onClear }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-[#807D73]">
          <Radio className="h-3 w-3 text-[#22c55e] animate-pulse" />
          Live SSE events
        </div>
        <button onClick={onClear} className="text-[10px] text-[#807D73] hover:text-[#FFFDF2] transition-colors">clear</button>
      </div>
      <div className="h-48 overflow-y-auto space-y-1 font-mono text-[10px] bg-[#080806] rounded-lg border border-[#32312D] p-2">
        {log.length === 0 && <div className="text-[#3a3835]">Waiting for events…</div>}
        {log.map((entry, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-[#3a3835] shrink-0">{entry.ts}</span>
            <span className={cn(
              'font-bold shrink-0',
              entry.ev === 'results'  ? 'text-[#FFD706]' :
              entry.ev === 'picks'    ? 'text-[#FF8200]' :
              entry.ev === 'error'    ? 'text-red-400'   : 'text-[#807D73]'
            )}>{entry.ev}</span>
            <span className="text-[#4a4845] truncate">
              {typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data).slice(0, 120)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── football-data.org API Explorer ───────────────────────────
function ApiExplorer() {
  const [matchId, setMatchId] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState(null)
  const [status, setStatus] = useState(null)

  async function fetchMatch() {
    if (!matchId.trim()) return
    setLoading(true)
    setResponse(null)
    setStatus(null)
    try {
      const res = await fetch(`/api/football-data/matches/${matchId.trim()}`)
      setStatus(res.status)
      const json = await res.json().catch(() => null)
      setResponse(json)
    } catch (e) {
      setStatus('error')
      setResponse({ error: e.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold text-[#807D73] uppercase tracking-wider block mb-1">
          football-data.org Match ID
        </label>
        <div className="flex gap-2">
          <input
            value={matchId}
            onChange={e => setMatchId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchMatch()}
            placeholder="e.g. 521614"
            className="flex-1 rounded border border-[#32312D] bg-[#1a1a18] text-[#FFFDF2] text-xs px-2 py-1.5 font-mono focus:outline-none focus:border-[#FFD706]"
          />
          <button
            onClick={fetchMatch}
            disabled={loading || !matchId.trim()}
            className="px-3 py-1.5 rounded bg-[#FFD706] text-[#0D0D0B] text-xs font-bold hover:bg-[#FFD706]/80 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {loading ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
        <p className="text-[9px] text-[#3a3835] mt-1">proxied via /api/football-data/matches/:id — uses FD_API_KEY</p>
      </div>

      {status !== null && (
        <div className={cn(
          'text-[10px] font-mono font-bold px-2 py-1 rounded border inline-block',
          status === 200 ? 'text-[#22c55e] border-[#22c55e]/30 bg-[#22c55e]/10'
            : 'text-red-400 border-red-400/30 bg-red-400/10'
        )}>
          HTTP {status}
        </div>
      )}

      {response !== null && (
        <div className="rounded bg-[#080806] border border-[#32312D] p-2 max-h-72 overflow-y-auto">
          <pre className="text-[10px] font-mono text-[#807D73] whitespace-pre-wrap break-all">
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Pick Lock Tester ──────────────────────────────────────────
function PickLockTester() {
  const { savePick, kickoffs, user } = useApp()
  const [matchId, setMatchId] = useState('GA_1')
  const [log, setLog] = useState([])

  const push = msg => setLog(l => [`${new Date().toLocaleTimeString()} ${msg}`, ...l].slice(0, 20))

  const currentKickoff = kickoffs[matchId]
  const isLocked = currentKickoff && Date.now() >= new Date(currentKickoff).getTime()

  async function setKickoff(offsetMs) {
    const ts = new Date(Date.now() + offsetMs).toISOString()
    const res = await fetch('/api/kickoffs', {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ [matchId]: ts }),
    })
    const json = await res.json()
    push(json.ok ? `kickoff set → ${ts}` : `✗ ${json.error}`)
  }

  async function clearKickoff() {
    // Set kickoff far in future to "unset" (no DELETE per-match endpoint exists)
    const res = await fetch('/api/kickoffs', {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ [matchId]: null }),
    })
    push((await res.json()).ok ? 'kickoff cleared' : '✗ error')
  }

  async function tryPickViaContext() {
    try {
      await savePick(matchId, 1, 0, null)
      push('✓ context savePick accepted (1–0)')
    } catch (e) {
      push(`✗ context blocked: ${e.message}`)
    }
  }

  async function tryPickDirectAPI() {
    const id = `${user?.email}_${matchId}`
    const res = await fetch(`/api/picks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user?.email, match_id: matchId, home: 1, away: 0, winner: null }),
    })
    const json = await res.json()
    push(res.ok ? `✓ server accepted (status ${res.status})` : `✗ server blocked ${res.status}: ${json.error}`)
  }

  return (
    <div className="space-y-3">
      {/* Match selector */}
      <div>
        <label className="text-[10px] font-bold text-[#807D73] uppercase tracking-wider block mb-1">Match</label>
        <select
          value={matchId}
          onChange={e => { setMatchId(e.target.value); setLog([]) }}
          className="w-full rounded border border-[#32312D] bg-[#1a1a18] text-[#FFFDF2] text-xs px-2 py-1.5 font-mono focus:outline-none focus:border-[#FFD706]"
        >
          <optgroup label="Group Stage">
            {GROUP_MATCHES.map(m => (
              <option key={m.id} value={m.id}>{m.id} — {m.home} vs {m.away}</option>
            ))}
          </optgroup>
          {KO_ROUNDS.map(r => (
            <optgroup key={r.id} label={r.name}>
              {Array.from({ length: r.count }, (_, i) => `${r.id}_${i+1}`).map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Current kickoff status */}
      <div className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-xs border',
        isLocked
          ? 'bg-red-900/20 border-red-500/30 text-red-400'
          : currentKickoff
            ? 'bg-[#22c55e]/10 border-[#22c55e]/30 text-[#22c55e]'
            : 'bg-[#32312D]/30 border-[#32312D] text-[#807D73]',
      )}>
        <Lock className="h-3 w-3 shrink-0" />
        {isLocked
          ? `LOCKED — kicked off ${new Date(currentKickoff).toLocaleTimeString()}`
          : currentKickoff
            ? `Open — kickoff ${new Date(currentKickoff).toLocaleTimeString()}`
            : 'No kickoff set (open)'}
      </div>

      {/* Kickoff controls */}
      <div>
        <label className="text-[10px] font-bold text-[#807D73] uppercase tracking-wider block mb-1">Set Kickoff</label>
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => setKickoff(-5 * 60_000)}
            className="py-1.5 rounded border border-red-500/30 text-red-400 text-[10px] font-bold hover:bg-red-500/10 transition-colors">
            –5 min (locked)
          </button>
          <button onClick={() => setKickoff(5 * 60_000)}
            className="py-1.5 rounded border border-[#22c55e]/30 text-[#22c55e] text-[10px] font-bold hover:bg-[#22c55e]/10 transition-colors">
            +5 min (open)
          </button>
          <button onClick={clearKickoff}
            className="py-1.5 rounded border border-[#32312D] text-[#807D73] text-[10px] hover:text-[#FFFDF2] transition-colors">
            clear
          </button>
        </div>
      </div>

      {/* Pick attempt buttons */}
      <div>
        <label className="text-[10px] font-bold text-[#807D73] uppercase tracking-wider block mb-1">Try Pick (1–0)</label>
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={tryPickViaContext}
            className="py-1.5 rounded border border-[#FFD706]/30 text-[#FFD706] text-[10px] font-bold hover:bg-[#FFD706]/10 transition-colors">
            via context
          </button>
          <button onClick={tryPickDirectAPI}
            className="py-1.5 rounded border border-[#FF8200]/30 text-[#FF8200] text-[10px] font-bold hover:bg-[#FF8200]/10 transition-colors">
            direct API
          </button>
        </div>
        <p className="text-[9px] text-[#3a3835] mt-1">context = client-side check · direct = server-side check</p>
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div className="rounded bg-[#080806] border border-[#32312D] p-2 space-y-0.5 max-h-32 overflow-y-auto">
          {log.map((l, i) => (
            <div key={i} className={cn('text-[10px] font-mono', l.includes('✓') ? 'text-[#22c55e]' : l.includes('✗') ? 'text-red-400' : 'text-[#807D73]')}>{l}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Scorer tester ─────────────────────────────────────────────
const TEST_HOME_ID = 901
const TEST_AWAY_ID = 902

function makeTestLineup() {
  const pos = (id, name, position, shirt) => ({ id, name, position, shirtNumber: shirt })
  return {
    home_team_id: TEST_HOME_ID,
    away_team_id: TEST_AWAY_ID,
    home_lineup: [
      pos(90001, 'Home GK',  'Goalkeeper',       1),
      pos(90002, 'Home RB',  'Right-Back',        2),
      pos(90003, 'Home CB1', 'Centre-Back',       4),
      pos(90004, 'Home CB2', 'Centre-Back',       5),
      pos(90005, 'Home LB',  'Left-Back',         3),
      pos(90006, 'Home DM',  'Defensive Midfield',6),
      pos(90007, 'Home CM',  'Central Midfield',  8),
      pos(90008, 'Home AM',  'Attacking Midfield',10),
      pos(90009, 'Home RW',  'Right Winger',      7),
      pos(90010, 'Home LW',  'Left Winger',       11),
      pos(90011, 'Home ST',  'Centre-Forward',    9),
    ],
    home_bench: [
      pos(90012, 'Home Sub GK',  'Goalkeeper',      13),
      pos(90013, 'Home Sub DEF', 'Centre-Back',     15),
      pos(90014, 'Home Sub MID', 'Central Midfield',14),
      pos(90015, 'Home Sub FW',  'Centre-Forward',  18),
    ],
    away_lineup: [
      pos(90021, 'Away GK',  'Goalkeeper',       1),
      pos(90022, 'Away RB',  'Right-Back',        2),
      pos(90023, 'Away CB1', 'Centre-Back',       4),
      pos(90024, 'Away CB2', 'Centre-Back',       5),
      pos(90025, 'Away LB',  'Left-Back',         3),
      pos(90026, 'Away DM',  'Defensive Midfield',6),
      pos(90027, 'Away CM',  'Central Midfield',  8),
      pos(90028, 'Away AM',  'Attacking Midfield',10),
      pos(90029, 'Away RW',  'Right Winger',      7),
      pos(90030, 'Away LW',  'Left Winger',       11),
      pos(90031, 'Away ST',  'Centre-Forward',    9),
    ],
    away_bench: [
      pos(90032, 'Away Sub GK',  'Goalkeeper',      13),
      pos(90033, 'Away Sub DEF', 'Centre-Back',     15),
      pos(90034, 'Away Sub MID', 'Central Midfield',14),
      pos(90035, 'Away Sub FW',  'Centre-Forward',  18),
    ],
  }
}

const DEV_TEST_MATCH_ID = 'DEV_TEST'

function ScorerTester() {
  const { lineups, matchGoals } = useApp()
  const [matchId, setMatchId]   = useState(DEV_TEST_MATCH_ID)
  const [team, setTeam]         = useState('home')
  const [playerId, setPlayerId] = useState('')
  const [saving, setSaving]     = useState(false)
  const [log, setLog]           = useState('')

  const lineup    = lineups[matchId]
  const goals     = matchGoals[matchId]
  const homeTeamId = lineup?.homeTeamId ?? TEST_HOME_ID
  const awayTeamId = lineup?.awayTeamId ?? TEST_AWAY_ID

  const allPlayers = team === 'home'
    ? [...(lineup?.homeLineup ?? []), ...(lineup?.homeBench ?? [])]
    : [...(lineup?.awayLineup ?? []), ...(lineup?.awayBench ?? [])]

  async function injectLineup() {
    setSaving(true)
    setLog('Injecting lineup…')
    try {
      await apiFetch(`/api/lineups/${encodeURIComponent(matchId)}`, {
        method: 'PUT', body: JSON.stringify(makeTestLineup()),
      })
      setLog(`✓ Lineup injected for ${matchId}`)
    } catch (e) { setLog(`✗ ${e.message}`) }
    finally { setSaving(false) }
  }

  async function clearLineup() {
    setSaving(true)
    try {
      await apiFetch(`/api/lineups/${encodeURIComponent(matchId)}`, { method: 'DELETE' })
      setLog(`✓ Lineup cleared for ${matchId}`)
    } catch (e) { setLog(`✗ ${e.message}`) }
    finally { setSaving(false) }
  }

  async function addGoal() {
    if (!playerId) return
    setSaving(true)
    const player  = allPlayers.find(p => String(p.id) === playerId)
    const teamId  = team === 'home' ? homeTeamId : awayTeamId
    const newGoal = { minute: 45, scorer_id: Number(playerId), scorer_name: player?.name ?? '?', team_id: teamId }
    const existing = goals?.goals ?? []
    try {
      await apiFetch(`/api/match-goals/${encodeURIComponent(matchId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          goals: [...existing, newGoal],
        }),
      })
      setLog(`✓ Goal added: ${player?.name} (${team})`)
      setPlayerId('')
    } catch (e) { setLog(`✗ ${e.message}`) }
    finally { setSaving(false) }
  }

  async function clearGoals() {
    setSaving(true)
    try {
      await apiFetch(`/api/match-goals/${encodeURIComponent(matchId)}`, { method: 'DELETE' })
      setLog(`✓ Goals cleared for ${matchId}`)
    } catch (e) { setLog(`✗ ${e.message}`) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      {/* Match selector */}
      <div>
        <label className="text-[10px] font-bold text-[#807D73] uppercase tracking-wider block mb-1">Match</label>
        <select value={matchId} onChange={e => { setMatchId(e.target.value); setLog(''); setPlayerId('') }}
          className="w-full rounded border border-[#32312D] bg-[#1a1a18] text-[#FFFDF2] text-xs px-2 py-1.5 font-mono focus:outline-none focus:border-[#FFD706]">
          <optgroup label="Hidden (dev only — not visible to users)">
            <option value={DEV_TEST_MATCH_ID}>DEV_TEST — hidden sandbox</option>
          </optgroup>
          <optgroup label="⚠ Real matches (changes visible to all users)">
            {GROUP_MATCHES.map(m => <option key={m.id} value={m.id}>{m.id} — {m.home} vs {m.away}</option>)}
          </optgroup>
          {KO_ROUNDS.map(r => (
            <optgroup key={r.id} label={`⚠ ${r.name}`}>
              {Array.from({ length: r.count }, (_, i) => `${r.id}_${i+1}`).map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Lineup status */}
      <div className="flex items-center justify-between">
        <span className={cn('text-[10px] font-mono', lineup ? 'text-[#22c55e]' : 'text-[#807D73]')}>
          {lineup ? `✓ Lineup: ${(lineup.homeLineup?.length ?? 0) + (lineup.homeBench?.length ?? 0)} home · ${(lineup.awayLineup?.length ?? 0) + (lineup.awayBench?.length ?? 0)} away` : 'No lineup'}
        </span>
        <div className="flex gap-1.5">
          <button onClick={injectLineup} disabled={saving}
            className="px-2 py-1 rounded bg-[#FFD706] text-[#0D0D0B] text-[10px] font-bold hover:bg-[#FFD706]/80 disabled:opacity-40 transition-colors">
            Inject Lineup
          </button>
          {lineup && (
            <button onClick={clearLineup} disabled={saving}
              className="px-2 py-1 rounded border border-[#32312D] text-[#807D73] text-[10px] hover:text-red-400 hover:border-red-400/30 transition-colors">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Goals section — only when lineup is available */}
      {lineup && (
        <div className="rounded border border-[#32312D] p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#807D73] uppercase tracking-wider">Add Goal</span>
            {goals?.goals?.length > 0 && (
              <button onClick={clearGoals} disabled={saving}
                className="text-[10px] text-red-400 hover:text-red-300 transition-colors">
                clear all goals
              </button>
            )}
          </div>

          {/* Current goals */}
          {goals?.goals?.length > 0 && (
            <div className="space-y-0.5">
              {goals.goals.map((g, i) => (
                <div key={i} className="text-[10px] font-mono text-[#22c55e]">
                  ⚽ {g.scorer_name} (team_id: {g.team_id} = {g.team_id === homeTeamId ? 'home' : 'away'})
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-1.5">
            <select value={team} onChange={e => { setTeam(e.target.value); setPlayerId('') }}
              className="rounded border border-[#32312D] bg-[#1a1a18] text-[#FFFDF2] text-xs px-1.5 py-1 focus:outline-none focus:border-[#FFD706]">
              <option value="home">Home</option>
              <option value="away">Away</option>
            </select>
            <select value={playerId} onChange={e => setPlayerId(e.target.value)}
              className="flex-1 rounded border border-[#32312D] bg-[#1a1a18] text-[#FFFDF2] text-xs px-1.5 py-1 focus:outline-none focus:border-[#FFD706]">
              <option value="">Select player…</option>
              {allPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={addGoal} disabled={saving || !playerId}
              className="px-2 py-1 rounded bg-[#22c55e] text-[#0D0D0B] text-[10px] font-bold hover:bg-[#22c55e]/80 disabled:opacity-40 transition-colors whitespace-nowrap">
              Add ⚽
            </button>
          </div>
        </div>
      )}

      {log && (
        <div className={cn('text-[10px] font-mono px-2 py-1.5 rounded border', log.startsWith('✓') ? 'text-[#22c55e] border-[#22c55e]/20 bg-[#22c55e]/5' : log.startsWith('✗') ? 'text-red-400 border-red-400/20 bg-red-400/5' : 'text-[#807D73] border-[#32312D]')}>
          {log}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function DevLab() {
  const { log, clear } = useSSELog()
  const [matchId, setMatchId] = useState('GA_1')
  const [home, setHome]       = useState('')
  const [away, setAway]       = useState('')
  const [winner, setWinner]   = useState('')
  const [tick, setTick]       = useState(0)

  // Pass state up from injector so ScoreImpact can preview
  function handleInjectorChange(mid, h, a, w) {
    setMatchId(mid); setHome(h); setAway(a); setWinner(w)
  }

  return (
    <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <FlaskConical className="h-6 w-6 text-[#FFD706]" />
        <div>
          <h1 className="text-2xl font-extrabold text-[#FFFDF2] tracking-tight">Dev Lab</h1>
          <p className="text-xs text-[#807D73]">dev environment only — not visible in production</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: tools */}
        <div className="space-y-4">
          {/* Result injector */}
          <div className="rounded-xl border border-[#32312D] bg-[#13130f] p-4">
            <h2 className="text-xs font-bold text-[#807D73] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-[#FFD706]" /> Inject Result
            </h2>
            <ResultInjector onResult={() => setTick(t => t+1)} />
          </div>

          {/* Scheduler */}
          <div className="rounded-xl border border-[#32312D] bg-[#13130f] p-4">
            <h2 className="text-xs font-bold text-[#807D73] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Scheduler
            </h2>
            <SchedulerPanel />
          </div>

          {/* Pick lock tester */}
          <div className="rounded-xl border border-[#32312D] bg-[#13130f] p-4">
            <h2 className="text-xs font-bold text-[#807D73] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> Pick Lock Test
            </h2>
            <PickLockTester />
          </div>

          {/* Scorer tester */}
          <div className="rounded-xl border border-[#32312D] bg-[#13130f] p-4">
            <h2 className="text-xs font-bold text-[#807D73] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-[#22c55e]" /> Scorer Test
            </h2>
            <ScorerTester />
          </div>
        </div>

        {/* Right: live feed + score impact + API explorer */}
        <div className="space-y-4">
          {/* SSE log */}
          <div className="rounded-xl border border-[#32312D] bg-[#13130f] p-4">
            <EventLog log={log} onClear={clear} />
          </div>

          {/* Score impact preview */}
          <div className="rounded-xl border border-[#32312D] bg-[#13130f] p-4">
            <h2 className="text-xs font-bold text-[#807D73] uppercase tracking-wider mb-3">
              Score Impact Preview
            </h2>
            <ScoreImpact key={tick} matchId={matchId} home={home} away={away} winner={winner} />
          </div>

          {/* API explorer */}
          <div className="rounded-xl border border-[#32312D] bg-[#13130f] p-4">
            <h2 className="text-xs font-bold text-[#807D73] uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5" /> API Explorer
            </h2>
            <ApiExplorer />
          </div>
        </div>
      </div>
    </div>
  )
}
