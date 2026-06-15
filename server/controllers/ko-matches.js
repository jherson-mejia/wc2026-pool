import { Router } from 'express'
import { supabase } from '../db.js'
import { broadcastTable } from '../sse.js'
import { adminOnly } from '../middleware/auth.js'
import { rowToKo } from '../transformers.js'
import { fail } from '../utils.js'

const router = Router()

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('ko_matches').select('*')
  if (error) return fail(res, error, req.path)
  const map = {}
  for (const r of data) map[r.match_id] = rowToKo(r)
  res.json(map)
})

router.put('/:matchId', adminOnly, async (req, res) => {
  const { home, away } = req.body ?? {}
  const row = { match_id: req.params.matchId, home, away, ts: Date.now() }
  const { error } = await supabase.from('ko_matches').upsert(row, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('ko_matches')
  res.json({ ok: true })
})

router.delete('/:matchId', adminOnly, async (req, res) => {
  const { error } = await supabase.from('ko_matches').delete().eq('match_id', req.params.matchId)
  if (error) return fail(res, error, req.path)
  broadcastTable('ko_matches')
  res.json({ ok: true })
})

export default router
