// server/controllers/adminController.js
const pool    = require('../db');
const bcrypt  = require('bcryptjs');
const xlsx    = require('xlsx');
const fs      = require('fs');
const {
  timeToSeconds, generateRunnerId,
  normalizeName, normalizeDni, namesMatch
} = require('../helpers');

// ── AUTH ─────────────────────────────────────────────────────

async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD;

  if (!adminPass) {
    console.error('ADMIN_PASSWORD no está configurada como variable de entorno');
    return res.status(500).json({ error: 'Error de configuración del servidor' });
  }

  if (username !== adminUser || password !== adminPass) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  req.session.adminLoggedIn = true;
  req.session.adminUser = username;
  res.json({ ok: true, username });
}

function logout(req, res) {
  req.session.destroy();
  res.json({ ok: true });
}

function sessionStatus(req, res) {
  if (req.session && req.session.adminLoggedIn) {
    res.json({ loggedIn: true, username: req.session.adminUser });
  } else {
    res.json({ loggedIn: false });
  }
}

// ── DASHBOARD ────────────────────────────────────────────────

async function getDashboard(req, res) {
  try {
    const [runners, results, editions, dupes] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM runners'),
      pool.query('SELECT COUNT(*) FROM race_results'),
      pool.query('SELECT COUNT(DISTINCT year) FROM race_results'),
      pool.query("SELECT COUNT(*) FROM duplicate_flags WHERE status = 'pending'"),
    ]);

    // Últimas ediciones
    const lastEditions = await pool.query(
      `SELECT year,
              STRING_AGG(DISTINCT distance, ', ' ORDER BY distance) AS distances,
              COUNT(*) AS total_results,
              MAX(created_at) AS loaded_at
       FROM race_results
       GROUP BY year
       ORDER BY year DESC
       LIMIT 5`
    );

    res.json({
      stats: {
        runners:    parseInt(runners.rows[0].count),
        results:    parseInt(results.rows[0].count),
        editions:   parseInt(editions.rows[0].count),
        duplicates: parseInt(dupes.rows[0].count),
      },
      last_editions: lastEditions.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar dashboard' });
  }
}

// ── CORREDORES ───────────────────────────────────────────────

async function getRunners(req, res) {
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const q     = req.query.q || '';
  const offset = (page - 1) * limit;

  try {
    const qNorm = q.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents in JS for $3 matching

    const whereClause = q
      ? `WHERE unaccent(LOWER(r.name || ' ' || r.surname)) LIKE unaccent(LOWER($3))
            OR unaccent(LOWER(r.surname || ' ' || r.name)) LIKE unaccent(LOWER($3))
            OR r.runner_id ILIKE $3
            OR r.dni LIKE $3`
      : '';
    // Fallback if unaccent is not installed
    const whereClauseFallback = q
      ? `WHERE LOWER(r.name || ' ' || r.surname) LIKE LOWER($3)
            OR LOWER(r.surname || ' ' || r.name) LIKE LOWER($3)
            OR r.runner_id ILIKE $3
            OR r.dni LIKE $3`
      : '';

    const params = q
      ? [limit, offset, `%${qNorm}%`]
      : [limit, offset];

    const whereCount = q 
      ? `WHERE LOWER(r.name || ' ' || r.surname) LIKE LOWER($1)
            OR LOWER(r.surname || ' ' || r.name) LIKE LOWER($1)
            OR r.runner_id ILIKE $1
            OR r.dni LIKE $1`
      : '';

    let data, total;
    try {
      [data, total] = await Promise.all([
        pool.query(
          `SELECT r.runner_id, r.name, r.surname, r.gender, r.province, r.dni,
                  COUNT(rr.id) AS total_races,
                  MIN(rr.time_seconds) AS best_time_seconds
           FROM runners r
           LEFT JOIN race_results rr ON rr.runner_id = r.runner_id
           ${whereClause}
           GROUP BY r.runner_id, r.name, r.surname, r.gender, r.province, r.dni
           ORDER BY r.surname, r.name
           LIMIT $1 OFFSET $2`,
          params
        ),
        pool.query(`SELECT COUNT(*) FROM runners r ${whereCount}`, q ? [`%${qNorm}%`] : [])
      ]);
    } catch (e) {
      // Fallback without unaccent
      [data, total] = await Promise.all([
        pool.query(
          `SELECT r.runner_id, r.name, r.surname, r.gender, r.province, r.dni,
                  COUNT(rr.id) AS total_races,
                  MIN(rr.time_seconds) AS best_time_seconds
           FROM runners r
           LEFT JOIN race_results rr ON rr.runner_id = r.runner_id
           ${whereClauseFallback}
           GROUP BY r.runner_id, r.name, r.surname, r.gender, r.province, r.dni
           ORDER BY r.surname, r.name
           LIMIT $1 OFFSET $2`,
          params
        ),
        pool.query(`SELECT COUNT(*) FROM runners r ${whereCount}`, q ? [`%${qNorm}%`] : [])
      ]);
    }

    res.json({
      runners: data.rows,
      total: parseInt(total.rows[0].count),
      page,
      pages: Math.ceil(parseInt(total.rows[0].count) / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener corredores' });
  }
}

async function addRunner(req, res) {
  const { name, surname, dni, gender, province, nationality, birth_date,
          year, distance, category, time_raw, position_general, position_category } = req.body;

  if (!name || !surname || !gender)
    return res.status(400).json({ error: 'Nombre, apellido y sexo son obligatorios' });
  if (!year || !distance || !time_raw)
    return res.status(400).json({ error: 'Año, distancia y tiempo son obligatorios' });

  const cleanName    = normalizeName(name);
  const cleanSurname = normalizeName(surname);
  const cleanDni     = normalizeDni(dni);
  const seconds      = timeToSeconds(time_raw);

  if (!seconds)
    return res.status(400).json({ error: 'Formato de tiempo inválido. Usá H:MM:SS' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar DNI duplicado
    if (cleanDni) {
      const dniCheck = await client.query(
        'SELECT runner_id FROM runners WHERE dni = $1', [cleanDni]
      );
      if (dniCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'DNI ya registrado',
          existing_runner_id: dniCheck.rows[0].runner_id
        });
      }
    }

    // Verificar nombre duplicado
    const nameCheck = await client.query(
      `SELECT runner_id FROM runners
       WHERE LOWER(name) = LOWER($1) AND LOWER(surname) = LOWER($2)`,
      [cleanName, cleanSurname]
    );
    if (nameCheck.rows.length > 0 && !req.body.force_create) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Posible duplicado por nombre',
        existing_runner_id: nameCheck.rows[0].runner_id,
        message: 'Ya existe un corredor con ese nombre. Si son distintas personas, enviá force_create: true'
      });
    }

    // Generar runner_id
    const lastId = await client.query(
      `SELECT runner_id FROM runners ORDER BY runner_id DESC LIMIT 1`
    );
    const lastNum = lastId.rows.length
      ? parseInt(lastId.rows[0].runner_id.replace('RB', ''))
      : 0;
    const newRunnerId = generateRunnerId(lastNum);

    // Insertar corredor
    await client.query(
      `INSERT INTO runners (runner_id, dni, name, surname, gender, province, nationality, birth_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newRunnerId, cleanDni, cleanName, cleanSurname, gender,
       province || null, nationality || 'Argentino/a',
       birth_date || null]
    );

    // Insertar resultado
    await client.query(
      `INSERT INTO race_results
         (runner_id, year, distance, category, time_raw, time_seconds, position_general, position_category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newRunnerId, parseInt(year), distance, category || null,
       time_raw, seconds,
       position_general ? parseInt(position_general) : null,
       position_category ? parseInt(position_category) : null]
    );

    await client.query('COMMIT');
    res.status(201).json({
      ok: true,
      runner_id: newRunnerId,
      message: `Corredor registrado como ${newRunnerId}`
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR EN ADDRUNNER SQL:', err);
    res.status(500).json({ error: 'Error al registrar corredor: ' + err.message });
  } finally {
    client.release();
  }
}

async function updateRunner(req, res) {
  const { runner_id } = req.params;
  const { name, surname, gender, province, nationality } = req.body;
  try {
    await pool.query(
      `UPDATE runners SET name=$1, surname=$2, gender=$3, province=$4, nationality=$5
       WHERE runner_id=$6`,
      [normalizeName(name), normalizeName(surname), gender,
       province, nationality, runner_id.toUpperCase()]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar corredor' });
  }
}

async function deleteRunner(req, res) {
  const { runner_id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Eliminar resultados asociados (o por Foreign Key CASCADE si existe, pero lo hacemos manual por si acaso)
    await client.query('DELETE FROM race_results WHERE runner_id = $1', [runner_id.toUpperCase()]);
    
    // 2. Eliminar al corredor
    const result = await client.query('DELETE FROM runners WHERE runner_id = $1', [runner_id.toUpperCase()]);
    
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Corredor no encontrado' });
    }

    await client.query('COMMIT');
    res.json({ ok: true, message: 'Corredor y sus resultados eliminados correctamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar corredor:', err);
    res.status(500).json({ error: 'Error al eliminar el corredor' });
  } finally {
    client.release();
  }
}

// ── RESULTADOS ───────────────────────────────────────────────

async function getResults(req, res) {
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;
  const year = req.query.year || null;
  const dist = req.query.distance || null;

  try {
    const conditions = [];
    const params = [limit, offset];
    if (year) { conditions.push(`rr.year = $${params.push(parseInt(year))}`); }
    if (dist) { conditions.push(`rr.distance = $${params.push(dist)}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const data = await pool.query(
      `SELECT rr.id, rr.runner_id, r.name, r.surname,
              rr.year, rr.distance, rr.category,
              rr.time_raw, rr.position_general, rr.position_category
       FROM race_results rr
       JOIN runners r ON r.runner_id = rr.runner_id
       ${where}
       ORDER BY rr.year DESC, rr.time_seconds ASC
       LIMIT $1 OFFSET $2`,
      params
    );

    const countParams = conditions.length
      ? params.slice(2)
      : [];
    const total = await pool.query(
      `SELECT COUNT(*) FROM race_results rr ${where}`, countParams
    );

    res.json({
      results: data.rows,
      total: parseInt(total.rows[0].count),
      page,
      pages: Math.ceil(parseInt(total.rows[0].count) / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener resultados' });
  }
}

async function addResult(req, res) {
  const { runner_id, year, distance, category, time_raw, position_general, position_category } = req.body;
  if (!runner_id || !year || !distance || !time_raw)
    return res.status(400).json({ error: 'runner_id, año, distancia y tiempo son obligatorios' });

  const seconds = timeToSeconds(time_raw);
  if (!seconds) return res.status(400).json({ error: 'Formato de tiempo inválido' });

  try {
    // Verificar que el corredor existe
    const runnerCheck = await pool.query('SELECT runner_id FROM runners WHERE runner_id = $1', [runner_id.toUpperCase()]);
    if (runnerCheck.rows.length === 0)
      return res.status(404).json({ error: 'Corredor no encontrado' });

    await pool.query(
      `INSERT INTO race_results
         (runner_id, year, distance, category, time_raw, time_seconds, position_general, position_category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (runner_id, year, distance) DO UPDATE SET
         category = EXCLUDED.category,
         time_raw = EXCLUDED.time_raw,
         time_seconds = EXCLUDED.time_seconds,
         position_general = EXCLUDED.position_general,
         position_category = EXCLUDED.position_category`,
      [runner_id.toUpperCase(), parseInt(year), distance, category || null,
       time_raw, seconds,
       position_general ? parseInt(position_general) : null,
       position_category ? parseInt(position_category) : null]
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar resultado' });
  }
}

async function updateResult(req, res) {
  const { id } = req.params;
  const { time_raw, position_general, position_category, category } = req.body;
  const seconds = timeToSeconds(time_raw);
  try {
    await pool.query(
      `UPDATE race_results SET time_raw=$1, time_seconds=$2,
         position_general=$3, position_category=$4, category=$5
       WHERE id=$6`,
      [time_raw, seconds,
       position_general ? parseInt(position_general) : null,
       position_category ? parseInt(position_category) : null,
       category || null, parseInt(id)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar resultado' });
  }
}

// ── IMPORTACIÓN DE EXCEL ─────────────────────────────────────

async function importExcel(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  const { year, distance } = req.body;
  if (!year || !distance) return res.status(400).json({ error: 'Año y distancia requeridos' });

  const log = [];
  let inserted = 0, skipped = 0, newRunners = 0, duplicateFlags = 0;

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    log.push({ type: 'ok', msg: `Archivo leído: ${rows.length} filas` });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const row of rows) {
        // Mapeo flexible de columnas (admite variantes de nombres)
        const name    = normalizeName(row['Nombre'] || row['nombre'] || row['NOMBRE'] || '');
        const surname = normalizeName(row['Apellido'] || row['apellido'] || row['APELLIDO'] || '');
        const dniRaw  = row['DNI'] || row['dni'] || row['Dni'] || '';
        const timeRaw = String(row['Tiempo'] || row['tiempo'] || row['TIEMPO'] || '');
        const posGen  = parseInt(row['Posicion'] || row['Posición'] || row['posicion'] || row['POS'] || 0);
        const cat     = row['Categoria'] || row['Categoría'] || row['categoria'] || '';
        const poscat  = parseInt(row['PosCategoria'] || row['PosCat'] || 0);
        const gender  = row['Sexo'] || row['sexo'] || row['SEXO'] || '';

        if (!name || !surname || !timeRaw) {
          log.push({ type: 'warn', msg: `Fila incompleta saltada: ${name} ${surname}` });
          skipped++;
          continue;
        }

        const cleanDni  = normalizeDni(dniRaw);
        const seconds   = timeToSeconds(timeRaw);
        if (!seconds) {
          log.push({ type: 'warn', msg: `Tiempo inválido para ${name} ${surname}: "${timeRaw}"` });
          skipped++;
          continue;
        }

        // Buscar corredor existente
        let runnerId = null;

        if (cleanDni) {
          const byDni = await client.query('SELECT runner_id FROM runners WHERE dni = $1', [cleanDni]);
          if (byDni.rows.length) runnerId = byDni.rows[0].runner_id;
        }

        if (!runnerId) {
          const byName = await client.query(
            `SELECT runner_id FROM runners
             WHERE LOWER(name)=$1 AND LOWER(surname)=$2`,
            [name.toLowerCase(), surname.toLowerCase()]
          );
          if (byName.rows.length) runnerId = byName.rows[0].runner_id;
        }

        // Crear nuevo corredor si no existe
        if (!runnerId) {
          const lastId = await client.query(
            `SELECT runner_id FROM runners ORDER BY runner_id DESC LIMIT 1`
          );
          const lastNum = lastId.rows.length
            ? parseInt(lastId.rows[0].runner_id.replace('RB', ''))
            : 0;
          runnerId = generateRunnerId(lastNum);

          await client.query(
            `INSERT INTO runners (runner_id, dni, name, surname, gender)
             VALUES ($1, $2, $3, $4, $5)`,
            [runnerId, cleanDni, name, surname, gender || null]
          );
          newRunners++;
          log.push({ type: 'ok', msg: `Nuevo corredor: ${name} ${surname} → ${runnerId}` });
        }

        // Insertar resultado
        await client.query(
          `INSERT INTO race_results
             (runner_id, year, distance, category, time_raw, time_seconds, position_general, position_category)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (runner_id, year, distance) DO UPDATE SET
             time_raw=EXCLUDED.time_raw, time_seconds=EXCLUDED.time_seconds,
             position_general=EXCLUDED.position_general, category=EXCLUDED.category`,
          [runnerId, parseInt(year), distance, cat || null,
           timeRaw, seconds, posGen || null, poscat || null]
        );
        inserted++;
      }

      await client.query('COMMIT');
      log.push({ type: 'ok', msg: `✓ Importación completada: ${inserted} resultados, ${newRunners} nuevos corredores` });

    } catch (err) {
      await client.query('ROLLBACK');
      log.push({ type: 'error', msg: 'Error durante la importación: ' + err.message });
      throw err;
    } finally {
      client.release();
      fs.unlinkSync(req.file.path); // limpiar archivo temp
    }

    res.json({ ok: true, inserted, skipped, newRunners, duplicateFlags, log });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar Excel', log });
  }
}

// ── DUPLICADOS ───────────────────────────────────────────────

async function getDuplicates(req, res) {
  try {
    const result = await pool.query(
      `SELECT df.*, 
              ra.name AS name_a_full, ra.surname AS sur_a,
              rb.name AS name_b_full, rb.surname AS sur_b
       FROM duplicate_flags df
       LEFT JOIN runners ra ON ra.runner_id = df.runner_id_a
       LEFT JOIN runners rb ON rb.runner_id = df.runner_id_b
       WHERE df.status = 'pending'
       ORDER BY df.created_at DESC`
    );
    res.json({ duplicates: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener duplicados' });
  }
}

async function resolveDuplicate(req, res) {
  const { id } = req.params;
  const { action } = req.body; // 'merged' | 'distinct'
  if (!['merged','distinct'].includes(action))
    return res.status(400).json({ error: 'Acción inválida' });
  try {
    await pool.query(
      `UPDATE duplicate_flags SET status=$1, resolved_at=NOW() WHERE id=$2`,
      [action, parseInt(id)]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al resolver duplicado' });
  }
}

module.exports = {
  login, logout, sessionStatus,
  getDashboard,
  getRunners, addRunner, updateRunner, deleteRunner,
  getResults, addResult, updateResult,
  importExcel,
  getDuplicates, resolveDuplicate,
};
