const router = require("express").Router();
const { pool } = require("../db/pool");
const { authMiddleware, adminOnly } = require("../middleware/auth");

// ── SERVICIOS ────────────────────────────────────────────────────────────────

// GET /api/catalogo/servicios
router.get("/servicios", async (req, res, next) => {
  try {
    const { categoria, subcategoria, favoritos, activo = "true" } = req.query;
    let q = "SELECT * FROM servicios WHERE 1=1";
    const params = [];

    if (activo !== undefined) { params.push(activo === "true"); q += ` AND activo=$${params.length}`; }
    if (categoria)    { params.push(categoria);    q += ` AND categoria=$${params.length}`; }
    if (subcategoria) { params.push(subcategoria); q += ` AND subcategoria=$${params.length}`; }
    if (favoritos === "true") q += " AND es_favorito=TRUE";

    q += " ORDER BY categoria, subcategoria, nombre";
    const { rows } = await pool.query(q, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/catalogo/servicios/categorias — para filtro cascada
router.get("/servicios/categorias", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT categoria, subcategoria FROM servicios WHERE activo=TRUE ORDER BY categoria, subcategoria"
    );
    // Armar árbol { categoria: [subcategorias] }
    const tree = {};
    for (const { categoria, subcategoria } of rows) {
      if (!tree[categoria]) tree[categoria] = [];
      tree[categoria].push(subcategoria);
    }
    res.json(tree);
  } catch (err) { next(err); }
});

// POST /api/catalogo/servicios
router.post("/servicios", authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { categoria, subcategoria, nombre, precio, es_favorito = false } = req.body;
    if (!categoria || !subcategoria || !nombre || precio == null)
      return res.status(400).json({ error: "categoria, subcategoria, nombre y precio son requeridos" });
    const { rows } = await pool.query(
      "INSERT INTO servicios (categoria, subcategoria, nombre, precio, es_favorito) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [categoria, subcategoria, nombre, precio, es_favorito]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/catalogo/servicios/:id
router.put("/servicios/:id", authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { categoria, subcategoria, nombre, precio, activo, es_favorito } = req.body;
    const { rows } = await pool.query(
      `UPDATE servicios SET
         categoria    = COALESCE($1, categoria),
         subcategoria = COALESCE($2, subcategoria),
         nombre       = COALESCE($3, nombre),
         precio       = COALESCE($4, precio),
         activo       = COALESCE($5, activo),
         es_favorito  = COALESCE($6, es_favorito)
       WHERE id=$7 RETURNING *`,
      [categoria, subcategoria, nombre, precio, activo, es_favorito, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Servicio no encontrado" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── PRODUCTOS ────────────────────────────────────────────────────────────────

// GET /api/catalogo/productos
router.get("/productos", async (req, res, next) => {
  try {
    const { categoria, subcategoria, favoritos, activo = "true" } = req.query;
    let q = "SELECT * FROM productos WHERE 1=1";
    const params = [];

    if (activo !== undefined) { params.push(activo === "true"); q += ` AND activo=$${params.length}`; }
    if (categoria)    { params.push(categoria);    q += ` AND categoria=$${params.length}`; }
    if (subcategoria) { params.push(subcategoria); q += ` AND subcategoria=$${params.length}`; }
    if (favoritos === "true") q += " AND es_favorito=TRUE";

    q += " ORDER BY categoria, subcategoria, nombre";
    const { rows } = await pool.query(q, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/catalogo/productos/categorias
router.get("/productos/categorias", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT categoria, subcategoria FROM productos WHERE activo=TRUE ORDER BY categoria, subcategoria"
    );
    const tree = {};
    for (const { categoria, subcategoria } of rows) {
      if (!tree[categoria]) tree[categoria] = [];
      tree[categoria].push(subcategoria);
    }
    res.json(tree);
  } catch (err) { next(err); }
});

// POST /api/catalogo/productos
router.post("/productos", authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { categoria, subcategoria, nombre, precio_venta, costo, es_favorito = false } = req.body;
    if (!categoria || !subcategoria || !nombre || precio_venta == null)
      return res.status(400).json({ error: "categoria, subcategoria, nombre y precio_venta son requeridos" });
    const { rows } = await pool.query(
      "INSERT INTO productos (categoria, subcategoria, nombre, precio_venta, costo, es_favorito) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [categoria, subcategoria, nombre, precio_venta, costo || null, es_favorito]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/catalogo/productos/:id
router.put("/productos/:id", authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { categoria, subcategoria, nombre, precio_venta, costo, activo, es_favorito } = req.body;
    const { rows } = await pool.query(
      `UPDATE productos SET
         categoria    = COALESCE($1, categoria),
         subcategoria = COALESCE($2, subcategoria),
         nombre       = COALESCE($3, nombre),
         precio_venta = COALESCE($4, precio_venta),
         costo        = COALESCE($5, costo),
         activo       = COALESCE($6, activo),
         es_favorito  = COALESCE($7, es_favorito)
       WHERE id=$8 RETURNING *`,
      [categoria, subcategoria, nombre, precio_venta, costo, activo, es_favorito, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Producto no encontrado" });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
