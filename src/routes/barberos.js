const router = require("express").Router();
const { pool } = require("../db/pool");
const { authMiddleware, adminOnly } = require("../middleware/auth");
const logger = require("../utils/logger");

// GET /api/barberos — público, filtra por activo
router.get("/", async (req, res, next) => {
  try {
    const { activo } = req.query;
    let q = "SELECT id, nombre_corto, nombres, apellidos, tipo_documento, nro_documento, activo, es_admin FROM usuarios WHERE es_barbero = TRUE";
    const params = [];
    if (activo !== undefined) {
      params.push(activo === "true");
      q += ` AND activo = $${params.length}`;
    }
    q += " ORDER BY nombre_corto";
    const { rows } = await pool.query(q, params);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/barberos/asignables — público, retorna barberos Y admins activos para "Asignado a"
router.get("/asignables", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre_corto, es_barbero, es_admin
       FROM usuarios
       WHERE activo = TRUE AND (es_barbero = TRUE OR es_admin = TRUE)
       ORDER BY es_admin DESC, nombre_corto`
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/barberos/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, nombre_corto, nombres, apellidos, tipo_documento, nro_documento, activo FROM usuarios WHERE id = $1 AND es_barbero = TRUE",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Barbero no encontrado" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/barberos — admin only
router.post("/", authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { tipo_documento = "DNI", nro_documento, nombres, apellidos, nombre_corto } = req.body;
    if (!nro_documento || !nombres || !apellidos || !nombre_corto) {
      return res.status(400).json({ error: "Campos requeridos: nro_documento, nombres, apellidos, nombre_corto" });
    }
    const { rows } = await pool.query(
      `INSERT INTO usuarios (tipo_documento, nro_documento, nombres, apellidos, nombre_corto, es_barbero, activo)
       VALUES ($1,$2,$3,$4,$5,TRUE,TRUE) RETURNING id, nombre_corto, nombres, apellidos, activo`,
      [tipo_documento, nro_documento, nombres, apellidos, nombre_corto.toUpperCase()]
    );
    logger.info(`Barbero creado: ${rows[0].nombre_corto}`);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/barberos/:id — admin only
router.put("/:id", authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { tipo_documento, nro_documento, nombres, apellidos, nombre_corto, activo } = req.body;
    const { rows } = await pool.query(
      `UPDATE usuarios SET
         tipo_documento = COALESCE($1, tipo_documento),
         nro_documento  = COALESCE($2, nro_documento),
         nombres        = COALESCE($3, nombres),
         apellidos      = COALESCE($4, apellidos),
         nombre_corto   = COALESCE($5, nombre_corto),
         activo         = COALESCE($6, activo)
       WHERE id = $7 AND es_barbero = TRUE
       RETURNING id, nombre_corto, nombres, apellidos, activo`,
      [tipo_documento, nro_documento, nombres, apellidos, nombre_corto, activo, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Barbero no encontrado" });
    logger.info(`Barbero actualizado: id=${req.params.id}`);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
