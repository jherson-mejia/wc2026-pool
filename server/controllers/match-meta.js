import { Router } from 'express'
import { supabase } from '../db.js'
import { broadcastTable } from '../sse.js'
import { adminOnly } from '../middleware/auth.js'
import { fail } from '../utils.js'

const router = Router()

router.put('/match-meta', adminOnly, async (req, res) => {
  const map = req.body ?? {}
  const rows = Object.entries(map).map(([match_id, meta]) => ({
    match_id,
    odds_home: meta.odds_home ?? null,
    odds_draw: meta.odds_draw ?? null,
    odds_away: meta.odds_away ?? null,
    ts: Date.now(),
  }))
  if (!rows.length) return res.json({ ok: true, count: 0 })
  const { error } = await supabase.from('match_meta').upsert(rows, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('match_meta')
  res.json({ ok: true, count: rows.length })
})

router.put('/fd-match-ids', adminOnly, async (req, res) => {
  const map = req.body ?? {}
  const rows = Object.entries(map).map(([match_id, fd_id]) => ({ match_id, fd_id, ts: Date.now() }))
  if (!rows.length) return res.json({ ok: true, count: 0 })
  const { error } = await supabase.from('fd_match_ids').upsert(rows, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  res.json({ ok: true, count: rows.length })
})

export default router
