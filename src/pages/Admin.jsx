import { useState, useRef, useEffect } from 'react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/components/ui/toast'
import { GROUPS, GROUP_MATCHES, KO_ROUNDS } from '@/data/worldcup'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { calcTotals } from '@/lib/scoring'
import { fetchFinishedMatches, mapToPoolResults, fetchSchedule, mapKickoffs, mapFdMatchIds, mapMatchMeta } from '@/lib/autoSync'
import { apiBulkImportPicks, apiSaveFdMatchIds, apiSaveMatchMeta } from '@/lib/storage'
import { Download, Upload, Trash2, CheckCircle, Users, RefreshCw, Pencil, ChevronDown, X, Check, Clock, Zap } from 'lucide-react'

// ── Enter Results ─────────────────────────────────────────────
function ResultsTab() {
  const { results, koMatches, saveResult, clearResult } = useApp()
  const { toast } = useToast()
  const [group, setGroup] = useState('A')

  const grp = GROUPS.find(g => g.id === group)
  const koRound = KO_ROUNDS.find(r => r.id === group)

  // Local form state per matchId
  const [formVals, setFormVals] = useState({})
  const get = (mid, side) => formVals[mid]?.[side] ?? (results[mid]?.[side] ?? '')
  const set = (mid, side, val) => setFormVals(p => ({ ...p, [mid]: { ...(p[mid] || {}), [side]: val } }))
  const getW = (mid) => formVals[mid]?.winner ?? results[mid]?.winner ?? ''
  const setW = (mid, v) => setFormVals(p => ({ ...p, [mid]: { ...(p[mid] || {}), winner: v } }))
  const getPens = (mid, side) => formVals[mid]?.[side + '_pens'] ?? (results[mid]?.[side === 'home' ? 'homePens' : 'awayPens'] ?? '')
  const setPens = (mid, side, val) => setFormVals(p => ({ ...p, [mid]: { ...(p[mid] || {}), [side + '_pens']: val } }))

  async function submit(matchId, isKO = false) {
    const h = parseInt(get(matchId, 'home'))
    const a = parseInt(get(matchId, 'away'))
    if (isNaN(h) || isNaN(a)) { toast({ title: 'Enter both scores', variant: 'destructive' }); return }
    if (isKO && !getW(matchId)) { toast({ title: 'Select the winner', variant: 'destructive' }); return }
    try {
      const hp = getPens(matchId, 'home')
      const ap = getPens(matchId, 'away')
      const homePens = hp !== '' ? parseInt(hp) : null
      const awayPens = ap !== '' ? parseInt(ap) : null
      await saveResult(matchId, h, a, isKO ? getW(matchId) : null, isKO ? homePens : null, isKO ? awayPens : null)
      toast({ title: 'Result saved ✓' })
    } catch { toast({ title: 'Failed to save', variant: 'destructive' }) }
  }

  async function doClear(matchId) {
    if (!confirm('Clear this result?')) return
    await clearResult(matchId)
    setFormVals(p => { const n = { ...p }; delete n[matchId]; return n })
    toast({ title: 'Cleared' })
  }

  const groupTabs  = GROUPS.map(g => g.id)
  const koTabs     = KO_ROUNDS.map(r => r.id)

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#807D73]">Enter the final score for each completed match. Scores update everyone's points instantly.</p>

      {/* Group / Round selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {groupTabs.map(id => (
          <button key={id} onClick={() => setGroup(id)}
            className={`shrink-0 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${group === id ? 'bg-[#FFD706] text-[#0D0D0B]' : 'bg-[#32312D] text-[#807D73] hover:text-[#FFFDF2]'}`}>
            Grp {id}
          </button>
        ))}
        <div className="shrink-0 w-px bg-[#32312D] mx-1" />
        {KO_ROUNDS.map(r => (
          <button key={r.id} onClick={() => setGroup(r.id)}
            className={`shrink-0 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${group === r.id ? 'bg-[#FF8200] text-[#0D0D0B]' : 'bg-[#32312D] text-[#807D73] hover:text-[#FFFDF2]'}`}>
            {r.name}
          </button>
        ))}
      </div>

      {/* Group matches */}
      {grp && GROUP_MATCHES.filter(m => m.group === grp.id).map((m, idx) => {
        const r = results[m.id]
        return (
          <Card key={m.id}>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">MD{m.matchday}: {m.home} vs {m.away}</span>
                {r && <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" />Saved</Badge>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#807D73] w-24 truncate text-right">{m.home}</span>
                <Input type="number" min="0" max="99" className="w-14 text-center px-1"
                  value={get(m.id, 'home')} onChange={e => set(m.id, 'home', e.target.value)} placeholder="0" />
                <span className="text-[#807D73] font-bold">–</span>
                <Input type="number" min="0" max="99" className="w-14 text-center px-1"
                  value={get(m.id, 'away')} onChange={e => set(m.id, 'away', e.target.value)} placeholder="0" />
                <span className="text-sm text-[#807D73] w-24 truncate">{m.away}</span>
              </div>
              <div className="flex justify-end gap-2">
                {r && <Button variant="ghost" size="sm" onClick={() => doClear(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                <Button size="sm" onClick={() => submit(m.id)}>{r ? 'Update' : 'Save Result'}</Button>
              </div>
            </CardContent>
          </Card>
        )
      })}

      {/* KO matches */}
      {koRound && Array.from({ length: koRound.count }, (_, i) => {
        const mid = `${koRound.id}_${i + 1}`
        const km  = koMatches[mid]
        const r   = results[mid]
        if (!km?.home) return (
          <Card key={mid} className="opacity-50">
            <CardContent className="py-3 text-sm text-[#807D73]">Match {i + 1} — set teams first in Knockout Setup</CardContent>
          </Card>
        )
        return (
          <Card key={mid}>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Match {i + 1}: {km.home} vs {km.away}</span>
                {r && <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" />Saved</Badge>}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-[#807D73] w-24 truncate text-right">{km.home}</span>
                <Input type="number" min="0" max="99" className="w-14 text-center px-1"
                  value={get(mid, 'home')} onChange={e => set(mid, 'home', e.target.value)} placeholder="0" />
                <span className="text-[#807D73] font-bold">–</span>
                <Input type="number" min="0" max="99" className="w-14 text-center px-1"
                  value={get(mid, 'away')} onChange={e => set(mid, 'away', e.target.value)} placeholder="0" />
                <span className="text-sm text-[#807D73] w-24 truncate">{km.away}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-xs">Winner (after ET/pens):</Label>
                <Select value={getW(mid)} onValueChange={v => setW(mid, v)}>
                  <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="— required —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="home">{km.home}</SelectItem>
                    <SelectItem value="away">{km.away}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="text-xs text-[#807D73]">Penalty shootout (optional):</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min="0" max="99" className="w-14 text-center px-1"
                    value={getPens(mid, 'home')} onChange={e => setPens(mid, 'home', e.target.value)} placeholder="–" />
                  <span className="text-[#807D73] font-bold">–</span>
                  <Input type="number" min="0" max="99" className="w-14 text-center px-1"
                    value={getPens(mid, 'away')} onChange={e => setPens(mid, 'away', e.target.value)} placeholder="–" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {r && <Button variant="ghost" size="sm" onClick={() => doClear(mid)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                <Button size="sm" onClick={() => submit(mid, true)}>{r ? 'Update' : 'Save Result'}</Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ── Knockout Setup ─────────────────────────────────────────────
function KnockoutTab() {
  const { koMatches, setKoMatch, clearKoMatch } = useApp()
  const { toast } = useToast()
  const [vals, setVals] = useState({})
  const get = (mid, side) => vals[mid]?.[side] ?? koMatches[mid]?.[side] ?? ''
  const set = (mid, side, v) => setVals(p => ({ ...p, [mid]: { ...(p[mid] || {}), [side]: v } }))

  async function submit(mid) {
    const h = get(mid, 'home').trim(), a = get(mid, 'away').trim()
    if (!h || !a) { toast({ title: 'Enter both team names', variant: 'destructive' }); return }
    await setKoMatch(mid, h, a)
    toast({ title: `${h} vs ${a} — picks unlocked! ✓` })
  }

  async function doClear(mid) {
    if (!confirm('Clear teams? Existing picks are kept but hidden until re-set.')) return
    await clearKoMatch(mid)
    setVals(p => { const n = { ...p }; delete n[mid]; return n })
    toast({ title: 'Cleared' })
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#807D73]">Set both teams for a match to immediately unlock it for participants to pick.</p>
      {KO_ROUNDS.map(round => (
        <div key={round.id}>
          <h3 className="text-sm font-bold text-[#FFD706] mb-3">{round.name}</h3>
          <div className="space-y-2">
            {Array.from({ length: round.count }, (_, i) => {
              const mid = `${round.id}_${i + 1}`
              const km  = koMatches[mid]
              return (
                <Card key={mid}>
                  <CardContent className="pt-3 pb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#807D73]">Match {i + 1}</span>
                      {km?.home ? <Badge variant="success">✓ {km.home} vs {km.away}</Badge> : <Badge variant="locked">TBD</Badge>}
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <Input value={get(mid, 'home')} onChange={e => set(mid, 'home', e.target.value)} placeholder="Home Team" className="h-8 text-sm" />
                      <span className="text-[#807D73] text-xs font-bold">vs</span>
                      <Input value={get(mid, 'away')} onChange={e => set(mid, 'away', e.target.value)} placeholder="Away Team" className="h-8 text-sm" />
                    </div>
                    <div className="flex justify-end gap-2">
                      {km?.home && <Button variant="ghost" size="sm" onClick={() => doClear(mid)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      <Button size="sm" onClick={() => submit(mid)}>Set Teams → Unlock Picks</Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Pick editor row (one match inside a participant's expanded picks) ──
function PickEditRow({ matchId, label, pick, result, isKO, km, onSave }) {
  const homeRef = useRef(null)
  const awayRef = useRef(null)
  const [winner, setWinner] = useState(pick?.winner || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const timerRef = useRef(null)

  const hasPick = pick?.home != null

  async function commit() {
    const h = parseInt(homeRef.current?.value)
    const a = parseInt(awayRef.current?.value)
    if (isNaN(h) || isNaN(a)) return
    setSaving(true)
    try {
      await onSave(h, a, isKO ? (winner || null) : null)
      setSaved(true); setTimeout(() => setSaved(false), 1500)
    } finally { setSaving(false) }
  }

  function queue() {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(commit, 700)
  }

  const pts = result ? calcTotals({ [matchId]: pick }, { [matchId]: result }).pts : null

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 py-1.5 border-b border-[#32312D]/50 last:border-0">
      <div className="text-xs text-[#807D73] truncate">{label}</div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          ref={homeRef}
          type="number" min="0" max="99"
          defaultValue={hasPick ? pick.home : ''}
          placeholder="–"
          onChange={queue}
          className="w-9 text-center rounded border border-[#32312D] bg-[#1a1a18] text-[#FFFDF2] text-xs py-0.5 focus:outline-none focus:border-[#FFD706]"
        />
        <span className="text-[#807D73] text-xs">–</span>
        <input
          ref={awayRef}
          type="number" min="0" max="99"
          defaultValue={hasPick ? pick.away : ''}
          placeholder="–"
          onChange={queue}
          className="w-9 text-center rounded border border-[#32312D] bg-[#1a1a18] text-[#FFFDF2] text-xs py-0.5 focus:outline-none focus:border-[#FFD706]"
        />
        {isKO && km && (
          <Select value={winner} onValueChange={v => { setWinner(v); clearTimeout(timerRef.current); timerRef.current = setTimeout(commit, 200) }}>
            <SelectTrigger className="h-6 w-24 text-[10px] px-1.5"><SelectValue placeholder="winner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="home">{km.home}</SelectItem>
              <SelectItem value="away">{km.away}</SelectItem>
            </SelectContent>
          </Select>
        )}
        {pts != null && <span className="text-[10px] text-[#FFD706] font-bold w-8 text-right">+{pts}</span>}
        {saved && <Check className="h-3 w-3 text-[#52c41a] shrink-0" />}
        {saving && <span className="text-[10px] text-[#807D73]">…</span>}
      </div>
    </div>
  )
}

// ── Single participant card ────────────────────────────────────
function ParticipantCard({ p, allPicks, myPicks, results, koMatches, user, onDelete, onRename, onSavePick }) {
  const [editing, setEditing]   = useState(false)
  const [newName, setNewName]   = useState(p.name)
  const [expanded, setExpanded] = useState(false)
  const { toast } = useToast()

  const picks     = p.email === user?.email ? myPicks : (allPicks[p.email] || {})
  const { pts, correct, exact } = calcTotals(picks, results)
  const pickCount = Object.keys(picks).length

  const groupPickedMatches = GROUP_MATCHES.filter(m => picks[m.id] || results[m.id])
  const koPickedMatches    = Object.entries(koMatches)
    .filter(([mid]) => picks[mid] || results[mid] || koMatches[mid]?.home)

  async function handleRename() {
    const name = newName.trim()
    if (!name) return
    try {
      await onRename(p.email, { name })
      toast({ title: 'Name updated ✓' })
    } catch { toast({ title: 'Failed to update', variant: 'destructive' }) }
    setEditing(false)
  }

  async function handleDelete() {
    if (!confirm(`Remove ${p.name} and all their picks? This cannot be undone.`)) return
    try {
      await onDelete(p.email)
      toast({ title: `${p.name} removed` })
    } catch { toast({ title: 'Failed to delete', variant: 'destructive' }) }
  }

  return (
    <div className="rounded-lg border border-[#32312D] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#32312D]/30">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setEditing(false); setNewName(p.name) } }}
                className="h-7 text-sm py-0"
                autoFocus
              />
              <button onClick={handleRename} className="p-1 rounded hover:bg-[#52c41a]/20 text-[#52c41a]"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={() => { setEditing(false); setNewName(p.name) }} className="p-1 rounded hover:bg-red-500/20 text-red-400"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-sm text-[#FFFDF2] truncate">{p.name}</span>
              <button onClick={() => setEditing(true)} className="shrink-0 p-0.5 rounded hover:bg-[#32312D] text-[#807D73] hover:text-[#FFFDF2]">
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="text-xs text-[#807D73] mt-0.5">{p.email} · {pickCount} picks · {correct} right · {exact} exact</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold text-[#FFD706] text-base">{pts}</span>
          <button
            onClick={handleDelete}
            className="p-1 rounded hover:bg-red-500/10 text-[#807D73] hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1 rounded hover:bg-[#32312D] text-[#807D73] transition-colors"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expanded picks editor */}
      {expanded && (
        <div className="px-4 py-3 border-t border-[#32312D] space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-[#807D73] mb-2">Edit Picks — changes save automatically</p>

          {groupPickedMatches.length === 0 && koPickedMatches.length === 0 ? (
            <p className="text-xs text-[#807D73] py-2">No picks or results yet.</p>
          ) : (
            <>
              {groupPickedMatches.map(m => (
                <PickEditRow
                  key={m.id}
                  matchId={m.id}
                  label={`${m.home} vs ${m.away}`}
                  pick={picks[m.id]}
                  result={results[m.id]}
                  isKO={false}
                  onSave={(h, a, w) => onSavePick(p.email, m.id, h, a, w)}
                />
              ))}
              {koPickedMatches.map(([mid, km]) => (
                <PickEditRow
                  key={mid}
                  matchId={mid}
                  label={km?.home ? `${km.home} vs ${km.away}` : mid}
                  pick={picks[mid]}
                  result={results[mid]}
                  isKO
                  km={km}
                  onSave={(h, a, w) => onSavePick(p.email, mid, h, a, w)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Participants ──────────────────────────────────────────────
function ParticipantsTab() {
  const { participants, allPicks, myPicks, results, koMatches, user,
          updateParticipant, deleteParticipant, adminSavePick } = useApp()

  const parts = participants.filter(p => p.email !== '__admin__')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-[#807D73]">
        <Users className="h-4 w-4" />
        <span>{parts.length} participant{parts.length !== 1 ? 's' : ''}</span>
      </div>

      {parts.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-[#807D73]">No participants yet. Share the app!</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {parts.map(p => (
            <ParticipantCard
              key={p.email}
              p={p}
              allPicks={allPicks}
              myPicks={myPicks}
              results={results}
              koMatches={koMatches}
              user={user}
              onDelete={deleteParticipant}
              onRename={updateParticipant}
              onSavePick={adminSavePick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Backup & Import ───────────────────────────────────────────
function BackupTab() {
  const { poolName, mode, participants, results, koMatches, allPicks } = useApp()
  const { toast } = useToast()
  const [importing, setImporting] = useState(false)
  const [preview, setPreview]     = useState(null) // { picks: flat[], participants: int }
  const [importLog, setImportLog] = useState([])
  const fileRef = useRef(null)

  function download() {
    const data = { poolName, mode, exportedAt: new Date().toISOString(), participants, results, koMatches, picks: allPicks }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = `wc2026-pool-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const json = JSON.parse(ev.target.result)
        // Accept backup format: { picks: { email: { matchId: { home, away, winner } } } }
        const picksObj = json.picks ?? {}
        const flat = []
        for (const [email, matchMap] of Object.entries(picksObj)) {
          for (const [match_id, pick] of Object.entries(matchMap)) {
            if (pick.home == null || pick.away == null) continue
            flat.push({ email, match_id, home: Number(pick.home), away: Number(pick.away), winner: pick.winner ?? null })
          }
        }
        setPreview({ picks: flat, participantCount: Object.keys(picksObj).length })
        setImportLog([])
      } catch {
        toast({ title: 'Invalid JSON file', variant: 'destructive' })
      }
    }
    reader.readAsText(file)
  }

  async function doImport() {
    if (!preview?.picks?.length) return
    setImporting(true)
    setImportLog(['Importing…'])
    try {
      const { count } = await apiBulkImportPicks(preview.picks)
      setImportLog([`✓ Imported ${count} picks across ${preview.participantCount} participant(s)`])
      toast({ title: `Imported ${count} picks ✓` })
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setImportLog([`✗ ${e.message}`])
      toast({ title: e.message, variant: 'destructive' })
    } finally {
      setImporting(false) }
  }

  return (
    <div className="space-y-4">
      {/* Download */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Download className="h-4 w-4" />Backup Pool Data</CardTitle></CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-sm text-[#807D73]">Download a full JSON snapshot: participants, all picks, and results.</p>
          <Button onClick={download}><Download className="h-4 w-4" />Download Backup</Button>
        </CardContent>
      </Card>

      {/* Import picks */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Upload className="h-4 w-4" />Import Picks</CardTitle></CardHeader>
        <CardContent className="pt-0 space-y-3">
          <p className="text-sm text-[#807D73]">Upload a backup JSON file to bulk-import picks for all participants. Existing picks are overwritten.</p>
          <input ref={fileRef} type="file" accept=".json" onChange={handleFile}
            className="text-xs text-[#807D73] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#32312D] file:text-[#FFFDF2] hover:file:bg-[#FFD706] hover:file:text-[#0D0D0B] file:cursor-pointer file:transition-colors" />
          {preview && (
            <div className="rounded-lg border border-[#32312D] bg-[#32312D]/20 p-3 text-sm space-y-2">
              <p className="text-[#FFFDF2] font-semibold">
                {preview.picks.length} picks · {preview.participantCount} participant(s)
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={doImport} disabled={importing}>
                  {importing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {importing ? 'Importing…' : 'Confirm Import'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {importLog.length > 0 && (
            <pre className="text-xs text-[#807D73] font-mono bg-[#1a1a18] rounded p-2">{importLog.join('\n')}</pre>
          )}
        </CardContent>
      </Card>

      {/* Scoring reference */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Scoring Reference</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <pre className="text-xs text-[#807D73] font-mono leading-relaxed whitespace-pre-wrap">{
`Group Stage:    1pt correct result  ·  3pts exact score
Round of 32:    2pts winner  ·  5pts exact
Round of 16:    3pts winner  ·  7pts exact
Quarterfinals:  5pts winner  ·  10pts exact
Semifinals:     8pts winner  ·  15pts exact
Third Place:    5pts winner  ·  10pts exact
Final:          12pts winner ·  22pts exact

Knockout "exact" = correct 90+ET score.
Winner pick used as tiebreaker if tied after 90min.`
          }</pre>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Scheduler Status Card ─────────────────────────────────────
function SchedulerStatus() {
  const [status, setStatus] = useState(null)
  const [forceLoading, setForceLoading] = useState(false)
  const { toast } = useToast()

  async function fetchStatus() {
    try {
      const { LS } = await import('@/lib/storage')
      const pw = LS.get('adminPw')
      const res = await fetch('/api/scheduler-status', {
        headers: pw ? { 'X-Admin-Password': pw } : {},
      })
      if (res.ok) setStatus(await res.json())
    } catch {}
  }

  async function forceSync() {
    setForceLoading(true)
    try {
      const { LS } = await import('@/lib/storage')
      const pw = LS.get('adminPw')
      const res = await fetch('/api/scheduler-force', {
        method: 'POST',
        headers: pw ? { 'X-Admin-Password': pw } : {},
      })
      if (res.ok) {
        toast({ title: 'Manual sync triggered ✓' })
        setTimeout(fetchStatus, 1500)
      } else {
        toast({ title: 'Sync failed', variant: 'destructive' })
      }
    } catch (e) {
      toast({ title: e.message, variant: 'destructive' })
    } finally { setForceLoading(false) }
  }

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 30_000)
    return () => clearInterval(id)
  }, [])

  if (!status) return null

  const usedPct  = Math.round((status.requestsToday / status.autoBudget) * 100)
  const nextFmt  = status.nextSync
    ? new Date(status.nextSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null
  const lastFmt  = status.lastSync
    ? new Date(status.lastSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-[#FFD706]" /> Auto-Scheduler</span>
          <Button size="sm" variant="secondary" onClick={forceSync} disabled={forceLoading}
            className="text-xs h-7 px-2">
            <RefreshCw className={`h-3 w-3 mr-1 ${forceLoading ? 'animate-spin' : ''}`} />
            Force sync
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Budget bar */}
        <div>
          <div className="flex justify-between text-xs text-[#807D73] mb-1">
            <span>Daily budget used</span>
            <span className="font-semibold text-[#FFFDF2]">{status.requestsToday} / {status.autoBudget} auto</span>
          </div>
          <div className="h-2 rounded-full bg-[#32312D] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(usedPct, 100)}%`,
                background: usedPct >= 90 ? '#FF4444' : usedPct >= 60 ? '#FF8200' : '#FFD706',
              }}
            />
          </div>
          <p className="text-[10px] text-[#807D73] mt-1">{status.remaining} auto-requests remaining · {status.reserved} reserved for manual</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#0D0D0B]/60 rounded-lg border border-[#32312D] p-2">
            <div className="text-[#807D73] mb-0.5 flex items-center gap-1"><Clock className="h-3 w-3" /> Next poll</div>
            <div className="font-semibold text-[#FFFDF2]">{nextFmt ?? '—'}</div>
            {status.pollsPlanned > 0 && <div className="text-[10px] text-[#807D73]">{status.pollsPlanned} scheduled today</div>}
          </div>
          <div className="bg-[#0D0D0B]/60 rounded-lg border border-[#32312D] p-2">
            <div className="text-[#807D73] mb-0.5">Last sync</div>
            <div className="font-semibold text-[#FFFDF2]">{lastFmt ?? 'Never'}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Auto-Sync ─────────────────────────────────────────────────
function SyncTab() {
  const { results, koMatches, saveResult, saveKickoffs, kickoffs } = useApp()
  const { toast } = useToast()
  const [loading, setLoading]           = useState(false)
  const [schedLoading, setSchedLoading] = useState(false)
  const [log, setLog]                   = useState([])

  async function doSync() {
    setLoading(true)
    setLog(['Fetching finished matches…'])
    try {
      const apiMatches = await fetchFinishedMatches()
      setLog(l => [...l, `API returned ${apiMatches.length} finished match(es)`])

      const mapped    = mapToPoolResults(apiMatches, koMatches)
      const toSave    = mapped.filter(r => !results[r.matchId])
      const skipped   = mapped.length - toSave.length

      if (skipped > 0) setLog(l => [...l, `${skipped} already in pool — skipped`])
      if (toSave.length === 0) { setLog(l => [...l, 'Nothing new to sync.']); return }

      for (const r of toSave) {
        await saveResult(r.matchId, r.home, r.away, r.winner)
        setLog(l => [...l, `✓ ${r.matchId}  ${r.home}–${r.away}${r.winner ? `  (${r.winner})` : ''}`])
      }
      toast({ title: `Synced ${toSave.length} result${toSave.length > 1 ? 's' : ''} ✓` })
    } catch (e) {
      toast({ title: e.message, variant: 'destructive' })
      setLog(l => [...l, `✗ ${e.message}`])
    } finally { setLoading(false) }
  }

  async function doSyncSchedule() {
    setSchedLoading(true)
    setLog(['Fetching match schedule…'])
    try {
      const apiMatches  = await fetchSchedule()
      setLog(l => [...l, `API returned ${apiMatches.length} total match(es)`])
      const newKickoffs = mapKickoffs(apiMatches, koMatches)
      const newFdIds    = mapFdMatchIds(apiMatches, koMatches)
      const newMeta     = mapMatchMeta(apiMatches, koMatches)
      const count       = Object.keys(newKickoffs).length
      if (count === 0) { setLog(l => [...l, 'No kickoff times matched — check team names']); return }
      await Promise.all([saveKickoffs(newKickoffs), apiSaveFdMatchIds(newFdIds), apiSaveMatchMeta(newMeta)])
      const fdCount   = Object.keys(newFdIds).length
      const metaCount = Object.keys(newMeta).length
      setLog(l => [...l, `✓ Kickoffs: ${count}, FD IDs: ${fdCount}, Odds: ${metaCount}`])
      toast({ title: `Schedule synced — ${count} kickoff times saved ✓` })
    } catch (e) {
      toast({ title: e.message, variant: 'destructive' })
      setLog(l => [...l, `✗ ${e.message}`])
    } finally { setSchedLoading(false) }
  }

  const kickoffCount = Object.keys(kickoffs).length

  return (
    <div className="space-y-4">
      <SchedulerStatus />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Manual Sync from football-data.org
          </CardTitle>
          <CardDescription className="text-xs">
            API key lives in the server <code className="bg-[#32312D] px-1 rounded">.env</code> — nothing sent to the browser.
            Get a free key at{' '}
            <a href="https://www.football-data.org/client/register" target="_blank" rel="noreferrer"
              className="text-[#FFD706] hover:underline">football-data.org</a>
            {' '}and set <code className="bg-[#32312D] px-1 rounded">FD_API_KEY</code> in <code className="bg-[#32312D] px-1 rounded">.env</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button onClick={doSyncSchedule} disabled={schedLoading || loading} variant="secondary">
              <RefreshCw className={`h-4 w-4 mr-2 ${schedLoading ? 'animate-spin' : ''}`} />
              {schedLoading ? 'Syncing…' : 'Sync Schedule'}
            </Button>
            <Button onClick={doSync} disabled={loading || schedLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Syncing…' : 'Sync Results'}
            </Button>
          </div>

          {kickoffCount > 0 && (
            <p className="text-xs text-[#807D73]">✓ {kickoffCount} kickoff times stored — picks lock automatically at kickoff</p>
          )}

          {log.length > 0 && (
            <pre className="text-xs text-[#807D73] font-mono bg-[#1a1a18] rounded-md p-3 max-h-48 overflow-y-auto whitespace-pre-wrap">
              {log.join('\n')}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-1 text-xs text-[#807D73]">
          <p>• <strong className="text-[#FFFDF2]">Sync Schedule</strong> — run once before the tournament to lock picks at kickoff</p>
          <p>• <strong className="text-[#FFFDF2]">Sync Results</strong> — run after each matchday to auto-fill scores</p>
          <p>• Both are safe to run multiple times — existing data is never overwritten</p>
          <p>• KO matches sync once teams are set in <strong className="text-[#FFFDF2]">Knockout Setup</strong></p>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main Admin page ───────────────────────────────────────────
export default function Admin() {
  return (
    <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-extrabold text-[#FFFDF2] mb-5 tracking-tight">
        🔧 Admin Panel
      </h1>
      <Tabs defaultValue="results">
        <TabsList className="w-full mb-5 overflow-x-auto h-auto justify-start">
          <TabsTrigger value="results">Enter Results</TabsTrigger>
          <TabsTrigger value="knockout">Knockout Setup</TabsTrigger>
          <TabsTrigger value="sync">Auto-Sync</TabsTrigger>
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
        </TabsList>
        <TabsContent value="results"><ResultsTab /></TabsContent>
        <TabsContent value="knockout"><KnockoutTab /></TabsContent>
        <TabsContent value="sync"><SyncTab /></TabsContent>
        <TabsContent value="participants"><ParticipantsTab /></TabsContent>
        <TabsContent value="backup"><BackupTab /></TabsContent>
      </Tabs>
    </div>
  )
}
