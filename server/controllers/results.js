import { Router } from 'express'
import { supabase } from '../db.js'
import { broadcastTable } from '../sse.js'
import { adminOnly } from '../middleware/auth.js'
import { rowToResult } from '../transformers.js'
import { fail } from '../utils.js'

const router = Router()

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('results').select('*')
  if (error) return fail(res, error, req.path)
  const map = {}
  for (const r of data) map[r.match_id] = rowToResult(r)
  res.json(map)
})

router.put('/:matchId', adminOnly, async (req, res) => {
  const { home, away, winner, home_pens, away_pens } = req.body ?? {}
  const row = { match_id: req.params.matchId, home, away, winner: winner ?? null, home_pens: home_pens ?? null, away_pens: away_pens ?? null, ts: Date.now() }
  const { error } = await supabase.from('results').upsert(row, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('results')
  res.json({ ok: true })
})

router.delete('/:matchId', adminOnly, async (req, res) => {
  const { error } = await supabase.from('results').delete().eq('match_id', req.params.matchId)
  if (error) return fail(res, error, req.path)
  broadcastTable('results')
  res.json({ ok: true })
})

export default router
