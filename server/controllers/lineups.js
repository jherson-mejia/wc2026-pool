import { Router } from 'express'
import { supabase } from '../db.js'
import { broadcastTable } from '../sse.js'
import { adminOnly } from '../middleware/auth.js'
import { fail } from '../utils.js'

const router = Router()

router.put('/lineups/:matchId', adminOnly, async (req, res) => {
  const { home_team_id = 1, away_team_id = 2, home_lineup = [], home_bench = [], away_lineup = [], away_bench = [] } = req.body ?? {}
  const row = {
    match_id: req.params.matchId,
    home_team_id, away_team_id,
    home_lineup, home_bench, away_lineup, away_bench,
    fetched_at: Date.now(),
  }
  const { error } = await supabase.from('lineups').upsert(row, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('lineups')
  res.json({ ok: true })
})

router.delete('/lineups/:matchId', adminOnly, async (req, res) => {
  const { error } = await supabase.from('lineups').delete().eq('match_id', req.params.matchId)
  if (error) return fail(res, error, req.path)
  broadcastTable('lineups')
  res.json({ ok: true })
})

export default router
