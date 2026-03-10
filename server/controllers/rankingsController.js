// server/controllers/rankingsController.js
const pool = require('../db');

// GET /api/rankings/historical?distance=21K&limit=50
async function historicalRanking(req, res) {
  const distance = req.query.distance || '21K';
  const limit    = Math.min(parseInt(req.query.limit) || 50, 200);
  try {
    const result = await pool.query(
      `SELECT rr.runner_id, r.name, r.surname, r.gender, r.province,
              rr.year, rr.distance, rr.category, rr.time_raw,
              rr.time_seconds, rr.position_general,
              ROW_NUMBER() OVER (ORDER BY rr.time_seconds ASC) AS rank
       FROM race_results rr
       JOIN runners r ON r.runner_id = rr.runner_id
       WHERE rr.distance = $1 AND rr.time_seconds IS NOT NULL
       ORDER BY rr.time_seconds ASC
       LIMIT $2`,
      [distance, limit]
    );
    res.json({ distance, ranking: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener ranking histórico' });
  }
}

// GET /api/rankings/loyal — Corredores más fieles (más participaciones)
async function loyalRunners(req, res) {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  try {
    const result = await pool.query(
      `SELECT r.runner_id, r.name, r.surname, r.gender, r.province,
              COUNT(rr.id) AS total_races,
              MIN(rr.year)  AS first_year,
              MAX(rr.year)  AS last_year,
              MIN(rr.time_seconds) AS best_time_seconds,
              (SELECT time_raw FROM race_results
               WHERE runner_id = r.runner_id
               ORDER BY time_seconds ASC LIMIT 1) AS best_time_raw
       FROM runners r
       JOIN race_results rr ON rr.runner_id = r.runner_id
       GROUP BY r.runner_id, r.name, r.surname, r.gender, r.province
       ORDER BY total_races DESC, r.surname
       LIMIT $1`,
      [limit]
    );
    res.json({ ranking: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener ranking de fieles' });
  }
}

// GET /api/rankings/progression?distance=21K — Mayor mejora de tiempo
async function progressionRanking(req, res) {
  const distance = req.query.distance || '21K';
  const limit    = Math.min(parseInt(req.query.limit) || 50, 200);
  try {
    const result = await pool.query(
      `SELECT r.runner_id, r.name, r.surname, r.gender, r.province,
              COUNT(rr.id)        AS total_races,
              MAX(rr.time_seconds) AS first_time_seconds,
              MIN(rr.time_seconds) AS best_time_seconds,
              (MAX(rr.time_seconds) - MIN(rr.time_seconds)) AS improvement_seconds,
              (SELECT time_raw FROM race_results
               WHERE runner_id = r.runner_id AND distance = $1
               ORDER BY time_seconds DESC LIMIT 1) AS first_time_raw,
              (SELECT time_raw FROM race_results
               WHERE runner_id = r.runner_id AND distance = $1
               ORDER BY time_seconds ASC LIMIT 1) AS best_time_raw
       FROM runners r
       JOIN race_results rr ON rr.runner_id = r.runner_id AND rr.distance = $1
       GROUP BY r.runner_id, r.name, r.surname, r.gender, r.province
       HAVING COUNT(rr.id) >= 2
       ORDER BY improvement_seconds DESC
       LIMIT $2`,
      [distance, limit]
    );
    res.json({ distance, ranking: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener ranking de progresión' });
  }
}

module.exports = { historicalRanking, loyalRunners, progressionRanking };
