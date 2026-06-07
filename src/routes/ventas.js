const router = require("express").Router();
const { pool } = require("../db/pool");
const { authMiddleware, adminOnly } = require("../middleware/auth");
const logger = require("../utils/logger");

// POST /api/ventas — Registrar venta (barbero o admin registro manual)
router.post("/", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      barbero_id, cliente_id, registrado_por = null, es_manual = false,
      fecha, hora, total, offline_id = null,
      items = [], // [{ tipo, item_id, nombre_item, precio_cobrado, precio_original }]
      pagos = [], // [{ metodo, monto }]
    } = req.body;

    if (!barbero_id || !cliente_id || !items.length || !pagos.length) {
      return res.status(400).json({ error: "barbero_id, cliente_id, items y pagos son requeridos" });
    }

    // Deduplicación offline
    if (offline_id) {
      const dup = await client.query("SELECT id FROM ventas WHERE offline_id=$1", [offline_id]);
      if (dup.rows.length) {
        logger.info(`Venta duplicada ignorada: offline_id=${offline_id}`);
        return res.status(200).json({ id: dup.rows[0].id, duplicado: true });
      }
    }

    await client.query("BEGIN");

    const { rows: [venta] } = await client.query(
      `INSERT INTO ventas (barbero_id, cliente_id, registrado_por, es_manual, fecha, hora, total, offline_id, sincronizado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING id`,
      [barbero_id, cliente_id, registrado_por, es_manual,
       fecha || null, hora || null, total, offline_id || null]
    );

    // Items
    for (const item of items) {
      await client.query(
        `INSERT INTO detalle_venta (venta_id, tipo, item_id, nombre_item, precio_cobrado, precio_original)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [venta.id, item.tipo, item.item_id || null, item.nombre_item, item.precio_cobrado, item.precio_original || null]
      );
    }

    // Pagos
    for (const pago of pagos) {
      await client.query(
        "INSERT INTO pagos_venta (venta_id, metodo, monto) VALUES ($1,$2,$3)",
        [venta.id, pago.metodo, pago.monto]
      );
    }

    await client.query("COMMIT");
    logger.info(`Venta registrada: id=${venta.id}, barbero=${barbero_id}, total=${total}`);
    res.status(201).json({ id: venta.id });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/ventas/pivot/:barberoId — tabla pivot del día para el barbero
router.get("/pivot/:barberoId", async (req, res, next) => {
  try {
    const { barberoId } = req.params;
    const { fecha } = req.query;
    // Obtener fecha local Lima del servidor (process.env.TZ = America/Lima)
    const hoy = new Date();
    const localFecha = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
    const diaFecha = fecha || localFecha;

    // KPIs — num_registros = cantidad de ventas (registros), no de ítems
    const kpiQ = await pool.query(
      `SELECT
         COALESCE(SUM(v.total), 0) AS total_ventas,
         COUNT(v.id) AS num_registros,
         (SELECT COUNT(*) FROM detalle_venta d
          WHERE d.venta_id IN (SELECT id FROM ventas WHERE barbero_id=$1 AND fecha=$2)
          AND d.tipo IN ('S','P')) AS num_servicios,
         (SELECT COALESCE(SUM(d.precio_cobrado),0) FROM detalle_venta d
          WHERE d.venta_id IN (SELECT id FROM ventas WHERE barbero_id=$1 AND fecha=$2)
          AND d.tipo='TIP') AS total_propinas,
         (SELECT COALESCE(SUM(d.precio_cobrado),0) FROM detalle_venta d
          WHERE d.venta_id IN (SELECT id FROM ventas WHERE barbero_id=$1 AND fecha=$2)
          AND d.tipo='S') AS ventas_servicios,
         (SELECT COALESCE(SUM(d.precio_cobrado),0) FROM detalle_venta d
          WHERE d.venta_id IN (SELECT id FROM ventas WHERE barbero_id=$1 AND fecha=$2)
          AND d.tipo='P') AS ventas_productos
       FROM ventas v
       WHERE v.barbero_id=$1 AND v.fecha=$2`,
      [barberoId, diaFecha]
    );

    // Ventas con desglose de pagos por método
    // NOTA: Se usan subconsultas separadas para items y pagos para evitar
    // producto cartesiano (items × pagos) que duplicaría los montos.
    // json_agg sin DISTINCT permite mostrar el mismo servicio/producto varias veces.
    const ventasQ = await pool.query(
      `SELECT
         v.id, v.hora, v.es_manual,
         c.nombres || ' ' || c.apellidos AS cliente,
         c.es_generico,
         v.total,
         -- Items: subconsulta para evitar multiplicación con pagos
         (SELECT json_agg(jsonb_build_object(
            'tipo', d.tipo, 'nombre', d.nombre_item, 'precio', d.precio_cobrado
          ) ORDER BY d.id)
          FROM detalle_venta d WHERE d.venta_id = v.id) AS items,
         -- Pagos: subconsulta agregada para evitar multiplicación con items
         COALESCE((SELECT SUM(p.monto) FROM pagos_venta p WHERE p.venta_id=v.id AND p.metodo='EFECTIVO'),0) AS efectivo,
         COALESCE((SELECT SUM(p.monto) FROM pagos_venta p WHERE p.venta_id=v.id AND p.metodo='TARJETA'),0)  AS tarjeta,
         COALESCE((SELECT SUM(p.monto) FROM pagos_venta p WHERE p.venta_id=v.id AND p.metodo='YAPE'),0)     AS yape,
         COALESCE((SELECT SUM(p.monto) FROM pagos_venta p WHERE p.venta_id=v.id AND p.metodo='PLIN'),0)     AS plin
       FROM ventas v
       JOIN clientes c ON c.id = v.cliente_id
       WHERE v.barbero_id=$1 AND v.fecha=$2
       ORDER BY v.hora, v.id`,
      [barberoId, diaFecha]
    );

    // Egresos del día: total y solo los que salieron de caja
    const egresosQ = await pool.query(
      `SELECT
         COALESCE(SUM(monto),0) AS total,
         COALESCE(SUM(CASE WHEN salio_de_caja THEN monto ELSE 0 END),0) AS caja
       FROM egresos WHERE barbero_id=$1 AND fecha=$2`,
      [barberoId, diaFecha]
    );

    // Efectivo total ingresado (para EFECTIVO NETO)
    const efectivoQ = await pool.query(
      `SELECT COALESCE(SUM(p.monto),0) AS efectivo_ingreso
       FROM pagos_venta p
       JOIN ventas v ON v.id = p.venta_id
       WHERE v.barbero_id=$1 AND v.fecha=$2 AND p.metodo='EFECTIVO'`,
      [barberoId, diaFecha]
    );

    res.json({
      fecha: diaFecha,
      kpis: kpiQ.rows[0],
      ventas: ventasQ.rows,
      egresosTotal:    parseFloat(egresosQ.rows[0].total),
      egresosCaja:     parseFloat(egresosQ.rows[0].caja),
      efectivoIngreso: parseFloat(efectivoQ.rows[0].efectivo_ingreso),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/ventas — admin con filtros fecha/barbero
router.get("/", authMiddleware, adminOnly, async (req, res, next) => {
  try {
    const { desde, hasta, barbero_id, limit = 200, offset = 0 } = req.query;
    let q = `
      SELECT v.id, v.fecha, v.hora, v.total, v.es_manual,
             u.nombre_corto AS barbero,
             c.nombres || ' ' || c.apellidos AS cliente,
             c.es_generico,
             json_agg(DISTINCT jsonb_build_object('tipo',d.tipo,'nombre',d.nombre_item,'precio',d.precio_cobrado)) AS items,
             json_agg(DISTINCT jsonb_build_object('metodo',p.metodo,'monto',p.monto)) AS pagos
      FROM ventas v
      JOIN usuarios u ON u.id = v.barbero_id
      JOIN clientes c ON c.id = v.cliente_id
      JOIN detalle_venta d ON d.venta_id = v.id
      JOIN pagos_venta p ON p.venta_id = v.id
      WHERE 1=1`;
    const params = [];
    if (desde)      { params.push(desde);      q += ` AND v.fecha >= $${params.length}`; }
    if (hasta)      { params.push(hasta);      q += ` AND v.fecha <= $${params.length}`; }
    if (barbero_id) { params.push(barbero_id); q += ` AND v.barbero_id = $${params.length}`; }
    q += ` GROUP BY v.id, v.fecha, v.hora, v.total, v.es_manual, u.nombre_corto, c.nombres, c.apellidos, c.es_generico
           ORDER BY v.fecha DESC, v.hora DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(q, params);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
