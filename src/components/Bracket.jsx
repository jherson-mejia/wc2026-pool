import { useState, useMemo } from 'react'
import { Trophy } from 'lucide-react'
import { buildBracket } from '@/lib/bracket'
import { useApp } from '@/context/AppContext'
import { getFlag } from '@/data/worldcup'
import { cn } from '@/lib/utils'

// ── Layout constants ──────────────────────────────────────────
const CARD_H    = 72   // px — fixed card height (all rounds)
const SLOT_H    = 84   // px — slot height in R32 column (CARD_H + 12px gap)
const BRACKET_H = 16 * SLOT_H   // 1344px — total card-container height
const HEADER_H  = 32   // px — round label area
const GUTTER_W  = 24   // px — connector column width

// ── SVG connector between rounds ──────────────────────────────
function Gutter({ fromCount, toCount }) {
  const totalH    = HEADER_H + BRACKET_H
  const fromSlot  = BRACKET_H / fromCount
  const toSlot    = BRACKET_H / toCount
  const mx        = GUTTER_W / 2

  return (
    <svg width={GUTTER_W} height={totalH} className="shrink-0 self-start">
      {Array.from({ length: toCount }).map((_, i) => {
        // justify-around centers: item i of n → H/n * (i + 0.5)
        const ya = HEADER_H + fromSlot * (2 * i + 0.5)
        const yb = HEADER_H + fromSlot * (2 * i + 1.5)
        const yc = HEADER_H + toSlot   * (i + 0.5)
        return (
          <g key={i} stroke="#2d2b26" strokeWidth={1.5} fill="none" strokeLinecap="round">
            <line x1={0}  y1={ya} x2={mx} y2={ya} />
            <line x1={0}  y1={yb} x2={mx} y2={yb} />
            <line x1={mx} y1={ya} x2={mx} y2={yb} />
            <line x1={mx} y1={yc} x2={GUTTER_W} y2={yc} />
          </g>
        )
      })}
    </svg>
  )
}

// ── Single match card ─────────────────────────────────────────
function BracketMatch({ match, narrow = false }) {
  const { home, away, homeDisplay, awayDisplay, result, known, winner } = match
  const homeWon = !!(winner && winner === home && home)
  const awayWon = !!(winner && winner === away && away)

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border shrink-0 overflow-hidden',
        narrow ? 'w-[140px]' : 'w-[164px]',
        known
          ? result
            ? 'border-[#2a2925] bg-[#09090700]'
            : 'border-th-border bg-th-surface'
          : 'border-[#1f1e1b] bg-th-bg/30 opacity-60'
      )}
      style={{ height: CARD_H }}
    >
      {/* Home team row */}
      <div className={cn(
        'flex items-center gap-1.5 px-2 flex-1 min-h-0',
        result && !homeWon && 'opacity-30'
      )}>
        <span className="text-[14px] leading-none shrink-0 w-5 text-center">
          {home ? getFlag(home) : '·'}
        </span>
        <span className={cn(
          'text-[10px] leading-tight flex-1 truncate',
          homeWon ? 'font-bold text-th-text' : 'text-th-muted',
          !home && 'italic text-[#3a3835]'
        )}>
          {homeDisplay}
        </span>
        {result && (
          <span className={cn(
            'text-[11px] font-extrabold tabular-nums shrink-0',
            homeWon ? 'text-[#FFD706]' : 'text-[#3a3835]'
          )}>{result.home}</span>
        )}
      </div>

      <div className="mx-2 h-px bg-[#1f1e1b]" />

      {/* Away team row */}
      <div className={cn(
        'flex items-center gap-1.5 px-2 flex-1 min-h-0',
        result && !awayWon && 'opacity-30'
      )}>
        <span className="text-[14px] leading-none shrink-0 w-5 text-center">
          {away ? getFlag(away) : '·'}
        </span>
        <span className={cn(
          'text-[10px] leading-tight flex-1 truncate',
          awayWon ? 'font-bold text-th-text' : 'text-th-muted',
          !away && 'italic text-[#3a3835]'
        )}>
          {awayDisplay}
        </span>
        {result && (
          <span className={cn(
            'text-[11px] font-extrabold tabular-nums shrink-0',
            awayWon ? 'text-[#FFD706]' : 'text-[#3a3835]'
          )}>{result.away}</span>
        )}
      </div>

      {/* Penalty footnote (within card height) */}
      {result?.homePens != null && (
        <div className="text-[8px] text-[#4a4845] text-center pb-0.5 leading-none">
          pens {result.homePens}–{result.awayPens}
        </div>
      )}
    </div>
  )
}

// ── Round column ───────────────────────────────────────────────
const ROUND_LABELS = {
  r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarterfinals',
  sf: 'Semifinals',   final: 'Final',      tp: '3rd Place',
}

function BracketRound({ roundId, matches, narrow = false }) {
  return (
    <div className="flex flex-col shrink-0" style={{ width: narrow ? 140 : 164 }}>
      <div
        className="flex items-end justify-center pb-2"
        style={{ height: HEADER_H }}
      >
        <span className="text-[9px] font-bold text-[#3a3835] uppercase tracking-[0.15em] whitespace-nowrap">
          {ROUND_LABELS[roundId] ?? roundId}
        </span>
      </div>
      <div className="flex flex-col justify-around" style={{ height: BRACKET_H }}>
        {matches.map(m => (
          <BracketMatch key={m.matchId} match={m} narrow={narrow} />
        ))}
      </div>
    </div>
  )
}

// ── Champion display ───────────────────────────────────────────
function Champion({ match }) {
  if (!match?.winner) return null
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 pl-5 shrink-0"
      style={{ height: HEADER_H + BRACKET_H }}
    >
      <div className="relative">
        <div className="text-6xl">{getFlag(match.winner)}</div>
        <Trophy className="absolute -bottom-1 -right-2 h-5 w-5 text-[#FFD706]" />
      </div>
      <div className="text-center">
        <div className="text-sm font-extrabold text-[#FFD706] leading-tight">
          {match.winner}
        </div>
        <div className="text-[9px] text-th-muted uppercase tracking-widest mt-0.5">
          Champion
        </div>
      </div>
    </div>
  )
}

// ── Mobile: round-tabs view ───────────────────────────────────
const ROUND_ORDER = ['r32', 'r16', 'qf', 'sf', 'final', 'tp']
const ROUND_SHORT = {
  r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', final: 'Final', tp: '3rd',
}

function MobileMatchCard({ match }) {
  const { home, away, homeDisplay, awayDisplay, result, known, winner } = match
  const homeWon = !!(winner && winner === home && home)
  const awayWon = !!(winner && winner === away && away)

  return (
    <div className={cn(
      'rounded-xl border px-3 py-2.5 transition-all',
      known
        ? result
          ? 'border-[#2a2925] bg-th-bg/90'
          : 'border-th-border bg-th-surface'
        : 'border-[#1f1e1b] bg-th-bg/20 opacity-60'
    )}>
      {/* Home */}
      <div className={cn('flex items-center gap-2 py-1', result && !homeWon && 'opacity-35')}>
        <span className="text-base leading-none shrink-0">
          {home ? getFlag(home) : '·'}
        </span>
        <span className={cn(
          'text-xs flex-1 truncate',
          homeWon ? 'font-bold text-th-text' : 'text-th-muted',
          !home && 'italic text-[#3a3835]'
        )}>{homeDisplay}</span>
        {result && (
          <span className={cn('text-sm font-extrabold tabular-nums', homeWon ? 'text-[#FFD706]' : 'text-[#3a3835]')}>
            {result.home}
          </span>
        )}
      </div>

      <div className="h-px bg-[#1f1e1b] mx-1" />

      {/* Away */}
      <div className={cn('flex items-center gap-2 py-1', result && !awayWon && 'opacity-35')}>
        <span className="text-base leading-none shrink-0">
          {away ? getFlag(away) : '·'}
        </span>
        <span className={cn(
          'text-xs flex-1 truncate',
          awayWon ? 'font-bold text-th-text' : 'text-th-muted',
          !away && 'italic text-[#3a3835]'
        )}>{awayDisplay}</span>
        {result && (
          <span className={cn('text-sm font-extrabold tabular-nums', awayWon ? 'text-[#FFD706]' : 'text-[#3a3835]')}>
            {result.away}
          </span>
        )}
      </div>

      {result?.homePens != null && (
        <div className="text-[9px] text-th-muted text-center mt-1">
          Pens: {result.homePens}–{result.awayPens}
        </div>
      )}

      {match.winner && (
        <div className="mt-1.5 text-[10px] font-semibold text-[#FFD706] text-center">
          {getFlag(match.winner)} {match.winner} advances
        </div>
      )}
    </div>
  )
}

function MobileBracket({ bracket }) {
  const [active, setActive] = useState('r32')
  const matches = bracket[active] ?? []

  return (
    <div>
      {/* Round selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none mb-4">
        {ROUND_ORDER.map(r => (
          <button
            key={r}
            onClick={() => setActive(r)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border',
              r === active
                ? 'bg-[#FFD706] text-[#0D0D0B] border-[#FFD706]'
                : 'bg-transparent text-th-muted border-th-border hover:text-th-text hover:border-th-text/30'
            )}
          >
            {ROUND_SHORT[r]}
          </button>
        ))}
      </div>

      {/* Match cards */}
      <div className="space-y-2">
        {matches.map(m => <MobileMatchCard key={m.matchId} match={m} />)}
      </div>

      {/* Champion */}
      {active === 'final' && bracket.final[0]?.winner && (
        <div className="mt-6 flex flex-col items-center gap-3 py-6 rounded-2xl border border-[#FFD706]/20 bg-[#FFD706]/5">
          <Trophy className="h-8 w-8 text-[#FFD706]" />
          <div className="text-5xl">{getFlag(bracket.final[0].winner)}</div>
          <div className="text-center">
            <div className="text-xl font-extrabold text-[#FFD706]">{bracket.final[0].winner}</div>
            <div className="text-xs text-th-muted uppercase tracking-widest mt-1">World Cup Champion</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main bracket component ─────────────────────────────────────
export default function Bracket() {
  const { koMatches, results } = useApp()

  const bracket = useMemo(
    () => buildBracket(koMatches, results),
    [koMatches, results]
  )

  const finalM  = bracket.final[0]
  const tpM     = bracket.tp[0]

  const desktopRounds = [
    { id: 'r32',   matches: bracket.r32,   narrow: true },
    { id: 'r16',   matches: bracket.r16   },
    { id: 'qf',    matches: bracket.qf    },
    { id: 'sf',    matches: bracket.sf    },
    { id: 'final', matches: bracket.final },
  ]

  return (
    <div>
      {/* ── Desktop: full scrollable bracket ── */}
      <div className="hidden md:block">
        <>
            <div className="overflow-x-auto pb-4 -mx-4 px-4">
              <div className="flex items-start" style={{ gap: 0, width: 'max-content' }}>
                {desktopRounds.map((round, ri) => (
                  <div key={round.id} className="flex items-start">
                    <BracketRound
                      roundId={round.id}
                      matches={round.matches}
                      narrow={round.narrow}
                    />
                    {ri < desktopRounds.length - 1 && (
                      <Gutter
                        fromCount={round.matches.length}
                        toCount={desktopRounds[ri + 1].matches.length}
                      />
                    )}
                  </div>
                ))}
                {/* Champion column */}
                {finalM?.winner && <Champion match={finalM} />}
              </div>
            </div>

            {/* 3rd place below bracket */}
            {tpM?.known && (
              <div className="mt-6 pt-5 border-t border-th-border">
                <p className="text-[9px] font-bold text-[#3a3835] uppercase tracking-[0.15em] mb-3">
                  Third Place Match
                </p>
                <BracketMatch match={tpM} />
              </div>
            )}

            <p className="text-[10px] text-[#3a3835] mt-3">← Scroll to see full bracket</p>
          </>
      </div>

      {/* ── Mobile: round-tabs ── */}
      <div className="md:hidden">
        <MobileBracket bracket={bracket} />
      </div>
    </div>
  )
}
