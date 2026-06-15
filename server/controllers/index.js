import authRouter from './auth.js'
import participantsRouter from './participants.js'
import picksRouter from './picks.js'
import resultsRouter from './results.js'
import koMatchesRouter from './ko-matches.js'
import kickoffsRouter from './kickoffs.js'
import lineupsRouter from './lineups.js'
import matchGoalsRouter from './match-goals.js'
import matchMetaRouter from './match-meta.js'
import scorerPicksRouter from './scorer-picks.js'
import scorersRouter from './scorers.js'
import triviaRouter from './trivia.js'
import proxyRouter from './proxy.js'

export { makeSchedulerAdminRouter } from './scheduler-admin.js'

export default [
  { path: '/api', router: authRouter },
  { path: '/api/participants', router: participantsRouter },
  { path: '/api', router: picksRouter },
  { path: '/api/results', router: resultsRouter },
  { path: '/api/ko-matches', router: koMatchesRouter },
  { path: '/api/kickoffs', router: kickoffsRouter },
  { path: '/api', router: lineupsRouter },
  { path: '/api', router: matchGoalsRouter },
  { path: '/api', router: matchMetaRouter },
  { path: '/api/scorer-picks', router: scorerPicksRouter },
  { path: '/api/scorers', router: scorersRouter },
  { path: '/api/trivia', router: triviaRouter },
  { path: '/api/football-data', router: proxyRouter },
]
