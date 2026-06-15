import { Router } from 'express'
import { supabase } from '../db.js'
import { broadcastTable } from '../sse.js'
import { fail } from '../utils.js'

const router = Router()

router.post('/login', async (req, res) => {
  const { name, email } = req.body ?? {}
  if (!name || !email) return res.status(400).json({ error: 'name and email required' })
  const lowerEmail = email.toLowerCase()
  const { data: existing } = await supabase.from('participants').select('*').eq('email', lowerEmail).maybeSingle()
  let participant
  if (existing) {
    const { error } = await supabase.from('participants').update({ name, joined_at: Date.now() }).eq('email', lowerEmail)
    if (error) return fail(res, error, req.path)
    participant = { ...existing, name }
  } else {
    const { data, error } = await supabase.from('participants').insert({ email: lowerEmail, name, joined_at: Date.now() }).select().single()
    if (error) return fail(res, error, req.path)
    participant = data
  }
  broadcastTable('participants')
  res.json({ user: participant })
})

router.post('/admin-login', (req, res) => {
  const { password } = req.body ?? {}
  if (!password || password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' })
  res.json({ ok: true })
})

export default router
