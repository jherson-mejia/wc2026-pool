import { Router } from 'express'
import { supabase } from '../db.js'
import { GROUP_MATCHES } from '../../src/data/worldcup.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 50)

    const [{ data: goalRows }, { data: koRows }] = await Promise.all([
      supabase.from('match_goals').select('*'),
      supabase.from('ko_matches').select('*'),
    ])

    const teamNames = {}
    for (const m of GROUP_MATCHES) teamNames[m.id] = { home: m.home, away: m.away }
    for (const r of koRows ?? []) teamNames[r.match_id] = { home: r.home, away: r.away }

    const scorerMap = {}
    for (const row of goalRows ?? []) {
      const teams = teamNames[row.match_id]
      for (const g of row.goals ?? []) {
        if (!g.scorer_id || !g.scorer_name) continue
        const key = String(g.scorer_id)
        if (!scorerMap[key]) {
          let teamName = null
          if (teams) {
            if (row.home_team_id != null && String(g.team_id) === String(row.home_team_id)) teamName = teams.home
            else if (row.away_team_id != null && String(g.team_id) === String(row.away_team_id)) teamName = teams.away
          }
          scorerMap[key] = { player: { id: g.scorer_id, name: g.scorer_name }, team: { name: teamName }, goals: 0 }
        }
        scorerMap[key].goals++
      }
    }

    const scorers = Object.values(scorerMap).sort((a, b) => b.goals - a.goals).slice(0, limit)
    res.json({ scorers })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
