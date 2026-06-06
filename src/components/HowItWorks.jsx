import { useState } from 'react'
import { ChevronDown, Trophy, Lock, Zap, Target, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

const SCORING = [
  { stage: 'Group Stage', result: 1, exact: 3, extra: null },
  { stage: 'Round of 32', result: 2, exact: 5, extra: null },
  { stage: 'Round of 16', result: 3, exact: 7, extra: null },
  { stage: 'Quarter-Finals', result: 5, exact: 10, extra: null },
  { stage: 'Semi-Finals', result: 8, exact: 15, extra: null },
  { stage: 'Third Place', result: 8, exact: 15, extra: null },
  { stage: 'Final', result: 12, exact: 22, extra: null },
]

const STEPS = [
  {
    icon: Target,
    title: 'Predict the score',
    body: 'Enter the final score for each match before kickoff. You can edit your pick any time while it\'s still open.',
  },
  {
    icon: Lock,
    title: 'Picks lock at kickoff',
    body: 'Once a match kicks off, your pick is locked in. No changes allowed. Make sure to pick early!',
  },
  {
    icon: Zap,
    title: 'Knockout teams revealed',
    body: 'For Round of 32 onward, teams are revealed match-by-match by the admin once the bracket is set. You can also pick the winner for tiebreakers.',
  },
  {
    icon: Trophy,
    title: 'Points add up',
    body: 'Points are awarded instantly when the admin enters the final score. Higher-stakes rounds are worth more.',
  },
  {
    icon: Zap,
    title: 'Pick a scorer',
    body: 'When the official lineup is released (~55 min before kickoff), you can pick one goal scorer per team. +3 pts if they score.',
  },
]

export default function HowItWorks() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-th-border overflow-hidden mb-5">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 bg-th-border/30 hover:bg-th-border/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-[#FFD706]" />
          <span className="font-bold text-sm text-th-text">How to Play</span>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-th-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-4 pt-4 pb-5 bg-th-bg/40 space-y-5">
          {/* Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <div key={i} className="flex gap-3">
                <div className="shrink-0 w-8 h-8 rounded-lg bg-[#FFD706]/10 border border-[#FFD706]/20 flex items-center justify-center mt-0.5">
                  <Icon className="h-4 w-4 text-[#FFD706]" />
                </div>
                <div>
                  <div className="text-sm font-bold text-th-text mb-0.5">{title}</div>
                  <div className="text-xs text-th-muted leading-relaxed">{body}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Scoring table */}
          <div>
            <div className="text-[11px] font-bold text-th-muted uppercase tracking-[0.15em] mb-2.5">Point Values</div>
            <div className="rounded-lg border border-th-border overflow-hidden">
              <div className="grid grid-cols-3 text-[10px] font-bold text-th-muted uppercase tracking-wider px-3 py-2 bg-th-border/40">
                <span>Round</span>
                <span className="text-center">Right result</span>
                <span className="text-center text-[#FFD706]">Exact score</span>
              </div>
              {SCORING.map(({ stage, result, exact }) => (
                <div
                  key={stage}
                  className="grid grid-cols-3 text-xs px-3 py-2.5 border-t border-th-border/50 items-center"
                >
                  <span className="text-th-subtle font-medium">{stage}</span>
                  <span className="text-center font-bold text-th-text">{result} pt{result !== 1 ? 's' : ''}</span>
                  <span className="text-center font-bold text-[#FFD706]">{exact} pts</span>
                </div>
              ))}
            </div>
          </div>

          {/* Scorer note */}
          <div className="flex gap-2 rounded-lg border border-[#FFD706]/20 bg-[#FFD706]/5 px-3 py-2.5">
            <span className="text-sm">⚽</span>
            <p className="text-xs text-th-subtle leading-relaxed">
              <span className="font-bold text-[#FFD706]">Scorer picks:</span> Pick one goal scorer per team per match. Opens when the official lineup drops (~55 min before kickoff), locks at kickoff. +3 pts if your player scores.
            </p>
          </div>

          {/* Tiebreaker note */}
          <div className="flex gap-2 rounded-lg border border-[#FF8200]/20 bg-[#FF8200]/5 px-3 py-2.5">
            <span className="text-sm">💡</span>
            <p className="text-xs text-th-subtle leading-relaxed">
              <span className="font-bold text-[#FF8200]">Ties:</span> In knockout matches that go to extra time or penalties, only the final result counts — not the score after 90 min. Picking the winner correctly still earns points.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
