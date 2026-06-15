import { supabase, fetchAllRows } from './db.js'
import {
  rowToResult, rowToKo, rowToLineup, rowToMatchGoals, rowToMatchMeta,
  rowToLiveScore, rowsToPicks, rowsToScorerPicks,
} from './transformers.js'

export const sseClients = new Set()

export function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of sseClients) res.write(msg)
}

export async function broadcastTable(table) {
  const data = await fetchAllRows(table)
  if (!data.length && table !== 'participants') return

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
  } else if (table === 'live_scores') {
    const map = {}
    for (const r of data) map[r.match_id] = rowToLiveScore(r)
    broadcast('live_scores', map)
  }
}

export async function broadcastTriviaState() {
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

export async function sseHandler(req, res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const ping = setInterval(() => res.write(': ping\n\n'), 20_000)
  sseClients.add(res)
  req.on('close', () => { clearInterval(ping); sseClients.delete(res) })

  try {
    const [
      { data: parts }, { data: results }, { data: ko }, kos_data,
      { data: lineupRows }, { data: goalsRows }, picks, scorerPickRows, { data: metaRows },
      { data: triviaQRows }, { data: triviaScoreRows }, { data: triviaImpRows },
      { data: liveScoreRows },
    ] = await Promise.all([
      supabase.from('participants').select('*'),
      supabase.from('results').select('*'),
      supabase.from('ko_matches').select('*'),
      supabase.from('kickoffs').select('*'),
      supabase.from('lineups').select('*'),
      supabase.from('match_goals').select('*'),
      fetchAllRows('picks'),
      fetchAllRows('scorer_picks'),
      supabase.from('match_meta').select('*'),
      supabase.from('trivia_questions').select('*'),
      supabase.from('trivia_scores').select('user_id, prompt_id, is_correct'),
      supabase.from('trivia_impressions').select('user_id, prompt_id'),
      supabase.from('live_scores').select('*'),
    ])
    const kos = kos_data.data ?? []

    const resultMap = {}
    for (const r of results ?? []) resultMap[r.match_id] = rowToResult(r)
    const koMap = {}
    for (const r of ko ?? []) koMap[r.match_id] = rowToKo(r)
    const kickoffMap = {}
    for (const r of kos) kickoffMap[r.match_id] = r.kickoff
    const lineupsMap = {}
    for (const r of lineupRows ?? []) lineupsMap[r.match_id] = rowToLineup(r)
    const goalsMap = {}
    for (const r of goalsRows ?? []) goalsMap[r.match_id] = rowToMatchGoals(r)
    const metaMap = {}
    for (const r of metaRows ?? []) metaMap[r.match_id] = rowToMatchMeta(r)
    const liveMap = {}
    for (const r of liveScoreRows ?? []) liveMap[r.match_id] = rowToLiveScore(r)

    const write = (ev, d) => res.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`)
    write('participants', parts ?? [])
    write('results',      resultMap)
    write('ko_matches',   koMap)
    write('picks',        rowsToPicks(picks))
    write('kickoffs',     kickoffMap)
    write('lineups',      lineupsMap)
    write('match_goals',  goalsMap)
    write('scorer_picks', rowsToScorerPicks(scorerPickRows))
    write('match_meta',   metaMap)
    write('live_scores',  liveMap)

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
      questions:   (triviaQRows    ?? []).map(q => ({ promptId: q.prompt_id, availableAt: q.available_at })),
      leaderboard: triviaLeaderboard,
      answers:     (triviaScoreRows ?? []).map(s => ({ userId: s.user_id, promptId: s.prompt_id, isCorrect: s.is_correct })),
      impressions: (triviaImpRows  ?? []).map(i => ({ userId: i.user_id, promptId: i.prompt_id })),
    })
  } catch (err) {
    console.error('[SSE] initial snapshot failed:', err.message)
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`)
  }
}
