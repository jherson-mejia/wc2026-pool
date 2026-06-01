// ── 2026 FIFA World Cup Data ──────────────────────────────────

export const GROUPS = [
  { id: 'A', teams: ['Mexico', 'South Africa', 'South Korea', 'Czech Republic'] },
  { id: 'B', teams: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'] },
  { id: 'C', teams: ['Brazil', 'Morocco', 'Haiti', 'Scotland'] },
  { id: 'D', teams: ['United States', 'Paraguay', 'Australia', 'Turkey'] },
  { id: 'E', teams: ['Germany', 'Curaçao', 'Ivory Coast', 'Ecuador'] },
  { id: 'F', teams: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'] },
  { id: 'G', teams: ['Belgium', 'Egypt', 'Iran', 'New Zealand'] },
  { id: 'H', teams: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'] },
  { id: 'I', teams: ['France', 'Senegal', 'Iraq', 'Norway'] },
  { id: 'J', teams: ['Argentina', 'Algeria', 'Austria', 'Jordan'] },
  { id: 'K', teams: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'] },
  { id: 'L', teams: ['England', 'Croatia', 'Ghana', 'Panama'] },
]

// Match pairings per group: [homeIndex, awayIndex]
// MD1: [0v1, 2v3]  MD2: [0v2, 1v3]  MD3: [0v3, 1v2] (simultaneous)
const PAIRS = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]]
const MDS   = [1, 1, 2, 2, 3, 3]

export const GROUP_MATCHES = GROUPS.flatMap(g =>
  PAIRS.map(([a, b], i) => ({
    id:       `G${g.id}_${i + 1}`,
    group:    g.id,
    home:     g.teams[a],
    away:     g.teams[b],
    matchday: MDS[i],
    round:    'group',
    simultaneous: MDS[i] === 3,
  }))
)

export const KO_ROUNDS = [
  { id: 'r32',   name: 'Round of 32',   count: 16, scoring: { result: 2,  exact: 5  } },
  { id: 'r16',   name: 'Round of 16',   count: 8,  scoring: { result: 3,  exact: 7  } },
  { id: 'qf',    name: 'Quarterfinals', count: 4,  scoring: { result: 5,  exact: 10 } },
  { id: 'sf',    name: 'Semifinals',    count: 2,  scoring: { result: 8,  exact: 15 } },
  { id: 'tp',    name: 'Third Place',   count: 1,  scoring: { result: 5,  exact: 10 } },
  { id: 'final', name: 'Final',         count: 1,  scoring: { result: 12, exact: 22 } },
]

export const GROUP_SCORING = { result: 1, exact: 3 }

export const ALL_ROUNDS = [
  { id: 'group', name: 'Group Stage' },
  ...KO_ROUNDS,
]

export const TEAM_FLAGS = {
  // Emoji flags as a lightweight fallback
  'Mexico': '🇲🇽', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷', 'Czech Republic': '🇨🇿',
  'Canada': '🇨🇦', 'Bosnia and Herzegovina': '🇧🇦', 'Qatar': '🇶🇦', 'Switzerland': '🇨🇭',
  'Brazil': '🇧🇷', 'Morocco': '🇲🇦', 'Haiti': '🇭🇹', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'United States': '🇺🇸', 'Paraguay': '🇵🇾', 'Australia': '🇦🇺', 'Turkey': '🇹🇷',
  'Germany': '🇩🇪', 'Curaçao': '🇨🇼', 'Ivory Coast': '🇨🇮', 'Ecuador': '🇪🇨',
  'Netherlands': '🇳🇱', 'Japan': '🇯🇵', 'Sweden': '🇸🇪', 'Tunisia': '🇹🇳',
  'Belgium': '🇧🇪', 'Egypt': '🇪🇬', 'Iran': '🇮🇷', 'New Zealand': '🇳🇿',
  'Spain': '🇪🇸', 'Cape Verde': '🇨🇻', 'Saudi Arabia': '🇸🇦', 'Uruguay': '🇺🇾',
  'France': '🇫🇷', 'Senegal': '🇸🇳', 'Iraq': '🇮🇶', 'Norway': '🇳🇴',
  'Argentina': '🇦🇷', 'Algeria': '🇩🇿', 'Austria': '🇦🇹', 'Jordan': '🇯🇴',
  'Portugal': '🇵🇹', 'DR Congo': '🇨🇩', 'Uzbekistan': '🇺🇿', 'Colombia': '🇨🇴',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia': '🇭🇷', 'Ghana': '🇬🇭', 'Panama': '🇵🇦',
}

export function getFlag(team) {
  return TEAM_FLAGS[team] || '🏳️'
}
