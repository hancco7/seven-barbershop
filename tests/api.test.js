jest.mock("../src/db/pool", () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  },
  testConnection: jest.fn().mockResolvedValue(true),
}));

jest.mock("bcrypt", () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

const request = require("supertest");
const bcrypt = require("bcrypt");
const { pool } = require("../src/db/pool");

// Importar app DESPUÉS de los mocks
process.env.JWT_SECRET = "test_secret_key_se7en_2026";
process.env.NODE_ENV = "test";
const app = require("../src/server");

// Helper: token admin de prueba
const jwt = require("jsonwebtoken");
const adminToken = jwt.sign(
  { id: 1, nombre_corto: "HANZ", es_admin: true, es_barbero: false },
  process.env.JWT_SECRET,
  { expiresIn: "1h" }
);

afterAll(async () => {
  // noop — no hay conexión real
});

// ── 1. Health check ──────────────────────────────────────────────────────────
describe("GET /health", () => {
  test("1. retorna status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

// ── 2. Auth ──────────────────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  test("2. login exitoso retorna token", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: 1, nombre_corto: "HANZ", nombres: "Hanz", apellidos: "Ccorahua",
        email: "hanz@seven.com", password_hash: "$2b$10$hash", es_admin: true, es_barbero: false,
      }],
    });
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "hanz@seven.com", password: "se7en2026" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.es_admin).toBe(true);
  });

  test("3. credenciales inválidas retorna 401", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "noexiste@seven.com", password: "wrong" });
    expect(res.status).toBe(401);
  });

  test("4. contraseña incorrecta retorna 401", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, password_hash: "$2b$10$hash", es_admin: true, nombre_corto: "HANZ", nombres: "Hanz", apellidos: "C", email: "h@s.com", es_barbero: false }],
    });
    bcrypt.compare.mockResolvedValueOnce(false);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "hanz@seven.com", password: "wrong" });
    expect(res.status).toBe(401);
  });

  test("5. faltan campos retorna 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "hanz@seven.com" });
    expect(res.status).toBe(400);
  });
});

// ── 3. Barberos (público) ────────────────────────────────────────────────────
describe("GET /api/barberos", () => {
  test("6. retorna lista de barberos", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 2, nombre_corto: "CARLOS", activo: true },
        { id: 3, nombre_corto: "PAOLO",  activo: true },
      ],
    });
    const res = await request(app).get("/api/barberos?activo=true");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  test("7. retorna lista vacía si no hay barberos", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/api/barberos");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

// ── 4. Catálogo (público) ────────────────────────────────────────────────────
describe("GET /api/catalogo/servicios", () => {
  test("8. retorna servicios", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, nombre: "CORTE DEGRADADO", precio: 25, es_favorito: true }],
    });
    const res = await request(app).get("/api/catalogo/servicios");
    expect(res.status).toBe(200);
    expect(res.body.data[0].nombre).toBe("CORTE DEGRADADO");
  });

  test("9. filtro favoritos retorna solo favoritos", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, nombre: "CORTE DEGRADADO", es_favorito: true }] });
    const res = await request(app).get("/api/catalogo/servicios?favoritos=true");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/catalogo/productos", () => {
  test("10. retorna productos", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, nombre: "GEL INFUSE", precio_venta: 30 }],
    });
    const res = await request(app).get("/api/catalogo/productos");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// ── 5. Rutas protegidas sin token ────────────────────────────────────────────
describe("Rutas protegidas sin token → 401", () => {
  test("11. POST /api/barberos sin token → 401", async () => {
    const res = await request(app).post("/api/barberos").send({ nombre_corto: "TEST" });
    expect(res.status).toBe(401);
  });

  test("12. POST /api/catalogo/servicios sin token → 401", async () => {
    const res = await request(app).post("/api/catalogo/servicios").send({});
    expect(res.status).toBe(401);
  });

  test("13. GET /api/reportes/resumen sin token → 401", async () => {
    const res = await request(app).get("/api/reportes/resumen");
    expect(res.status).toBe(401);
  });
});

// ── 6. Rutas admin ───────────────────────────────────────────────────────────
describe("Rutas admin con token válido", () => {
  test("14. GET /api/reportes/resumen con token admin → 200", async () => {
    // mock totales
    pool.query.mockResolvedValueOnce({ rows: [{ ventas: "100", propinas: "5" }] });
    // mock egresos
    pool.query.mockResolvedValueOnce({ rows: [{ egresos: "10" }] });
    // mock por_metodo
    pool.query.mockResolvedValueOnce({ rows: [] });
    // mock por_barbero
    pool.query.mockResolvedValueOnce({ rows: [] });
    // mock egresos por barbero
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/reportes/resumen")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totales");
  });
});
