const router = require("express").Router();
const { pool } = require("../db/pool");
const { authMiddleware, adminOnly } = require("../middleware/auth");
const logger = require("../utils/logger");

// POST /api/egresos
router.post("/", async (req, res, next) => {
  try {
    const {
      barbero_id, concepto, salio_de_caja = true,
      monto, asignado_a = null, fecha, hora, notas = null, offline_id = null,
    } = req.body;

    if (!barbero_id || !concepto || monto == null) {
      return res.status(400).json({ error: "barbero_id, concepto y monto son requeridos" });
    }

    // Deduplicación offline
    if (offline_id) {
      const dup = await pool.query("SELECT id FROM egresos WHERE offline_id=$1", [offline_id]);
      if (dup.rows.length) {
        logger.info(`Egreso duplicado ignorado: offline_id=${offline_id}`);
        return res.status(200).json({ id: dup.rows[0].id, duplicado: true });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO egresos (barbero_id, concepto, salio_de_caja, monto, asignado_a, fecha, hora, notas, offline_id, sincronizado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE) RETURNING id`,
      [barbero_id, concepto, salio_de_caja, monto, asignado_a,
       fecha || null, hora || null, notas, offline_id || null]
    );

    logger.info(`Egreso registrado: id=${rows[0].id}, barbero=${barbero_id}, monto=${monto}`);
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    next(err);
  }
});

// GET /api/egresos/dia/:barberoId — egresos del día para el barbero
router.get("/dia/:barberoId", async (req, res, next) => {
  try {
    const { barberoId } = req.params;
    const { fecha } = req.query;
    const hoy = new Date();
    const localFecha = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
    const diaFecha = fecha || localFecha;

    const { rows } = await pool.query(
      `SELECT e.id, e.hora, e.concepto, e.monto, e.salio_de_caja, e.notas,
              u.nombre_corto AS asignado_nombre
       FROM egresos e
       LEFT JOIN usuarios u ON u.id = e.asignado_a
       WHERE e.barbero_id=$1 AND e.fecha=$2
       ORDER BY e.hora, e.id`,
      [barberoId, diaFecha]
    );

    const total = rows.reduce((acc, r) => acc + parseFloat(r.monto), 0);
    res.json({ fecha: diaFecha, egresos: rows, total });
  } catch (err) {
    next(err);
  }
});

// GET /api/egresos — admin con filtros
router.get("/", authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { desde, hasta, barbero_id } = req.query;
    let q = `
      SELECT e.*, u.nombre_corto AS barbero, ua.nombre_corto AS asignado_nombre
      FROM egresos e
      JOIN usuarios u ON u.id = e.barbero_id
      LEFT JOIN usuarios ua ON ua.id = e.asignado_a
      WHERE 1=1`;
    const params = [];
    if (desde)      { params.push(desde);      q += ` AND e.fecha >= $${params.length}`; }
    if (hasta)      { params.push(hasta);      q += ` AND e.fecha <= $${params.length}`; }
    if (barbero_id) { params.push(barbero_id); q += ` AND e.barbero_id = $${params.length}`; }
    q += " ORDER BY e.fecha DESC, e.hora DESC";

    const { rows } = await pool.query(q, params);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
