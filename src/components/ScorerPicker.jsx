import { cn } from '@/lib/utils'
import { SCORER_POINTS } from '@/lib/scoring'

export default function ScorerPicker({ lineup, bench, pick, locked, matchGoals, teamId, onSave }) {
  const players = [...(lineup ?? []), ...(bench ?? [])]
  if (!players.length) return null

  if (locked) {
    if (!pick) return <span className="text-[10px] text-th-muted italic">No scorer pick</span>
    const correct = matchGoals
      ? matchGoals.goals?.some(g => String(g.scorer_id) === String(pick.playerId) && String(g.team_id) === String(teamId))
      : null
    return (
      <span className={cn(
        'text-[11px] font-semibold truncate max-w-full',
        correct === true  ? 'text-[#22c55e]'
        : correct === false ? 'text-th-muted'
        : 'text-th-text',
      )}>
        {correct === true && '✓ '}
        {pick.playerName}
        {correct === true && ` +${SCORER_POINTS}`}
      </span>
    )
  }

  return (
    <select
      className="w-full text-[11px] bg-th-surface-alt border border-th-border rounded px-1.5 py-1 text-th-text focus:outline-none focus:border-[#FFD706]/50 truncate"
      value={pick?.playerId ?? ''}
      onChange={e => {
        const player = players.find(p => String(p.id) === e.target.value)
        if (player) onSave(player.id, player.name)
      }}
    >
      <option value="">⚽ Pick scorer…</option>
      {lineup?.length > 0 && (
        <optgroup label="Starting XI">
          {lineup.map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.position ? ` · ${p.position}` : ''}</option>
          ))}
        </optgroup>
      )}
      {bench?.length > 0 && (
        <optgroup label="Bench">
          {bench.map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.position ? ` · ${p.position}` : ''}</option>
          ))}
        </optgroup>
      )}
    </select>
  )
}
