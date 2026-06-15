import { Router } from 'express'
import { supabase } from '../db.js'
import { broadcastTable } from '../sse.js'
import { adminOnly } from '../middleware/auth.js'
import { fail } from '../utils.js'

const router = Router()

router.put('/match-goals/:matchId', adminOnly, async (req, res) => {
  const { home_team_id = 1, away_team_id = 2, goals = [] } = req.body ?? {}
  const row = { match_id: req.params.matchId, home_team_id, away_team_id, goals, ts: Date.now() }
  const { error } = await supabase.from('match_goals').upsert(row, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('match_goals')
  res.json({ ok: true })
})

router.delete('/match-goals/:matchId', adminOnly, async (req, res) => {
  const { error } = await supabase.from('match_goals').delete().eq('match_id', req.params.matchId)
  if (error) return fail(res, error, req.path)
  broadcastTable('match_goals')
  res.json({ ok: true })
})

export default router
