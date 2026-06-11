import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { Readable } from 'node:stream'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startScheduler } from './scheduler.js'

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
app.use((req, _res, next) => {
  if (req.path !== '/api/events') console.log(`[req] ${req.method} ${req.path}`)
  next()
})

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
  const limit = table === 'picks' || table === 'scorer_picks' ? 10000 : 1000
  const { data, error } = await supabase.from(table).select('*').limit(limit)
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
  } else if (table === 'lineups') {
    const map = {}
    for (const r of data) map[r.match_id] = rowToLineup(r)
    broadcast('lineups', map)
  } else if (table === 'match_goals') {
    const map = {}
    for (const r of data) map[r.match_id] = rowToMatchGoals(r)
    broadcast('match_goals', map)
  } else if (table === 'scorer_picks') {
    broadcast('scorer_picks', rowsToScorerPicks(data))
  } else if (table === 'match_meta') {
    const map = {}
    for (const r of data) map[r.match_id] = rowToMatchMeta(r)
    broadcast('match_meta', map)
  }
}

// ── Row shape converters ──────────────────────────────────────
const rowToResult = r => ({ matchId: r.match_id, home: r.home, away: r.away, winner: r.winner, homePens: r.home_pens ?? null, awayPens: r.away_pens ?? null, ts: r.ts })
const rowToKo     = r => ({ matchId: r.match_id, home: r.home, away: r.away, ts: r.ts })
const rowToPick   = r => ({ matchId: r.match_id, email: r.email, home: r.home, away: r.away, winner: r.winner, ts: r.ts })
const rowToLineup = r => ({
  matchId:    r.match_id,
  homeTeamId: r.home_team_id,
  awayTeamId: r.away_team_id,
  homeLineup: r.home_lineup ?? [],
  homeBench:  r.home_bench  ?? [],
  awayLineup: r.away_lineup ?? [],
  awayBench:  r.away_bench  ?? [],
  fetchedAt:  r.fetched_at,
})
const rowToMatchGoals = r => ({
  matchId:    r.match_id,
  homeTeamId: r.home_team_id,
  awayTeamId: r.away_team_id,
  goals:      r.goals ?? [],
})
const rowToMatchMeta = r => ({
  matchId:  r.match_id,
  venue:    r.venue    ?? null,
  referee:  r.referee  ?? null,
  oddsHome: r.odds_home ?? null,
  oddsDraw: r.odds_draw ?? null,
  oddsAway: r.odds_away ?? null,
})

function rowsToPicks(rows) {
  const byEmail = {}
  for (const r of rows) {
    if (!byEmail[r.email]) byEmail[r.email] = {}
    byEmail[r.email][r.match_id] = rowToPick(r)
  }
  return byEmail
}

function rowsToScorerPicks(rows) {
  const byEmail = {}
  for (const r of rows) {
    if (!byEmail[r.email]) byEmail[r.email] = {}
    const key = `${r.match_id}_${r.team}`
    byEmail[r.email][key] = {
      matchId: r.match_id, email: r.email, team: r.team,
      playerId: r.player_id, playerName: r.player_name, ts: r.ts,
    }
  }
  return byEmail
}

// ── Route error helper ────────────────────────────────────────
function fail(res, error, context) {
  console.error(`[server:${context}]`, error.message ?? error)
  return res.status(500).json({ error: error.message ?? String(error) })
}

// ── Admin auth middleware ─────────────────────────────────────
function adminOnly(req, res, next) {
  const pw = req.headers['x-admin-password']
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

// ── Trivia auth middleware (HMAC-SHA256 + timestamp) ──────────
// Signature = HMAC-SHA256(TRIVIA_SECRET, "{userId}:{promptId}:{timestamp}")
// Timestamp must be within ±5 minutes to prevent replay attacks.
function triviaOnly(req, res, next) {
  if (!process.env.TRIVIA_SECRET) return res.status(503).json({ error: 'Trivia not configured' })
  const { userId, promptId, timestamp, signature } = req.body ?? {}
  if (!timestamp || !signature) return res.status(401).json({ error: 'Missing signature' })
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return res.status(401).json({ error: 'Request expired' })
  const expected = createHmac('sha256', process.env.TRIVIA_SECRET)
    .update(`${userId}:${promptId}:${timestamp}`)
    .digest('hex')
  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }
  next()
}

// ── Trivia state broadcast ────────────────────────────────────
async function broadcastTriviaState() {
  const [{ data: questions }, { data: scores }, { data: impressions }, { data: parts }] = await Promise.all([
    supabase.from('trivia_questions').select('*').order('available_at', { ascending: false }),
    supabase.from('trivia_scores').select('user_id, prompt_id, is_correct'),
    supabase.from('trivia_impressions').select('user_id, prompt_id'),
    supabase.from('participants').select('user_id, name'),
  ])
  const nameMap = {}
  for (const p of parts ?? []) nameMap[p.user_id] = p.name
  const countMap = {}
  for (const s of scores ?? []) {
    if (s.is_correct) countMap[s.user_id] = (countMap[s.user_id] ?? 0) + 1
  }
  const leaderboard = Object.entries(countMap)
    .map(([userId, pts]) => ({ userId, name: nameMap[userId] ?? 'Unknown', pts }))
    .sort((a, b) => b.pts - a.pts)
  broadcast('trivia_state', {
    questions:   (questions   ?? []).map(q => ({ promptId: q.prompt_id, availableAt: q.available_at })),
    leaderboard,
    answers:     (scores      ?? []).map(s => ({ userId: s.user_id, promptId: s.prompt_id, isCorrect: s.is_correct })),
    impressions: (impressions ?? []).map(i => ({ userId: i.user_id, promptId: i.prompt_id })),
  })
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
    const [
      { data: parts }, { data: results }, { data: ko }, { data: picks }, { data: kos },
      { data: lineupRows }, { data: goalsRows }, { data: scorerPickRows }, { data: metaRows },
      { data: triviaQRows }, { data: triviaScoreRows }, { data: triviaImpRows },
    ] = await Promise.all([
      supabase.from('participants').select('*'),
      supabase.from('results').select('*'),
      supabase.from('ko_matches').select('*'),
      supabase.from('picks').select('*').limit(10000),
      supabase.from('kickoffs').select('*'),
      supabase.from('lineups').select('*'),
      supabase.from('match_goals').select('*'),
      supabase.from('scorer_picks').select('*'),
      supabase.from('match_meta').select('*'),
      supabase.from('trivia_questions').select('*'),
      supabase.from('trivia_scores').select('user_id, prompt_id, is_correct'),
      supabase.from('trivia_impressions').select('user_id, prompt_id'),
    ])

    const resultMap = {}
    for (const r of results ?? []) resultMap[r.match_id] = rowToResult(r)

    const koMap = {}
    for (const r of ko ?? []) koMap[r.match_id] = rowToKo(r)

    const kickoffMap = {}
    for (const r of kos ?? []) kickoffMap[r.match_id] = r.kickoff

    const lineupsMap = {}
    for (const r of lineupRows ?? []) lineupsMap[r.match_id] = rowToLineup(r)

    const goalsMap = {}
    for (const r of goalsRows ?? []) goalsMap[r.match_id] = rowToMatchGoals(r)

    const write = (ev, d) => res.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)
    write('participants', parts ?? [])
    write('results',      resultMap)
    write('ko_matches',   koMap)
    write('picks',        rowsToPicks(picks ?? []))
    write('kickoffs',     kickoffMap)
    const metaMap = {}
    for (const r of metaRows ?? []) metaMap[r.match_id] = rowToMatchMeta(r)

    write('lineups',      lineupsMap)
    write('match_goals',  goalsMap)
    write('scorer_picks', rowsToScorerPicks(scorerPickRows ?? []))
    write('match_meta',   metaMap)

    const nameMap = {}
    for (const p of parts ?? []) nameMap[p.user_id] = p.name
    const countMap = {}
    for (const s of triviaScoreRows ?? []) {
      if (s.is_correct) countMap[s.user_id] = (countMap[s.user_id] ?? 0) + 1
    }
    const triviaLeaderboard = Object.entries(countMap)
      .map(([userId, pts]) => ({ userId, name: nameMap[userId] ?? 'Unknown', pts }))
      .sort((a, b) => b.pts - a.pts)
    write('trivia_state', {
      questions:   (triviaQRows   ?? []).map(q => ({ promptId: q.prompt_id, availableAt: q.available_at })),
      leaderboard: triviaLeaderboard,
      answers:     (triviaScoreRows ?? []).map(s => ({ userId: s.user_id, promptId: s.prompt_id, isCorrect: s.is_correct })),
      impressions: (triviaImpRows  ?? []).map(i => ({ userId: i.user_id, promptId: i.prompt_id })),
    })
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

app.post('/api/admin-login', (req, res) => {
  const { password } = req.body ?? {}
  if (!password || password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' })
  res.json({ ok: true })
})

// ── Participants ──────────────────────────────────────────────
app.get('/api/participants', async (req, res) => {
  const { data, error } = await supabase.from('participants').select('*')
  if (error) return fail(res, error, req.path)
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
  if (error) return fail(res, error, req.path)
  broadcastTable('participants')
  res.json({ ok: true })
})

app.delete('/api/participants/:email', adminOnly, async (req, res) => {
  const { email } = req.params
  await supabase.from('picks').delete().eq('email', email)
  const { error } = await supabase.from('participants').delete().eq('email', email)
  if (error) return fail(res, error, req.path)
  broadcastTable('participants')
  broadcastTable('picks')
  res.json({ ok: true })
})

// ── My picks (by email) ───────────────────────────────────────
app.get('/api/my-picks', async (req, res) => {
  const { email } = req.query
  if (!email) return res.status(400).json({ error: 'email required' })
  const { data, error } = await supabase.from('picks').select('*').eq('email', email)
  if (error) return fail(res, error, req.path)
  const picks = {}
  for (const r of data ?? []) picks[r.match_id] = rowToPick(r)
  res.json(picks)
})

// ── Picks ─────────────────────────────────────────────────────
app.put('/api/picks/:id', async (req, res) => {
  const { id } = req.params
  const { email, match_id, home, away, winner } = req.body ?? {}

  // Server-side kickoff lock
  const { data: ko } = await supabase.from('kickoffs').select('kickoff').eq('match_id', match_id).maybeSingle()
  if (ko?.kickoff && Date.now() >= new Date(ko.kickoff).getTime()) {
    return res.status(403).json({ error: 'Picks locked — match has already kicked off' })
  }

  const row = { id, email, match_id, home, away, winner: winner ?? null, ts: Date.now() }
  const { error } = await supabase.from('picks').upsert(row, { onConflict: 'id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('picks')
  res.json({ ok: true })
})

// ── Picks bulk import ─────────────────────────────────────────
app.post('/api/picks/bulk', adminOnly, async (req, res) => {
  const { picks } = req.body ?? {}
  if (!Array.isArray(picks) || !picks.length) return res.status(400).json({ error: 'picks array required' })
  const rows = picks.map(p => ({
    id:       `${p.email}_${p.match_id}`,
    email:    p.email,
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

// ── Results ───────────────────────────────────────────────────
app.get('/api/results', async (req, res) => {
  const { data, error } = await supabase.from('results').select('*')
  if (error) return fail(res, error, req.path)
  const map = {}
  for (const r of data) map[r.match_id] = rowToResult(r)
  res.json(map)
})

app.put('/api/results/:matchId', adminOnly, async (req, res) => {
  const { home, away, winner, home_pens, away_pens } = req.body ?? {}
  const row = { match_id: req.params.matchId, home, away, winner: winner ?? null, home_pens: home_pens ?? null, away_pens: away_pens ?? null, ts: Date.now() }
  const { error } = await supabase.from('results').upsert(row, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('results')
  res.json({ ok: true })
})

app.delete('/api/results/:matchId', adminOnly, async (req, res) => {
  const { error } = await supabase.from('results').delete().eq('match_id', req.params.matchId)
  if (error) return fail(res, error, req.path)
  broadcastTable('results')
  res.json({ ok: true })
})

// ── KO Matches ────────────────────────────────────────────────
app.get('/api/ko-matches', async (req, res) => {
  const { data, error } = await supabase.from('ko_matches').select('*')
  if (error) return fail(res, error, req.path)
  const map = {}
  for (const r of data) map[r.match_id] = rowToKo(r)
  res.json(map)
})

app.put('/api/ko-matches/:matchId', adminOnly, async (req, res) => {
  const { home, away } = req.body ?? {}
  const row = { match_id: req.params.matchId, home, away, ts: Date.now() }
  const { error } = await supabase.from('ko_matches').upsert(row, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('ko_matches')
  res.json({ ok: true })
})

app.delete('/api/ko-matches/:matchId', adminOnly, async (req, res) => {
  const { error } = await supabase.from('ko_matches').delete().eq('match_id', req.params.matchId)
  if (error) return fail(res, error, req.path)
  broadcastTable('ko_matches')
  res.json({ ok: true })
})

// ── Kickoffs ──────────────────────────────────────────────────
app.get('/api/kickoffs', async (req, res) => {
  const { data, error } = await supabase.from('kickoffs').select('*')
  if (error) return fail(res, error, req.path)
  const map = {}
  for (const r of data) map[r.match_id] = r.kickoff
  res.json(map)
})

app.put('/api/kickoffs', adminOnly, async (req, res) => {
  const map = req.body ?? {}
  const rows = Object.entries(map).map(([match_id, kickoff]) => ({ match_id, kickoff, ts: Date.now() }))
  if (!rows.length) return res.json({ ok: true, count: 0 })
  const { error } = await supabase.from('kickoffs').upsert(rows, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('kickoffs')
  res.json({ ok: true, count: rows.length })
})

// ── Match Meta ────────────────────────────────────────────────
app.put('/api/match-meta', adminOnly, async (req, res) => {
  const map = req.body ?? {}
  const rows = Object.entries(map).map(([match_id, meta]) => ({
    match_id,
    odds_home: meta.odds_home ?? null,
    odds_draw: meta.odds_draw ?? null,
    odds_away: meta.odds_away ?? null,
    ts: Date.now(),
  }))
  if (!rows.length) return res.json({ ok: true, count: 0 })
  const { error } = await supabase.from('match_meta').upsert(rows, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('match_meta')
  res.json({ ok: true, count: rows.length })
})

// ── Lineup injection (dev/testing) ───────────────────────────
app.put('/api/lineups/:matchId', adminOnly, async (req, res) => {
  const { home_team_id = 1, away_team_id = 2, home_lineup = [], home_bench = [], away_lineup = [], away_bench = [] } = req.body ?? {}
  const row = {
    match_id: req.params.matchId,
    home_team_id, away_team_id,
    home_lineup, home_bench, away_lineup, away_bench,
    fetched_at: Date.now(),
  }
  const { error } = await supabase.from('lineups').upsert(row, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('lineups')
  res.json({ ok: true })
})

app.delete('/api/lineups/:matchId', adminOnly, async (req, res) => {
  const { error } = await supabase.from('lineups').delete().eq('match_id', req.params.matchId)
  if (error) return fail(res, error, req.path)
  broadcastTable('lineups')
  res.json({ ok: true })
})

// ── Match goals injection (dev/testing) ───────────────────────
app.put('/api/match-goals/:matchId', adminOnly, async (req, res) => {
  const { home_team_id = 1, away_team_id = 2, goals = [] } = req.body ?? {}
  const row = { match_id: req.params.matchId, home_team_id, away_team_id, goals, ts: Date.now() }
  const { error } = await supabase.from('match_goals').upsert(row, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  broadcastTable('match_goals')
  res.json({ ok: true })
})

app.delete('/api/match-goals/:matchId', adminOnly, async (req, res) => {
  const { error } = await supabase.from('match_goals').delete().eq('match_id', req.params.matchId)
  if (error) return fail(res, error, req.path)
  broadcastTable('match_goals')
  res.json({ ok: true })
})

// ── FD Match IDs ─────────────────────────────────────────────
app.put('/api/fd-match-ids', adminOnly, async (req, res) => {
  const map = req.body ?? {}
  const rows = Object.entries(map).map(([match_id, fd_id]) => ({ match_id, fd_id, ts: Date.now() }))
  if (!rows.length) return res.json({ ok: true, count: 0 })
  const { error } = await supabase.from('fd_match_ids').upsert(rows, { onConflict: 'match_id' })
  if (error) return fail(res, error, req.path)
  res.json({ ok: true, count: rows.length })
})

// ── Scorer Picks ──────────────────────────────────────────────
app.put('/api/scorer-picks/:id', async (req, res) => {
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

// ── Trivia ────────────────────────────────────────────────────

// Register a new prompt window (admin sets this up alongside Redfast)
app.post('/api/trivia/question', adminOnly, async (req, res) => {
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

// Redfast fires when prompt is shown to user
app.post('/api/trivia/seen', triviaOnly, async (req, res) => {
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

// Redfast fires on every answer (correct or wrong)
app.post('/api/trivia/score', triviaOnly, async (req, res) => {
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

// ── Scheduler status ──────────────────────────────────────────
app.get('/api/scheduler-status', adminOnly, (_req, res) => {
  res.json(scheduler?.status() ?? {
    requestsToday: 0, autoBudget: 80, dailyBudget: 100,
    reserved: 20, remaining: 80, lastSync: null, nextSync: null, pollsPlanned: 0,
  })
})

app.post('/api/scheduler-force', adminOnly, async (_req, res) => {
  if (!scheduler) return res.status(503).json({ error: 'Scheduler not running (FD_API_KEY not set)' })
  await scheduler.forceSync()
  res.json(scheduler.status())
})

app.post('/api/lineups/:matchId/sync', adminOnly, async (req, res) => {
  if (!scheduler) return res.status(503).json({ error: 'Scheduler not running (FD_API_KEY not set)' })
  try {
    await scheduler.syncLineup(req.params.matchId)
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

app.post('/api/scheduler-sync-schedule', adminOnly, async (_req, res) => {
  if (!scheduler) return res.status(503).json({ error: 'Scheduler not running (FD_API_KEY not set)' })
  try {
    const result = await scheduler.syncSchedule()
    res.json({ ok: true, ...result, ...scheduler.status() })
  } catch (err) {
    res.status(502).json({ error: err.message })
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

let scheduler = null
server.once('listening', () => {
  scheduler = startScheduler({ supabase, broadcast, apiKey: process.env.FD_API_KEY })
  // Sync schedule on startup so kickoffs, FD IDs, and odds are always fresh
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
