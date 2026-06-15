import { Router } from 'express'
import { supabase } from '../db.js'
import { broadcastTable } from '../sse.js'
import { fail } from '../utils.js'

const router = Router()

router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { email, match_id, team, player_id, player_name } = req.body ?? {}
  if (!email || !match_id || !team || !player_id || !player_name) {
    return res.status(400).json({ error: 'email, match_id, team, player_id, player_name required' })
  }

  const { data: ko } = await supabase.from('kickoffs').select('kickoff').eq('match_id', match_id).maybeSingle()
  if (ko?.kickoff && Date.now() >= new Date(ko.kickoff).getTime()) {
    return res.status(403).json({ error: 'Scorer picks locked — match has already kicked off' })
  }

  const row = { id, email, match_id, team, player_id, player_name, ts: Date.now() }
  const { error } = await supabase.from('scorer_picks').upsert(row, { onConflict: 'id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('scorer_picks')
  res.json({ ok: true })
})

export default router
