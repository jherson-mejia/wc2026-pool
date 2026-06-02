// ── Bracket advancement tree ──────────────────────────────────
// Defines which source match provides home/away for each KO match.
// `loser: true` means the team is the loser (3rd-place match).

export const BRACKET_TREE = {
  r16_1:   { home: 'r32_1',  away: 'r32_2'  },
  r16_2:   { home: 'r32_3',  away: 'r32_4'  },
  r16_3:   { home: 'r32_5',  away: 'r32_6'  },
  r16_4:   { home: 'r32_7',  away: 'r32_8'  },
  r16_5:   { home: 'r32_9',  away: 'r32_10' },
  r16_6:   { home: 'r32_11', away: 'r32_12' },
  r16_7:   { home: 'r32_13', away: 'r32_14' },
  r16_8:   { home: 'r32_15', away: 'r32_16' },
  qf_1:    { home: 'r16_1',  away: 'r16_2'  },
  qf_2:    { home: 'r16_3',  away: 'r16_4'  },
  qf_3:    { home: 'r16_5',  away: 'r16_6'  },
  qf_4:    { home: 'r16_7',  away: 'r16_8'  },
  sf_1:    { home: 'qf_1',   away: 'qf_2'   },
  sf_2:    { home: 'qf_3',   away: 'qf_4'   },
  final_1: { home: 'sf_1',   away: 'sf_2'   },
  tp_1:    { home: 'sf_1',   away: 'sf_2', loser: true },
}

const ROUND_SHORT = { r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', final: 'F', tp: '3rd' }

function roundOf(id)  { return id.replace(/_\d+$/, '') }
function numOf(id)    { return parseInt(id.split('_').pop(), 10) }

function resolveWinner(srcId, koMatches, results, loser = false) {
  const km = koMatches[srcId]
  const r  = results[srcId]
  if (!km?.home || !r?.winner) return null
  if (loser) return r.winner === 'home' ? km.away : km.home
  return r.winner === 'home' ? km.home : km.away
}

function placeholder(srcId, loser = false) {
  const r   = roundOf(srcId)
  const n   = numOf(srcId)
  const lbl = ROUND_SHORT[r] ?? r.toUpperCase()
  return loser ? `Loser ${lbl} #${n}` : `W. ${lbl} #${n}`
}

export function buildMatchNode(matchId, koMatches, results) {
  const tree   = BRACKET_TREE[matchId]
  const km     = koMatches[matchId]
  const result = results[matchId]

  let home = km?.home ?? null
  let away = km?.away ?? null

  if (!home && tree) home = resolveWinner(tree.home, koMatches, results, tree.loser)
  if (!away && tree) away = resolveWinner(tree.away, koMatches, results, tree.loser)

  const homeDisplay = home ?? (tree ? placeholder(tree.home, tree.loser) : 'TBD')
  const awayDisplay = away ?? (tree ? placeholder(tree.away, tree.loser) : 'TBD')

  const winner = result?.winner
    ? (result.winner === 'home' ? home : away)
    : null

  return {
    matchId,
    roundId: roundOf(matchId),
    num:     numOf(matchId),
    home, away,
    homeDisplay, awayDisplay,
    result: result ?? null,
    known:  !!(home && away),
    winner,
  }
}

export function buildBracket(koMatches = {}, results = {}) {
  const b = ids => ids.map(id => buildMatchNode(id, koMatches, results))
  return {
    r32:   b(['r32_1','r32_2','r32_3','r32_4','r32_5','r32_6','r32_7','r32_8',
               'r32_9','r32_10','r32_11','r32_12','r32_13','r32_14','r32_15','r32_16']),
    r16:   b(['r16_1','r16_2','r16_3','r16_4','r16_5','r16_6','r16_7','r16_8']),
    qf:    b(['qf_1','qf_2','qf_3','qf_4']),
    sf:    b(['sf_1','sf_2']),
    final: b(['final_1']),
    tp:    b(['tp_1']),
  }
}

// ── Mock data for development / empty state ───────────────────

export const MOCK_KO = {
  r32_1:  { home: 'Mexico',       away: 'South Korea'   },
  r32_2:  { home: 'Morocco',      away: 'Canada'        },
  r32_3:  { home: 'Brazil',       away: 'Switzerland'   },
  r32_4:  { home: 'France',       away: 'Germany'       },
  r32_5:  { home: 'Argentina',    away: 'Spain'         },
  r32_6:  { home: 'England',      away: 'Portugal'      },
  r32_7:  { home: 'Netherlands',  away: 'Belgium'       },
  r32_8:  { home: 'Japan',        away: 'United States' },
  r32_9:  { home: 'Uruguay',      away: 'Colombia'      },
  r32_10: { home: 'Senegal',      away: 'Turkey'        },
  r32_11: { home: 'Ecuador',      away: 'Norway'        },
  r32_12: { home: 'Saudi Arabia', away: 'Australia'     },
  r32_13: { home: 'Egypt',        away: 'South Africa'  },
  r32_14: { home: 'Croatia',      away: 'Austria'       },
  r32_15: { home: 'Iran',         away: 'Algeria'       },
  r32_16: { home: 'DR Congo',     away: 'Jordan'        },
}

export const MOCK_RESULTS = {
  r32_1:  { home: 2, away: 0, winner: 'home' },
  r32_2:  { home: 0, away: 1, winner: 'away' },
  r32_3:  { home: 3, away: 1, winner: 'home' },
  r32_4:  { home: 1, away: 2, winner: 'away' },
  r32_5:  { home: 1, away: 0, winner: 'home' },
  r32_6:  { home: 1, away: 1, winner: 'home', homePens: 4, awayPens: 3 },
  r32_7:  { home: 0, away: 2, winner: 'away' },
  r32_8:  { home: 0, away: 1, winner: 'away' },
  r32_9:  { home: 2, away: 1, winner: 'home' },
  r32_10: { home: 0, away: 0, winner: 'away', homePens: 3, awayPens: 5 },
  r32_11: { home: 1, away: 3, winner: 'away' },
  r32_12: { home: 2, away: 0, winner: 'home' },
  // R16 teams auto-derived from R32 winners above
  r16_1: { home: 2, away: 1, winner: 'home' },  // Mexico vs France
  r16_2: { home: 0, away: 1, winner: 'away' },  // Brazil vs Argentina
}
