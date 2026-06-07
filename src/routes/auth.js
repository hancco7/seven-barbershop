const router = require("express").Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { pool } = require("../db/pool");
const { authMiddleware } = require("../middleware/auth");
const logger = require("../utils/logger");

// POST /api/auth/login — acepta nombre_corto o email
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Usuario y contraseña requeridos" });
    }

    const identifier = email.trim();
    const { rows } = await pool.query(
      `SELECT * FROM usuarios
       WHERE (UPPER(nombre_corto) = UPPER($1) OR (email IS NOT NULL AND LOWER(email) = LOWER($1)))
         AND es_admin = TRUE AND activo = TRUE`,
      [identifier]
    );

    if (!rows.length) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      logger.warn(`Login fallido para ${email}`);
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        nombre_corto: user.nombre_corto,
        nombres: user.nombres,
        apellidos: user.apellidos,
        es_admin: user.es_admin,
        es_barbero: user.es_barbero,
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    logger.info(`Login exitoso: ${user.nombre_corto}`);
    res.json({
      token,
      user: {
        id: user.id,
        nombre_corto: user.nombre_corto,
        nombres: user.nombres,
        apellidos: user.apellidos,
        email: user.email,
        es_admin: user.es_admin,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — valida token activo
router.get("/me", authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, nombre_corto, nombres, apellidos, email, es_admin, activo FROM usuarios WHERE id = $1",
      [req.user.id]
    );
    if (!rows.length || !rows[0].activo) {
      return res.status(401).json({ error: "Usuario no encontrado o inactivo" });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
