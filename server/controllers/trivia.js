import { Router } from 'express'
import { supabase } from '../db.js'
import { broadcastTriviaState } from '../sse.js'
import { adminOnly, triviaOnly } from '../middleware/auth.js'
import { fail } from '../utils.js'

const router = Router()

router.post('/question', adminOnly, async (req, res) => {
  const { promptId, availableAt } = req.body ?? {}
  if (!promptId || !availableAt) return res.status(400).json({ error: 'promptId and availableAt required' })
  const { error } = await supabase.from('trivia_questions').upsert(
    { prompt_id: promptId, available_at: availableAt, created_at: Date.now() },
    { onConflict: 'prompt_id' }
  )
  if (error) return fail(res, error, req.path)
  await broadcastTriviaState()
  res.json({ ok: true })
})

router.post('/seen', triviaOnly, async (req, res) => {
  const { userId, promptId } = req.body ?? {}
  if (!userId || !promptId) return res.status(400).json({ error: 'userId and promptId required' })
  const id = `${userId}_${promptId}`
  const { error } = await supabase.from('trivia_impressions').upsert(
    { id, user_id: userId, prompt_id: promptId, seen_at: Date.now() },
    { onConflict: 'id', ignoreDuplicates: true }
  )
  if (error) return fail(res, error, req.path)
  await broadcastTriviaState()
  res.json({ ok: true })
})

router.post('/score', triviaOnly, async (req, res) => {
  const { userId, promptId, isCorrect } = req.body ?? {}
  if (!userId || !promptId) return res.status(400).json({ error: 'userId and promptId required' })
  const id = `${userId}_${promptId}`
  const { data: existing } = await supabase.from('trivia_scores').select('id').eq('id', id).maybeSingle()
  if (existing) return res.json({ ok: true, scored: false, alreadyAnswered: true })
  const { error } = await supabase.from('trivia_scores').insert({
    id, user_id: userId, prompt_id: promptId, is_correct: isCorrect ?? false, answered_at: Date.now(),
  })
  if (error) return fail(res, error, req.path)
  await broadcastTriviaState()
  res.json({ ok: true, scored: isCorrect ?? false })
})

export default router
