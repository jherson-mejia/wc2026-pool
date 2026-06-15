import { Router } from 'express'
import { supabase } from '../db.js'
import { adminOnly } from '../middleware/auth.js'

export function makeSchedulerAdminRouter(getScheduler) {
  const router = Router()

  router.get('/scheduler-status', adminOnly, (_req, res) => {
    const scheduler = getScheduler()
    res.json(scheduler?.status() ?? { lastSync: null, nextSync: null, syncing: false, pollsPlanned: 0, liveMatches: 0 })
  })

  router.post('/scheduler-force', adminOnly, async (_req, res) => {
    const scheduler = getScheduler()
    if (!scheduler) return res.status(503).json({ error: 'Scheduler not running (FD_API_KEY not set)' })
    await scheduler.forceSync()
    res.json(scheduler.status())
  })

  router.post('/scheduler-sync-schedule', adminOnly, async (_req, res) => {
    const scheduler = getScheduler()
    if (!scheduler) return res.status(503).json({ error: 'Scheduler not running (FD_API_KEY not set)' })
    try {
      const result = await scheduler.syncSchedule()
      res.json({ ok: true, ...result, ...scheduler.status() })
    } catch (err) {
      res.status(502).json({ error: err.message })
    }
  })

  router.post('/lineups/:matchId/sync', adminOnly, async (req, res) => {
    const scheduler = getScheduler()
    if (!scheduler) return res.status(503).json({ error: 'Scheduler not running (FD_API_KEY not set)' })
    try {
      await scheduler.syncLineup(req.params.matchId)
      res.json({ ok: true })
    } catch (err) {
      res.status(502).json({ error: err.message })
    }
  })

  // sync-all must come before /:matchId/sync to avoid "sync-all" matching as a matchId
  router.post('/goals/sync-all', adminOnly, async (_req, res) => {
    const scheduler = getScheduler()
    if (!scheduler) return res.status(503).json({ error: 'Scheduler not running (FD_API_KEY not set)' })
    try {
      const [{ data: resultRows }, { data: fdRows }] = await Promise.all([
        supabase.from('results').select('match_id'),
        supabase.from('fd_match_ids').select('match_id'),
      ])
      const fdMatchIds = new Set((fdRows ?? []).map(r => r.match_id))
      const toSync = (resultRows ?? []).map(r => r.match_id).filter(id => fdMatchIds.has(id))

      res.json({ ok: true, total: toSync.length, message: 'Sync started in background' })

      let synced = 0
      const errors = []
      for (const matchId of toSync) {
        try {
          await scheduler.syncGoals(matchId)
          synced++
        } catch (err) {
          errors.push(`${matchId}: ${err.message}`)
          console.warn(`[sync-all] ${matchId}: ${err.message}`)
        }
        await new Promise(r => setTimeout(r, 2100))
      }
      console.log(`[sync-all] Done: ${synced}/${toSync.length} synced, ${errors.length} errors`)
    } catch (err) {
      if (!res.headersSent) res.status(502).json({ error: err.message })
      else console.error('[sync-all] fatal:', err.message)
    }
  })

  router.post('/goals/:matchId/sync', adminOnly, async (req, res) => {
    const scheduler = getScheduler()
    if (!scheduler) return res.status(503).json({ error: 'Scheduler not running (FD_API_KEY not set)' })
    try {
      const count = await scheduler.syncGoals(req.params.matchId)
      res.json({ ok: true, goals: count })
    } catch (err) {
      res.status(502).json({ error: err.message })
    }
  })

  return router
}
