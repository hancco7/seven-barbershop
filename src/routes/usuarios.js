const router = require("express").Router();
const bcrypt = require("bcrypt");
const { pool } = require("../db/pool");
const { authMiddleware, adminOnly } = require("../middleware/auth");
const logger = require("../utils/logger");

router.use(authMiddleware, adminOnly);

// GET /api/usuarios — todos los usuarios (barberos + admins)
router.get("/", async (req, res, next) => {
  try {
    const { activo } = req.query;
    let q = `SELECT id, nombre_corto, nombres, apellidos, tipo_documento,
                    nro_documento, activo, es_admin, es_barbero
             FROM usuarios WHERE 1=1`;
    const params = [];
    if (activo !== undefined) {
      params.push(activo === "true");
      q += ` AND activo = $${params.length}`;
    }
    q += " ORDER BY es_admin DESC, nombre_corto";
    const { rows } = await pool.query(q, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/usuarios — crear barbero o admin
router.post("/", async (req, res, next) => {
  try {
    const {
      tipo_documento = "DNI", nro_documento, nombres, apellidos,
      nombre_corto, es_barbero = false, es_admin = false, password,
    } = req.body;

    if (!nro_documento || !nombres || !apellidos || !nombre_corto) {
      return res.status(400).json({ error: "Campos requeridos: nro_documento, nombres, apellidos, nombre_corto" });
    }
    if (es_admin && !password) {
      return res.status(400).json({ error: "Los administradores requieren contraseña" });
    }

    const password_hash = password ? await bcrypt.hash(password, 10) : null;

    const { rows } = await pool.query(
      `INSERT INTO usuarios
         (tipo_documento, nro_documento, nombres, apellidos, nombre_corto,
          es_barbero, es_admin, password_hash, activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
       RETURNING id, nombre_corto, nombres, apellidos, activo, es_admin, es_barbero`,
      [tipo_documento, nro_documento, nombres, apellidos,
       nombre_corto.toUpperCase(), Boolean(es_barbero), Boolean(es_admin), password_hash]
    );
    logger.info(`Usuario creado: ${rows[0].nombre_corto} admin=${es_admin} barbero=${es_barbero}`);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/usuarios/:id
router.put("/:id", async (req, res, next) => {
  try {
    const {
      tipo_documento, nro_documento, nombres, apellidos,
      nombre_corto, activo, es_barbero, es_admin, password,
    } = req.body;

    const password_hash = password ? await bcrypt.hash(password, 10) : undefined;

    const fields = [];
    const params = [];
    const set = (col, val) => { if (val !== undefined) { params.push(val); fields.push(`${col} = $${params.length}`); } };

    set("tipo_documento", tipo_documento);
    set("nro_documento",  nro_documento);
    set("nombres",        nombres);
    set("apellidos",      apellidos);
    set("nombre_corto",   nombre_corto ? nombre_corto.toUpperCase() : undefined);
    set("activo",         activo);
    set("es_barbero",     es_barbero);
    set("es_admin",       es_admin);
    set("password_hash",  password_hash);

    if (!fields.length) return res.status(400).json({ error: "Sin campos para actualizar" });

    params.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE usuarios SET ${fields.join(", ")} WHERE id = $${params.length}
       RETURNING id, nombre_corto, nombres, apellidos, activo, es_admin, es_barbero`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: "Usuario no encontrado" });
    logger.info(`Usuario actualizado: id=${req.params.id}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
