/**
 * Storage layer.
 *
 * local mode  → localStorage (LS helpers + dbSet/dbDelete)
 * server mode → Express API over /api/* (Supabase credentials never leave the server)
 */

// ── localStorage helpers (used by local mode) ─────────────────
export const LS = {
  get: k  => { try { return JSON.parse(localStorage.getItem('wc26_' + k)) } catch { return null } },
  set: (k, v) => localStorage.setItem('wc26_' + k, JSON.stringify(v)),
  del: k  => localStorage.removeItem('wc26_' + k),
}

// ── Generic local-mode helpers (unchanged interface) ──────────
export async function dbSet(col, id, data) {
  const store = LS.get(col) || {}
  store[id] = data
  LS.set(col, store)
}

export async function dbDelete(col, id) {
  const store = LS.get(col) || {}
  delete store[id]
  LS.set(col, store)
}

// ── API client (server mode) ──────────────────────────────────
async function apiFetch(path, { headers: extraHeaders, ...rest } = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    ...rest,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Server error ${res.status}`)
  }
  return res.json()
}

function adminHeaders() {
  const pw = LS.get('adminPw')
  return pw ? { 'X-Admin-Password': pw } : {}
}

// ── Auth ──────────────────────────────────────────────────────
export async function apiLogin(name, email) {
  return apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ name, email }) })
}

export async function apiAdminLogin(password) {
  return apiFetch('/api/admin-login', { method: 'POST', body: JSON.stringify({ password }) })
}

// ── Participants ──────────────────────────────────────────────
export async function apiGetParticipant(email) {
  return apiFetch(`/api/participants/${encodeURIComponent(email)}`)
}

export async function apiUpdateParticipant(email, updates) {
  return apiFetch(`/api/participants/${encodeURIComponent(email)}`, {
    method: 'PATCH', headers: adminHeaders(), body: JSON.stringify(updates),
  })
}

export async function apiDeleteParticipant(email) {
  return apiFetch(`/api/participants/${encodeURIComponent(email)}`, {
    method: 'DELETE', headers: adminHeaders(),
  })
}

// ── Picks ─────────────────────────────────────────────────────
export async function apiSavePick(email, matchId, home, away, winner) {
  const id = `${email}_${matchId}`
  return apiFetch(`/api/picks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ email, match_id: matchId, home, away, winner: winner ?? null }),
  })
}

export async function apiBulkImportPicks(picks) {
  return apiFetch('/api/picks/bulk', {
    method: 'POST', headers: adminHeaders(), body: JSON.stringify({ picks }),
  })
}

// ── Results ───────────────────────────────────────────────────
export async function apiSaveResult(matchId, home, away, winner, homePens = null, awayPens = null) {
  return apiFetch(`/api/results/${encodeURIComponent(matchId)}`, {
    method: 'PUT', headers: adminHeaders(), body: JSON.stringify({ home, away, winner, home_pens: homePens, away_pens: awayPens }),
  })
}

export async function apiDeleteResult(matchId) {
  return apiFetch(`/api/results/${encodeURIComponent(matchId)}`, {
    method: 'DELETE', headers: adminHeaders(),
  })
}

// ── Kickoffs ──────────────────────────────────────────────────
export async function apiSaveKickoffs(map) {
  return apiFetch('/api/kickoffs', {
    method: 'PUT', headers: adminHeaders(), body: JSON.stringify(map),
  })
}

// ── Match Meta ────────────────────────────────────────────────
export async function apiSaveMatchMeta(map) {
  return apiFetch('/api/match-meta', {
    method: 'PUT', headers: adminHeaders(), body: JSON.stringify(map),
  })
}

// ── FD Match IDs ──────────────────────────────────────────────
export async function apiSaveFdMatchIds(map) {
  return apiFetch('/api/fd-match-ids', {
    method: 'PUT', headers: adminHeaders(), body: JSON.stringify(map),
  })
}

// ── Scorer Picks ──────────────────────────────────────────────
export async function apiSaveScorerPick(email, matchId, team, playerId, playerName) {
  const id = `${email}_${matchId}_${team}`
  return apiFetch(`/api/scorer-picks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ email, match_id: matchId, team, player_id: playerId, player_name: playerName }),
  })
}

// ── KO Matches ────────────────────────────────────────────────
export async function apiSetKoMatch(matchId, home, away) {
  return apiFetch(`/api/ko-matches/${encodeURIComponent(matchId)}`, {
    method: 'PUT', headers: adminHeaders(), body: JSON.stringify({ home, away }),
  })
}

export async function apiDeleteKoMatch(matchId) {
  return apiFetch(`/api/ko-matches/${encodeURIComponent(matchId)}`, {
    method: 'DELETE', headers: adminHeaders(),
  })
}

// ── SSE (real-time updates from server) ───────────────────────
export function listenSSE({ onParticipants, onResults, onKoMatches, onPicks, onKickoffs, onLineups, onScorerPicks, onMatchGoals, onMatchMeta, onTriviaState }) {
  const es = new EventSource('/api/events')
  es.addEventListener('participants',  e => onParticipants?.(JSON.parse(e.data)))
  es.addEventListener('results',       e => onResults?.(JSON.parse(e.data)))
  es.addEventListener('ko_matches',    e => onKoMatches?.(JSON.parse(e.data)))
  es.addEventListener('picks',         e => onPicks?.(JSON.parse(e.data)))
  es.addEventListener('kickoffs',      e => onKickoffs?.(JSON.parse(e.data)))
  es.addEventListener('lineups',       e => onLineups?.(JSON.parse(e.data)))
  es.addEventListener('scorer_picks',  e => onScorerPicks?.(JSON.parse(e.data)))
  es.addEventListener('match_goals',   e => onMatchGoals?.(JSON.parse(e.data)))
  es.addEventListener('match_meta',    e => onMatchMeta?.(JSON.parse(e.data)))
  es.addEventListener('trivia_state',  e => onTriviaState?.(JSON.parse(e.data)))
  es.onerror = () => console.warn('SSE reconnecting…')
  return () => es.close()
}
