import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { Readable } from 'node:stream'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Register crash handlers immediately so nothing slips through
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException — keeping alive:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection — keeping alive:', reason)
})
process.on('exit', (code) => {
  console.error('[server] process.exit called, code:', code, new Error().stack)
})

// ── Env validation ────────────────────────────────────────────
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

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
)

// ── SSE client registry ───────────────────────────────────────
const sseClients = new Set()

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of sseClients) res.write(msg)
}

async function broadcastTable(table) {
  const { data, error } = await supabase.from(table).select('*')
  if (error || !data) return

  if (table === 'participants') {
    broadcast('participants', data)
  } else if (table === 'results') {
    const map = {}
    for (const r of data) map[r.match_id] = rowToResult(r)
    broadcast('results', map)
  } else if (table === 'ko_matches') {
    const map = {}
    for (const r of data) map[r.match_id] = rowToKo(r)
    broadcast('ko_matches', map)
  } else if (table === 'picks') {
    broadcast('picks', rowsToPicks(data))
  } else if (table === 'kickoffs') {
    const map = {}
    for (const r of data) map[r.match_id] = r.kickoff
    broadcast('kickoffs', map)
  }
}

// ── Row shape converters ──────────────────────────────────────
const rowToResult = r => ({ matchId: r.match_id, home: r.home, away: r.away, winner: r.winner, ts: r.ts })
const rowToKo     = r => ({ matchId: r.match_id, home: r.home, away: r.away, ts: r.ts })
const rowToPick   = r => ({ matchId: r.match_id, email: r.email, home: r.home, away: r.away, winner: r.winner, ts: r.ts })

function rowsToPicks(rows) {
  const byEmail = {}
  for (const r of rows) {
    if (!byEmail[r.email]) byEmail[r.email] = {}
    byEmail[r.email][r.match_id] = rowToPick(r)
  }
  return byEmail
}

// ── Admin auth middleware ─────────────────────────────────────
function adminOnly(req, res, next) {
  const pw = req.headers['x-admin-password']
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

// ── SSE endpoint ──────────────────────────────────────────────
app.get('/api/events', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Keepalive ping every 20 s so the browser doesn't close the connection
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000)

  sseClients.add(res)
  req.on('close', () => { clearInterval(ping); sseClients.delete(res) })

  // Send full snapshot on connect
  try {
    const [{ data: parts }, { data: results }, { data: ko }, { data: picks }, { data: kos }] = await Promise.all([
      supabase.from('participants').select('*'),
      supabase.from('results').select('*'),
      supabase.from('ko_matches').select('*'),
      supabase.from('picks').select('*'),
      supabase.from('kickoffs').select('*'),
    ])

    const resultMap = {}
    for (const r of results ?? []) resultMap[r.match_id] = rowToResult(r)

    const koMap = {}
    for (const r of ko ?? []) koMap[r.match_id] = rowToKo(r)

    const kickoffMap = {}
    for (const r of kos ?? []) kickoffMap[r.match_id] = r.kickoff

    const write = (ev, d) => res.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)
    write('participants', parts ?? [])
    write('results',      resultMap)
    write('ko_matches',   koMap)
    write('picks',        rowsToPicks(picks ?? []))
    write('kickoffs',     kickoffMap)
  } catch (err) {
    console.error('[SSE] initial snapshot failed:', err.message)
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`)
  }
})

// ── Config ────────────────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({ poolName: process.env.POOL_NAME || 'World Cup 2026 Pool' })
})

// ── Auth ──────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { name, email } = req.body ?? {}
  if (!name || !email) return res.status(400).json({ error: 'name and email required' })
  const row = { email: email.toLowerCase(), name, joined_at: Date.now() }
  const { error } = await supabase.from('participants').upsert(row, { onConflict: 'email' })
  if (error) return res.status(500).json({ error: error.message })
  broadcastTable('participants')
  res.json({ user: row })
})

app.post('/api/admin-login', (req, res) => {
  const { password } = req.body ?? {}
  if (!password || password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' })
  res.json({ ok: true })
})

// ── Participants ──────────────────────────────────────────────
app.get('/api/participants', async (_req, res) => {
  const { data, error } = await supabase.from('participants').select('*')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.get('/api/participants/:email', async (req, res) => {
  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('email', req.params.email.toLowerCase())
    .single()
  if (error || !data) return res.status(404).json({ error: 'No account found' })
  res.json(data)
})

app.patch('/api/participants/:email', adminOnly, async (req, res) => {
  const { error } = await supabase.from('participants').update(req.body).eq('email', req.params.email)
  if (error) return res.status(500).json({ error: error.message })
  broadcastTable('participants')
  res.json({ ok: true })
})

app.delete('/api/participants/:email', adminOnly, async (req, res) => {
  const { email } = req.params
  await supabase.from('picks').delete().eq('email', email)
  const { error } = await supabase.from('participants').delete().eq('email', email)
  if (error) return res.status(500).json({ error: error.message })
  broadcastTable('participants')
  broadcastTable('picks')
  res.json({ ok: true })
})

// ── Picks ─────────────────────────────────────────────────────
app.put('/api/picks/:id', async (req, res) => {
  const { id } = req.params
  const { email, match_id, home, away, winner } = req.body ?? {}
  const row = { id, email, match_id, home, away, winner: winner ?? null, ts: Date.now() }
  const { error } = await supabase.from('picks').upsert(row, { onConflict: 'id' })
  if (error) return res.status(500).json({ error: error.message })
  broadcastTable('picks')
  res.json({ ok: true })
})

// ── Results ───────────────────────────────────────────────────
app.get('/api/results', async (_req, res) => {
  const { data, error } = await supabase.from('results').select('*')
  if (error) return res.status(500).json({ error: error.message })
  const map = {}
  for (const r of data) map[r.match_id] = rowToResult(r)
  res.json(map)
})

app.put('/api/results/:matchId', adminOnly, async (req, res) => {
  const { home, away, winner } = req.body ?? {}
  const row = { match_id: req.params.matchId, home, away, winner: winner ?? null, ts: Date.now() }
  const { error } = await supabase.from('results').upsert(row, { onConflict: 'match_id' })
  if (error) return res.status(500).json({ error: error.message })
  broadcastTable('results')
  res.json({ ok: true })
})

app.delete('/api/results/:matchId', adminOnly, async (req, res) => {
  const { error } = await supabase.from('results').delete().eq('match_id', req.params.matchId)
  if (error) return res.status(500).json({ error: error.message })
  broadcastTable('results')
  res.json({ ok: true })
})

// ── KO Matches ────────────────────────────────────────────────
app.get('/api/ko-matches', async (_req, res) => {
  const { data, error } = await supabase.from('ko_matches').select('*')
  if (error) return res.status(500).json({ error: error.message })
  const map = {}
  for (const r of data) map[r.match_id] = rowToKo(r)
  res.json(map)
})

app.put('/api/ko-matches/:matchId', adminOnly, async (req, res) => {
  const { home, away } = req.body ?? {}
  const row = { match_id: req.params.matchId, home, away, ts: Date.now() }
  const { error } = await supabase.from('ko_matches').upsert(row, { onConflict: 'match_id' })
  if (error) return res.status(500).json({ error: error.message })
  broadcastTable('ko_matches')
  res.json({ ok: true })
})

app.delete('/api/ko-matches/:matchId', adminOnly, async (req, res) => {
  const { error } = await supabase.from('ko_matches').delete().eq('match_id', req.params.matchId)
  if (error) return res.status(500).json({ error: error.message })
  broadcastTable('ko_matches')
  res.json({ ok: true })
})

// ── Kickoffs ──────────────────────────────────────────────────
app.get('/api/kickoffs', async (_req, res) => {
  const { data, error } = await supabase.from('kickoffs').select('*')
  if (error) return res.status(500).json({ error: error.message })
  const map = {}
  for (const r of data) map[r.match_id] = r.kickoff
  res.json(map)
})

app.put('/api/kickoffs', adminOnly, async (req, res) => {
  const map = req.body ?? {}
  const rows = Object.entries(map).map(([match_id, kickoff]) => ({ match_id, kickoff, ts: Date.now() }))
  if (!rows.length) return res.json({ ok: true, count: 0 })
  const { error } = await supabase.from('kickoffs').upsert(rows, { onConflict: 'match_id' })
  if (error) return res.status(500).json({ error: error.message })
  broadcastTable('kickoffs')
  res.json({ ok: true, count: rows.length })
})

// ── football-data.org proxy (API key stays server-side) ───────
app.use('/api/football-data', async (req, res) => {
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

// ── Serve built frontend in production ───────────────────────
const distDir = join(__dirname, '..', 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('/{*path}', (_req, res) => res.sendFile(join(distDir, 'index.html')))
  console.log('📦 Serving production build from dist/')
}

const PORT = process.env.PORT || 4000
const server = app.listen(PORT, () => console.log(`⚽ Pool server on http://localhost:${PORT}`))

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] ❌ Port ${PORT} already in use. Kill the old process and restart.`)
  } else {
    console.error('[server] listen error:', err)
  }
})
