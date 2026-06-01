import { useState, useMemo } from 'react'
import { ChevronDown, Download, Lock, Target, CheckCircle2, Zap } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/components/ui/toast'
import { GROUPS, GROUP_MATCHES, KO_ROUNDS, getFlag } from '@/data/worldcup'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import MatchCard from '@/components/MatchCard'
import KnockoutMatchCard from '@/components/KnockoutMatchCard'
import HowItWorks from '@/components/HowItWorks'
import { cn, fmtKickoff } from '@/lib/utils'
import Countdown from '@/components/Countdown'
import { calcTotals } from '@/lib/scoring'

// ── Group accordion ───────────────────────────────────────────
function GroupAccordion({ group, myPicks, results, kickoffs, onSave, isAdmin }) {
  const [open, setOpen] = useState(['A', 'B', 'C'].includes(group.id))
  const matches = GROUP_MATCHES
    .filter(m => m.group === group.id)
    .sort((a, b) => {
      const ka = kickoffs[a.id] ? new Date(kickoffs[a.id]).getTime() : Infinity
      const kb = kickoffs[b.id] ? new Date(kickoffs[b.id]).getTime() : Infinity
      return ka - kb
    })
  const done    = matches.filter(m => results[m.id]).length
  const nextMatch = matches.find(m => kickoffs[m.id] && !results[m.id])
  const nextKi    = nextMatch ? fmtKickoff(kickoffs[nextMatch.id]) : null
  const myPts   = matches.reduce((s, m) => {
    if (!results[m.id] || !myPicks[m.id]) return s
    const p = myPicks[m.id], r = results[m.id]
    const ph = Number(p.home), pa = Number(p.away)
    const rh = Number(r.home), ra = Number(r.away)
    if (ph === rh && pa === ra) return s + 3
    const po = ph > pa ? 'H' : pa > ph ? 'A' : 'D'
    const ro = rh > ra ? 'H' : ra > rh ? 'A' : 'D'
    return s + (po === ro ? 1 : 0)
  }, 0)

  return (
    <div className="rounded-xl border border-[#32312D] overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-[#32312D]/50 hover:bg-[#32312D]/80 transition-colors"
      >
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-[#FFFDF2]">Group {group.id}</span>
            <span className="text-base leading-none">
              {group.teams.map(t => getFlag(t)).join('')}
            </span>
          </div>
          <div className="text-xs text-[#807D73] mt-0.5">{group.teams.join(' · ')}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {myPts > 0 && (
            <span className="text-xs font-bold text-[#FFD706]">+{myPts} pts</span>
          )}
          {nextKi && !open && (
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded-full border',
              nextKi.isLive    ? 'text-[#FF8200] border-[#FF8200]/30 bg-[#FF8200]/10' :
              nextKi.isToday   ? 'text-[#FF8200] border-[#FF8200]/20 bg-[#FF8200]/5' :
              nextKi.isTomorrow ? 'text-[#FFD706] border-[#FFD706]/20 bg-[#FFD706]/5' :
                                  'text-[#807D73] border-[#32312D]',
            )}>
              {nextKi.isLive ? '🔴 Live' : nextKi.day}
            </span>
          )}
          <span className="text-xs text-[#807D73]">{done}/6</span>
          <ChevronDown className={cn('h-4 w-4 text-[#807D73] transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="p-3 space-y-2 bg-[#0D0D0B]/40">
          {/* Progress bar */}
          <div className="h-1 rounded-full bg-[#32312D] overflow-hidden mb-3">
            <div className="h-full bg-[#FFD706] rounded-full transition-all" style={{ width: `${(done / 6) * 100}%` }} />
          </div>
          {matches.map((m, idx) => {
            const ki    = fmtKickoff(kickoffs[m.id])
            const prevKi = idx > 0 ? fmtKickoff(kickoffs[matches[idx - 1].id]) : null
            const showDateSep = ki && (!prevKi || ki.date.toDateString() !== prevKi.date.toDateString())
            return (
              <div key={m.id}>
                {showDateSep && (
                  <div className="flex items-center gap-2 pt-1 pb-0.5">
                    <div className="flex-1 h-px bg-[#32312D]" />
                    <span className={cn(
                      'text-[10px] font-bold uppercase tracking-widest shrink-0',
                      ki.isToday ? 'text-[#FF8200]' : ki.isTomorrow ? 'text-[#FFD706]' : 'text-[#807D73]',
                    )}>
                      {ki.day}
                    </span>
                    <div className="flex-1 h-px bg-[#32312D]" />
                  </div>
                )}
                <MatchCard
                  match={m}
                  pick={myPicks[m.id]}
                  result={results[m.id]}
                  kickoff={kickoffs[m.id]}
                  onSave={onSave}
                  disabled={isAdmin}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Knockout round ─────────────────────────────────────────────
function KORound({ round, myPicks, results, koMatches, kickoffs, onSave, isAdmin }) {
  const allTBD = Array.from({ length: round.count }, (_, i) => `${round.id}_${i + 1}`)
    .every(mid => !koMatches[mid]?.home)

  if (allTBD) {
    return (
      <div className="rounded-xl border border-[#32312D] bg-[#0D0D0B]/40 p-8 text-center">
        <Lock className="h-8 w-8 text-[#32312D] mx-auto mb-3" />
        <p className="font-semibold text-[#807D73]">{round.name} picks are locked</p>
        <p className="text-sm text-[#807D73] mt-1.5">
          Picks unlock match-by-match as soon as the admin confirms which teams are playing.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-[#807D73] bg-[#32312D]/30 rounded-lg px-3 py-2">
        <span>📊 {round.name}: <span className="text-[#FFFDF2] font-semibold">{round.scoring.result}pts</span> winner · <span className="text-[#FFD706] font-semibold">{round.scoring.exact}pts</span> exact score</span>
      </div>
      {Array.from({ length: round.count }, (_, i) => {
        const mid = `${round.id}_${i + 1}`
        return (
          <KnockoutMatchCard
            key={mid}
            matchId={mid}
            roundId={round.id}
            scoring={round.scoring}
            km={koMatches[mid]}
            pick={myPicks[mid]}
            result={results[mid]}
            kickoff={kickoffs[mid]}
            onSave={onSave}
            disabled={isAdmin}
          />
        )
      })}
    </div>
  )
}

// ── My Progress section ───────────────────────────────────────
function PicksProgress({ myPicks, results, participants, allPicks, user }) {
  const { pts, correct, exact } = useMemo(() => calcTotals(myPicks, results), [myPicks, results])

  const playedIds      = Object.keys(results)
  const pickedOfPlayed = playedIds.filter(id => myPicks[id] != null).length
  const pct            = playedIds.length > 0 ? Math.round((pickedOfPlayed / playedIds.length) * 100) : 0

  const myRank = useMemo(() => {
    if (!participants.length) return null
    const ranked = participants
      .filter(p => p.email !== '__admin__')
      .map(p => {
        const picks = p.email === user?.email ? myPicks : (allPicks[p.email] || {})
        return { email: p.email, pts: calcTotals(picks, results).pts }
      })
      .sort((a, b) => b.pts - a.pts)
    const idx = ranked.findIndex(p => p.email === user?.email)
    return idx >= 0 ? idx + 1 : null
  }, [participants, allPicks, myPicks, results, user])

  const totalPlayed = playedIds.length

  return (
    <section className="rounded-xl border border-[#32312D] bg-[#32312D]/20 p-4 mb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold text-[#807D73] uppercase tracking-[0.15em]">My Progress</h2>
        {myRank && (
          <div className="flex items-center gap-1.5 text-xs text-[#807D73]">
            <span>Current rank</span>
            <span className="font-extrabold text-[#FFD706] text-sm">#{myRank}</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        <div className="rounded-lg bg-[#0D0D0B]/60 border border-[#32312D] p-2.5 text-center">
          <Target className="h-3 w-3 text-[#807D73] mx-auto mb-1" />
          <div className="text-xl font-extrabold text-[#FFD706] tabular-nums leading-none">{pts}</div>
          <div className="text-[9px] text-[#807D73] uppercase tracking-wider mt-1">Points</div>
        </div>
        <div className="rounded-lg bg-[#0D0D0B]/60 border border-[#32312D] p-2.5 text-center">
          <CheckCircle2 className="h-3 w-3 text-[#807D73] mx-auto mb-1" />
          <div className="text-xl font-extrabold text-[#FFFDF2] tabular-nums leading-none">{correct}</div>
          <div className="text-[9px] text-[#807D73] uppercase tracking-wider mt-1">Correct</div>
        </div>
        <div className="rounded-lg bg-[#0D0D0B]/60 border border-[#32312D] p-2.5 text-center">
          <Zap className="h-3 w-3 text-[#807D73] mx-auto mb-1" />
          <div className="text-xl font-extrabold text-[#FFFDF2] tabular-nums leading-none">{exact}</div>
          <div className="text-[9px] text-[#807D73] uppercase tracking-wider mt-1">Exact</div>
        </div>
      </div>

      {/* Picks completion bar */}
      {totalPlayed > 0 && (
        <div>
          <div className="flex justify-between text-[11px] text-[#807D73] mb-1.5">
            <span>Picks vs played matches</span>
            <span className="font-semibold text-[#FFFDF2]">{pickedOfPlayed}/{totalPlayed}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#32312D] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: pct === 100 ? '#FFD706' : pct >= 50 ? '#FF8200' : '#807D73',
              }}
            />
          </div>
          {pickedOfPlayed < totalPlayed && (
            <p className="text-[11px] text-[#FF8200] mt-1.5">
              {totalPlayed - pickedOfPlayed} played match{totalPlayed - pickedOfPlayed !== 1 ? 'es' : ''} without a pick
            </p>
          )}
        </div>
      )}
    </section>
  )
}

// ── Main Picks page ────────────────────────────────────────────
export default function Picks() {
  const { myPicks, results, koMatches, kickoffs, user, isAdmin, savePick, participants, allPicks } = useApp()
  const { toast } = useToast()

  async function handleSave(matchId, home, away, winner) {
    try {
      await savePick(matchId, home, away, winner)
      toast({ title: 'Pick saved ✓' })
    } catch (e) {
      toast({ title: 'Failed to save pick', variant: 'destructive' })
    }
  }

  function exportPicks() {
    const data = { email: user?.email, name: user?.name, picks: myPicks, exported: new Date().toISOString() }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = `wc2026-picks-${user?.name?.replace(/\s+/g, '-') || 'me'}.json`
    a.click()
  }

  if (isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="rounded-xl border border-[#32312D] bg-[#32312D]/20 p-6 text-center text-[#807D73]">
          <Lock className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="font-semibold">Admins can't enter picks</p>
          <p className="text-sm mt-1">Log in with a participant account to pick scores.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-[#FFFDF2] tracking-tight">My Picks</h1>
          <p className="text-[#807D73] text-sm mt-0.5">{user?.name}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={exportPicks}>
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      {/* My progress */}
      <PicksProgress
        myPicks={myPicks}
        results={results}
        participants={participants}
        allPicks={allPicks}
        user={user}
      />

      <Countdown />

      <HowItWorks />

      <Tabs defaultValue="group">
        <TabsList className="w-full mb-4 overflow-x-auto h-auto gap-1 justify-start">
          <TabsTrigger value="group">Group Stage</TabsTrigger>
          <TabsTrigger value="r32">R32</TabsTrigger>
          <TabsTrigger value="r16">R16</TabsTrigger>
          <TabsTrigger value="qf">QF</TabsTrigger>
          <TabsTrigger value="sf">SF</TabsTrigger>
          <TabsTrigger value="tp">3rd Place</TabsTrigger>
          <TabsTrigger value="final">Final</TabsTrigger>
        </TabsList>

        <TabsContent value="group">
          <div className="text-xs text-[#807D73] bg-[#32312D]/30 rounded-lg px-3 py-2 mb-4">
            📊 Group Stage: <span className="text-[#FFFDF2] font-semibold">1pt</span> correct result · <span className="text-[#FFD706] font-semibold">3pts</span> exact score
          </div>
          <div className="space-y-2">
            {GROUPS.map(g => (
              <GroupAccordion
                key={g.id}
                group={g}
                myPicks={myPicks}
                results={results}
                kickoffs={kickoffs}
                onSave={handleSave}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </TabsContent>

        {KO_ROUNDS.map(round => (
          <TabsContent key={round.id} value={round.id}>
            <KORound
              round={round}
              myPicks={myPicks}
              results={results}
              koMatches={koMatches}
              kickoffs={kickoffs}
              onSave={handleSave}
              isAdmin={isAdmin}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
