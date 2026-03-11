// init-db.js — Script opcional para popular la base de datos si está vacía
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false
});

async function run() {
  console.log('Verificando inicialización de la base de datos...');
  try {
    const res = await pool.query("SELECT to_regclass('public.runners')");
    if (res.rows[0].to_regclass === null) {
      console.log('Tablas no encontradas. Ejecutando schema.sql...');
      const schemaPath = path.join(__dirname, 'database', 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schemaSql);
      console.log('✅ Base de datos inicializada correctamente con schema.sql');
    } else {
      console.log('✅ Las tablas ya existen. Saltando inicialización.');
    }
  } catch (err) {
    console.error('❌ Error inicializando DB:', err);
  } finally {
    pool.end();
  }
}

run();
