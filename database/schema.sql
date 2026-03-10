-- ============================================================
-- 21K YERBA BUENA — Schema de base de datos
-- PostgreSQL
-- ============================================================

-- Extensión para UUIDs (opcional)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tabla de corredores ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS runners (
  id           SERIAL PRIMARY KEY,
  runner_id    VARCHAR(10)  UNIQUE NOT NULL,  -- RB000001 (público)
  dni          VARCHAR(15)  UNIQUE,           -- solo uso interno, nunca público
  name         VARCHAR(100) NOT NULL,
  surname      VARCHAR(100) NOT NULL,
  gender       CHAR(1)      CHECK (gender IN ('M','F')),
  birth_date   DATE,
  province     VARCHAR(100),
  nationality  VARCHAR(100) DEFAULT 'Argentino/a',
  created_at   TIMESTAMP    DEFAULT NOW(),
  updated_at   TIMESTAMP    DEFAULT NOW()
);

-- ── Tabla de resultados de carrera ──────────────────────────
CREATE TABLE IF NOT EXISTS race_results (
  id           SERIAL PRIMARY KEY,
  runner_id    VARCHAR(10)  NOT NULL REFERENCES runners(runner_id) ON DELETE CASCADE,
  year         SMALLINT     NOT NULL,
  distance     VARCHAR(5)   NOT NULL CHECK (distance IN ('5K','10K','21K')),
  category     VARCHAR(10),                   -- M35, F40, General, etc.
  time_raw     VARCHAR(10)  NOT NULL,         -- H:MM:SS como texto
  time_seconds INTEGER      NOT NULL,         -- segundos totales para cálculos
  position_general  INTEGER,
  position_category INTEGER,
  created_at   TIMESTAMP    DEFAULT NOW(),
  UNIQUE (runner_id, year, distance)          -- un corredor, una distancia, por año
);

-- ── Tabla de sesiones de admin ───────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id           SERIAL PRIMARY KEY,
  username     VARCHAR(50)  UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  created_at   TIMESTAMP   DEFAULT NOW()
);

-- ── Tabla de posibles duplicados pendientes ──────────────────
CREATE TABLE IF NOT EXISTS duplicate_flags (
  id           SERIAL PRIMARY KEY,
  runner_id_a  VARCHAR(10) NOT NULL,
  runner_id_b  VARCHAR(10),
  name_a       VARCHAR(200),
  name_b       VARCHAR(200),
  reason       TEXT,
  status       VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','merged','distinct')),
  created_at   TIMESTAMP   DEFAULT NOW(),
  resolved_at  TIMESTAMP
);

-- ── Índices para performance ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_runners_name        ON runners (LOWER(name), LOWER(surname));
CREATE INDEX IF NOT EXISTS idx_runners_runner_id   ON runners (runner_id);
CREATE INDEX IF NOT EXISTS idx_results_runner      ON race_results (runner_id);
CREATE INDEX IF NOT EXISTS idx_results_year        ON race_results (year);
CREATE INDEX IF NOT EXISTS idx_results_distance    ON race_results (distance);
CREATE INDEX IF NOT EXISTS idx_results_time        ON race_results (time_seconds);
CREATE INDEX IF NOT EXISTS idx_dup_status          ON duplicate_flags (status);

-- ── Función para actualizar updated_at automáticamente ───────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER runners_updated_at
  BEFORE UPDATE ON runners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Secuencia para runner_id (RB000001, RB000002...) ─────────
CREATE SEQUENCE IF NOT EXISTS runner_id_seq START 1;

-- ============================================================
-- FIN DEL SCHEMA
-- Base de datos iniciada en 0. Sin datos de prueba.
-- ============================================================
