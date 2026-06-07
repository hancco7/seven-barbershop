require("dotenv").config();
const { pool } = require("./pool");

const SQL = `
-- ── Extensión UUID ──────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USUARIOS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id             SERIAL PRIMARY KEY,
  tipo_documento VARCHAR(10)  NOT NULL DEFAULT 'DNI',
  nro_documento  VARCHAR(15)  NOT NULL,
  nombres        VARCHAR(100) NOT NULL,
  apellidos      VARCHAR(100) NOT NULL,
  nombre_corto   VARCHAR(30)  NOT NULL,
  email          VARCHAR(120) UNIQUE,
  password_hash  VARCHAR(255),
  es_admin       BOOLEAN      NOT NULL DEFAULT FALSE,
  es_barbero     BOOLEAN      NOT NULL DEFAULT FALSE,
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── CLIENTES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id               SERIAL PRIMARY KEY,
  tipo_documento   VARCHAR(10)  NOT NULL DEFAULT 'DNI',
  nro_documento    VARCHAR(15)  NOT NULL UNIQUE,
  nombres          VARCHAR(100) NOT NULL,
  apellidos        VARCHAR(100) NOT NULL DEFAULT '',
  fecha_nacimiento DATE,
  nro_celular      VARCHAR(15),
  es_generico      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── SERVICIOS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS servicios (
  id           SERIAL PRIMARY KEY,
  categoria    VARCHAR(80)  NOT NULL,
  subcategoria VARCHAR(80)  NOT NULL,
  nombre       VARCHAR(120) NOT NULL,
  precio       DECIMAL(8,2) NOT NULL DEFAULT 0,
  activo       BOOLEAN      NOT NULL DEFAULT TRUE,
  es_favorito  BOOLEAN      NOT NULL DEFAULT FALSE
);

-- ── PRODUCTOS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productos (
  id           SERIAL PRIMARY KEY,
  categoria    VARCHAR(80)  NOT NULL,
  subcategoria VARCHAR(80)  NOT NULL,
  nombre       VARCHAR(120) NOT NULL,
  precio_venta DECIMAL(8,2) NOT NULL DEFAULT 0,
  costo        DECIMAL(8,2),
  activo       BOOLEAN      NOT NULL DEFAULT TRUE,
  es_favorito  BOOLEAN      NOT NULL DEFAULT FALSE
);

-- ── VENTAS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ventas (
  id             SERIAL PRIMARY KEY,
  barbero_id     INT          NOT NULL REFERENCES usuarios(id),
  cliente_id     INT          NOT NULL REFERENCES clientes(id),
  registrado_por INT          REFERENCES usuarios(id),
  es_manual      BOOLEAN      NOT NULL DEFAULT FALSE,
  fecha          DATE         NOT NULL DEFAULT CURRENT_DATE,
  hora           TIME,
  total          DECIMAL(10,2) NOT NULL DEFAULT 0,
  offline_id     UUID         UNIQUE,
  sincronizado   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── DETALLE_VENTA (items_venta) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS detalle_venta (
  id              SERIAL PRIMARY KEY,
  venta_id        INT          NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  tipo            VARCHAR(3)   NOT NULL CHECK (tipo IN ('S','P','TIP')),
  item_id         INT,
  nombre_item     VARCHAR(120) NOT NULL,
  precio_cobrado  DECIMAL(8,2) NOT NULL,
  precio_original DECIMAL(8,2)
);

-- ── PAGOS_VENTA ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pagos_venta (
  id       SERIAL PRIMARY KEY,
  venta_id INT          NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  metodo   VARCHAR(20)  NOT NULL CHECK (metodo IN ('EFECTIVO','TARJETA','YAPE','PLIN')),
  monto    DECIMAL(10,2) NOT NULL DEFAULT 0
);

-- ── EGRESOS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS egresos (
  id            SERIAL PRIMARY KEY,
  barbero_id    INT          NOT NULL REFERENCES usuarios(id),
  concepto      VARCHAR(50)  NOT NULL,
  salio_de_caja BOOLEAN      NOT NULL DEFAULT TRUE,
  monto         DECIMAL(10,2) NOT NULL,
  asignado_a    INT          REFERENCES usuarios(id),
  fecha         DATE         NOT NULL DEFAULT CURRENT_DATE,
  hora          TIME,
  notas         TEXT,
  offline_id    UUID         UNIQUE,
  sincronizado  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── SYNC_QUEUE ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_queue (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         VARCHAR(20)  NOT NULL,
  payload      JSONB        NOT NULL,
  barbero_id   INT          REFERENCES usuarios(id),
  creado_en    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  intentos     INT          NOT NULL DEFAULT 0,
  sincronizado BOOLEAN      NOT NULL DEFAULT FALSE
);

-- ── ÍNDICES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ventas_barbero_fecha   ON ventas(barbero_id, fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha           ON ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_ventas_offline_id      ON ventas(offline_id);
CREATE INDEX IF NOT EXISTS idx_detalle_venta_id       ON detalle_venta(venta_id);
CREATE INDEX IF NOT EXISTS idx_pagos_venta_id         ON pagos_venta(venta_id);
CREATE INDEX IF NOT EXISTS idx_egresos_barbero_fecha  ON egresos(barbero_id, fecha);
CREATE INDEX IF NOT EXISTS idx_egresos_offline_id     ON egresos(offline_id);
CREATE INDEX IF NOT EXISTS idx_clientes_nro_doc       ON clientes(nro_documento);
CREATE INDEX IF NOT EXISTS idx_clientes_nombres       ON clientes(nombres, apellidos);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo        ON usuarios(es_barbero, activo);
`;

async function migrate() {
  console.log("🔄  Running migrations…");
  try {
    await pool.query(SQL);
    console.log("✅  Migrations completed successfully.");
  } catch (err) {
    console.error("❌  Migration failed:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
