import { Router } from 'express'
import { Readable } from 'node:stream'

const router = Router()

router.use('/', async (req, res) => {
  const apiKey = process.env.FD_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FD_API_KEY not set in server .env' })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const upstream = await fetch(`https://api.football-data.org/v4${req.url}`, {
      headers: { 'X-Auth-Token': apiKey },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    res.status(upstream.status).setHeader('Content-Type', 'application/json')
    Readable.fromWeb(upstream.body).pipe(res)
  } catch (e) {
    clearTimeout(timeout)
    if (!res.headersSent) {
      const msg = e.name === 'AbortError' ? 'football-data.org timed out (10s)' : e.message
      res.status(502).json({ error: msg })
    }
  }
})

export default router
