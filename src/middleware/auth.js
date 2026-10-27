const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token requerido" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, nombre_corto, es_admin, es_barbero }
    next();
  } catch (err) {
    logger.warn("JWT inválido:", err.message);
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || !req.user.es_admin) {
    return res.status(403).json({ error: "Acceso restringido a administradores" });
  }
  next();
}

module.exports = { authMiddleware, adminOnly };
