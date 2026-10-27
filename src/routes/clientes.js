const router = require("express").Router();
const { pool } = require("../db/pool");

// GET /api/clientes/generico — cliente genérico para ventas sin nombre
router.get("/generico", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM clientes WHERE es_generico = TRUE LIMIT 1"
    );
    if (!rows.length) return res.status(404).json({ error: "Cliente genérico no encontrado — ejecuta seed" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/clientes?q=texto — búsqueda por nombre o documento
router.get("/", async (req, res, next) => {
  try {
    const { q = "" } = req.query;
    const search = `%${q.trim()}%`;
    const { rows } = await pool.query(
      `SELECT * FROM clientes
       WHERE es_generico = FALSE
         AND (nombres ILIKE $1 OR apellidos ILIKE $1 OR nro_documento ILIKE $1)
       ORDER BY nombres, apellidos
       LIMIT 50`,
      [search]
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/clientes/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM clientes WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Cliente no encontrado" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/clientes — crear nuevo cliente real
router.post("/", async (req, res, next) => {
  try {
    const { tipo_documento = "DNI", nro_documento, nombres, apellidos = "", fecha_nacimiento, nro_celular } = req.body;
    if (!nro_documento || !nombres) {
      return res.status(400).json({ error: "nro_documento y nombres son requeridos" });
    }
    const { rows } = await pool.query(
      `INSERT INTO clientes (tipo_documento, nro_documento, nombres, apellidos, fecha_nacimiento, nro_celular, es_generico)
       VALUES ($1,$2,$3,$4,$5,$6,FALSE)
       ON CONFLICT (nro_documento) DO UPDATE
         SET nombres=$3, apellidos=$4, nro_celular=$6
       RETURNING *`,
      [tipo_documento, nro_documento, nombres, apellidos, fecha_nacimiento || null, nro_celular || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
