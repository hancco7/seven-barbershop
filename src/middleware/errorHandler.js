const logger = require("../utils/logger");

function errorHandler(err, req, res, next) {
  // PostgreSQL error codes
  const pgErrors = {
    "23505": { status: 409, message: "Registro duplicado" },
    "23503": { status: 400, message: "Referencia inválida" },
    "23502": { status: 400, message: "Campo requerido faltante" },
    "22P02": { status: 400, message: "Formato de dato inválido" },
    "42P01": { status: 500, message: "Tabla no existe — ejecuta migrate.js" },
    "ECONNREFUSED": { status: 503, message: "Sin conexión a la base de datos" },
  };

  const code = err.code || "";
  const mapped = pgErrors[code];

  if (mapped) {
    logger.warn(`DB error [${code}]: ${err.detail || err.message}`);
    return res.status(mapped.status).json({
      error: mapped.message,
      detail: process.env.NODE_ENV !== "production" ? err.detail : undefined,
    });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({ error: err.message });
  }

  const status = err.status || err.statusCode || 500;
  logger.error(`[${req.method}] ${req.path} → ${status}: ${err.message}`, {
    stack: err.stack,
  });

  res.status(status).json({
    error: status >= 500 ? "Error interno del servidor" : err.message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
}

module.exports = errorHandler;
