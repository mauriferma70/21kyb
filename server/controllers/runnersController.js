// server/controllers/runnersController.js
const pool = require('../db');
const { secondsToTime } = require('../helpers');

// GET /api/runner/:runner_id — Perfil público
async function getRunner(req, res) {
  const { runner_id } = req.params;
  try {
    // Datos básicos del corredor (sin DNI)
    const runnerQ = await pool.query(
      `SELECT runner_id, name, surname, gender, province, nationality
       FROM runners WHERE runner_id = $1`,
      [runner_id.toUpperCase()]
    );
    if (runnerQ.rows.length === 0) {
      return res.status(404).json({ error: 'Corredor no encontrado' });
    }
    const runner = runnerQ.rows[0];

    // Historial de resultados
    const resultsQ = await pool.query(
      `SELECT year, distance, category, time_raw, time_seconds,
              position_general, position_category
       FROM race_results
       WHERE runner_id = $1
       ORDER BY year DESC`,
      [runner_id.toUpperCase()]
    );

    // Estadísticas calculadas por distancia
    const stats21k = calcStats(resultsQ.rows.filter(r => r.distance === '21K'));
    const stats10k = calcStats(resultsQ.rows.filter(r => r.distance === '10K'));
    const stats5k  = calcStats(resultsQ.rows.filter(r => r.distance === '5K'));

    res.json({
      runner,
      results: resultsQ.rows,
      stats: {
        total_races: resultsQ.rows.length,
        '21K': stats21k,
        '10K': stats10k,
        '5K':  stats5k,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

function calcStats(rows) {
  if (!rows.length) return null;
  const times   = rows.map(r => r.time_seconds).filter(Boolean);
  const bestTime = times.length ? Math.min(...times) : null;
  const avgTime  = times.length ? Math.round(times.reduce((a,b) => a+b, 0) / times.length) : null;
  const positions = rows.map(r => r.position_general).filter(Boolean);
  const bestPos   = positions.length ? Math.min(...positions) : null;

  // Mejora: diferencia entre primer tiempo y mejor tiempo
  const firstTime = rows.length > 1 ? rows[rows.length - 1].time_seconds : null;
  const improvement = firstTime && bestTime ? firstTime - bestTime : null;

  return {
    races: rows.length,
    best_time: bestTime ? secondsToTime(bestTime) : null,
    best_time_seconds: bestTime,
    avg_time: avgTime ? secondsToTime(avgTime) : null,
    best_position: bestPos,
    improvement_seconds: improvement,
    improvement_formatted: improvement ? secondsToTime(improvement) : null,
  };
}

// POST /api/search-runner — Búsqueda pública por nombre
async function searchRunner(req, res) {
  const { q } = req.body;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Ingresá al menos 2 caracteres' });
  }
  try {
    const result = await pool.query(
      `SELECT runner_id, name, surname, gender, province,
              (SELECT COUNT(*) FROM race_results rr WHERE rr.runner_id = r.runner_id) AS total_races
       FROM runners r
       WHERE LOWER(UNACCENT(name || ' ' || surname)) LIKE LOWER(UNACCENT($1))
          OR LOWER(UNACCENT(surname || ' ' || name)) LIKE LOWER(UNACCENT($1))
          OR LOWER(UNACCENT(name)) LIKE LOWER(UNACCENT($1))
          OR LOWER(UNACCENT(surname)) LIKE LOWER(UNACCENT($1))
       ORDER BY surname, name
       LIMIT 20`,
      [`%${q.trim()}%`]
    );
    res.json({ results: result.rows });
  } catch (err) {
    // Fallback sin UNACCENT si no está instalada la extensión
    try {
      const result = await pool.query(
        `SELECT runner_id, name, surname, gender, province,
                (SELECT COUNT(*) FROM race_results rr WHERE rr.runner_id = r.runner_id) AS total_races
         FROM runners r
         WHERE LOWER(name || ' ' || surname) LIKE LOWER($1)
            OR LOWER(surname || ' ' || name) LIKE LOWER($1)
            OR LOWER(name) LIKE LOWER($1)
            OR LOWER(surname) LIKE LOWER($1)
         ORDER BY surname, name
         LIMIT 20`,
        [`%${q.trim()}%`]
      );
      res.json({ results: result.rows });
    } catch (err2) {
      console.error(err2);
      res.status(500).json({ error: 'Error en la búsqueda' });
    }
  }
}

module.exports = { getRunner, searchRunner };
