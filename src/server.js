// Timezone: forzar Lima antes de cualquier new Date()
process.env.TZ = process.env.TZ || "America/Lima";

require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const { testConnection } = require("./db/pool");
const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");

// Routes
const authRouter     = require("./routes/auth");
const barberosRouter = require("./routes/barberos");
const usuariosRouter = require("./routes/usuarios");
const catalogoRouter = require("./routes/catalogo");
const ventasRouter   = require("./routes/ventas");
const egresosRouter  = require("./routes/egresos");
const reportesRouter = require("./routes/reportes");
const clientesRouter = require("./routes/clientes");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security & compression ──────────────────────────────────────────────────
app.set("trust proxy", 1);
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "1mb" }));

// ── Rate limiting ────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Demasiados intentos de login. Intenta en 15 minutos." },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: "Demasiadas solicitudes. Intenta en un momento." },
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString(), env: process.env.NODE_ENV })
);

// ── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/auth",      loginLimiter);
app.use("/api",           apiLimiter);
app.use("/api/auth",      authRouter);
app.use("/api/barberos",  barberosRouter);
app.use("/api/usuarios",  usuariosRouter);
app.use("/api/catalogo",  catalogoRouter);
app.use("/api/ventas",    ventasRouter);
app.use("/api/egresos",   egresosRouter);
app.use("/api/clientes",  clientesRouter);
app.use("/api/reportes",  reportesRouter);

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

// ── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────────────
async function start() {
  await testConnection();
  app.listen(PORT, () => {
    logger.info(`🚀  SE7EN API corriendo en puerto ${PORT} [${process.env.NODE_ENV || "development"}]`);
  });
}

start().catch((err) => {
  logger.error("Error al iniciar el servidor:", err);
  process.exit(1);
});

module.exports = app; // para tests
