import { Router } from 'express'
import { supabase } from '../db.js'
import { broadcast, broadcastTable } from '../sse.js'
import { adminOnly } from '../middleware/auth.js'
import { rowToPick } from '../transformers.js'
import { fail } from '../utils.js'

const router = Router()

router.get('/my-picks', async (req, res) => {
  const { email } = req.query
  if (!email) return res.status(400).json({ error: 'email required' })
  const { data, error } = await supabase.from('picks').select('*').eq('email', email.toLowerCase())
  if (error) return fail(res, error, req.path)
  const picks = {}
  for (const r of data ?? []) picks[r.match_id] = rowToPick(r)
  res.json(picks)
})

router.put('/picks/:id', async (req, res) => {
  const { id } = req.params
  const { email: rawEmail, match_id, home, away, winner } = req.body ?? {}
  const email = rawEmail?.toLowerCase()

  const { data: ko } = await supabase.from('kickoffs').select('kickoff').eq('match_id', match_id).maybeSingle()
  if (ko?.kickoff && Date.now() >= new Date(ko.kickoff).getTime()) {
    return res.status(403).json({ error: 'Picks locked — match has already kicked off' })
  }

  const ts = Date.now()
  const row = { id, email, match_id, home, away, winner: winner ?? null, ts }
  const { error } = await supabase.from('picks').upsert(row, { onConflict: 'id' })
  if (error) return fail(res, error, req.path)
  broadcast('pick_update', { [email]: { [match_id]: rowToPick(row) } })
  res.json({ ok: true })
})

router.post('/picks/bulk', adminOnly, async (req, res) => {
  const { picks } = req.body ?? {}
  if (!Array.isArray(picks) || !picks.length) return res.status(400).json({ error: 'picks array required' })
  const rows = picks.map(p => ({
    id:       `${p.email?.toLowerCase()}_${p.match_id}`,
    email:    p.email?.toLowerCase(),
    match_id: p.match_id,
    home:     p.home,
    away:     p.away,
    winner:   p.winner ?? null,
    ts:       Date.now(),
  }))
  const { error } = await supabase.from('picks').upsert(rows, { onConflict: 'id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('picks')
  res.json({ ok: true, count: rows.length })
})

export default router
