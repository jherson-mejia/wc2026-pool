import express from 'express'
import { adminOnly } from '../middleware/auth.js'
import { supabase } from '../db.js'
import { broadcast } from '../sse.js'
import { syncRosters } from '../rosters.js'

const router = express.Router()

router.post('/sync', adminOnly, async (req, res) => {
  const apiKey = process.env.FD_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FD_API_KEY not set' })
  try {
    const result = await syncRosters({ supabase, apiKey, broadcastFn: broadcast })
    res.json(result)
  } catch (e) {
    console.error('[rosters] sync error:', e.message)
    res.status(500).json({ error: e.message })
  }
})

export default router
