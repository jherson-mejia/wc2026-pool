import { Router } from 'express'
import { supabase } from '../db.js'
import { broadcastTable } from '../sse.js'
import { adminOnly } from '../middleware/auth.js'
import { fail } from '../utils.js'

const router = Router()

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('kickoffs').select('*')
  if (error) return fail(res, error, req.path)
  const map = {}
  for (const r of data) map[r.match_id] = r.kickoff
  res.json(map)
})

router.put('/', adminOnly, async (req, res) => {
  const map = req.body ?? {}
  const rows = Object.entries(map).map(([match_id, kickoff]) => ({ match_id, kickoff, ts: Date.now() }))
  if (!rows.length) return res.json({ ok: true, count: 0 })
  const { error } = await supabase.from('kickoffs').upsert(rows, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('kickoffs')
  res.json({ ok: true, count: rows.length })
})

export default router
