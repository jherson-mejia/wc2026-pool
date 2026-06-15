import { Router } from 'express'
import { supabase } from '../db.js'
import { broadcastTable } from '../sse.js'
import { adminOnly } from '../middleware/auth.js'
import { fail } from '../utils.js'

const router = Router()

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('participants').select('*')
  if (error) return fail(res, error, req.path)
  res.json(data)
})

router.get('/:email', async (req, res) => {
  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('email', req.params.email.toLowerCase())
    .single()
  if (error || !data) return res.status(404).json({ error: 'No account found' })
  res.json(data)
})

router.patch('/:email', adminOnly, async (req, res) => {
  const { error } = await supabase.from('participants').update(req.body).eq('email', req.params.email)
  if (error) return fail(res, error, req.path)
  broadcastTable('participants')
  res.json({ ok: true })
})

router.delete('/:email', adminOnly, async (req, res) => {
  const { email } = req.params
  await supabase.from('picks').delete().eq('email', email)
  const { error } = await supabase.from('participants').delete().eq('email', email)
  if (error) return fail(res, error, req.path)
  broadcastTable('participants')
  broadcastTable('picks')
  res.json({ ok: true })
})

export default router
