import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startScheduler } from './scheduler.js'
import { supabase } from './db.js'
import { broadcast, sseHandler } from './sse.js'
import controllers, { makeSchedulerAdminRouter } from './controllers/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

process.on('uncaughtException', (err) => console.error('[server] uncaughtException — keeping alive:', err))
process.on('unhandledRejection', (reason) => console.error('[server] unhandledRejection — keeping alive:', reason))
process.on('exit', (code) => console.error('[server] process.exit called, code:', code, new Error().stack))

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ADMIN_PASSWORD']
const missing  = REQUIRED.filter(k => !process.env[k])
if (missing.length) {
  console.error(`\n❌  Missing required env vars: ${missing.join(', ')}`)
  console.error('    Copy .env.example → .env and fill in values.\n')
  process.exit(1)
}

const app = express()
app.use(cors())
app.use(express.json())
app.use((req, _res, next) => {
  if (req.path !== '/api/events') console.log(`[req] ${req.method} ${req.path}`)
  next()
})

app.get('/api/events', sseHandler)
app.get('/api/config', (_req, res) => res.json({ poolName: process.env.POOL_NAME || 'World Cup 2026 Pool' }))

for (const { path, router } of controllers) {
  app.use(path, router)
}
app.use('/api', makeSchedulerAdminRouter(() => scheduler))

const distDir = join(__dirname, '..', 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('/{*path}', (_req, res) => res.sendFile(join(distDir, 'index.html')))
  console.log('📦 Serving production build from dist/')
}

const PORT = process.env.PORT || 4000
const server = app.listen(PORT, () => console.log(`⚽ Pool server on http://localhost:${PORT}`))

let scheduler = null
server.once('listening', () => {
  scheduler = startScheduler({ supabase, broadcast, apiKey: process.env.FD_API_KEY })
  if (scheduler) {
    scheduler.syncSchedule().catch(err => console.error('[server] Startup schedule sync failed:', err.message))
  }
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] ❌ Port ${PORT} already in use. Kill the old process and restart.`)
  } else {
    console.error('[server] listen error:', err)
  }
})
