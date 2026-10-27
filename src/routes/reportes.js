const router = require("express").Router();
const { pool } = require("../db/pool");
const { authMiddleware, adminOnly } = require("../middleware/auth");

router.use(authMiddleware, adminOnly);

// GET /api/reportes/resumen
router.get("/resumen", async (req, res, next) => {
  try {
    const { desde, hasta, barbero_id } = req.query;

    const ventaWhere  = [];
    const ventaParams = [];
    const egWhere     = [];
    const egParams    = [];

    if (desde) {
      ventaParams.push(desde);  ventaWhere.push(`v.fecha >= $${ventaParams.length}`);
      egParams.push(desde);     egWhere.push(`e.fecha  >= $${egParams.length}`);
    }
    if (hasta) {
      ventaParams.push(hasta);  ventaWhere.push(`v.fecha <= $${ventaParams.length}`);
      egParams.push(hasta);     egWhere.push(`e.fecha  <= $${egParams.length}`);
    }
    if (barbero_id) {
      ventaParams.push(barbero_id); ventaWhere.push(`v.barbero_id = $${ventaParams.length}`);
      egParams.push(barbero_id);    egWhere.push(`e.barbero_id  = $${egParams.length}`);
    }

    const ventaSql = ventaWhere.length ? " AND " + ventaWhere.join(" AND ") : "";
    const egSql    = egWhere.length    ? " AND " + egWhere.join(" AND ")    : "";
    // Para subconsultas con alias vv
    const subSql   = ventaSql.replace(/\bv\./g, "vv.");

    // ── Totales globales ───────────────────────────────────────────────────────
    const totalesQ = await pool.query(
      `SELECT
         COALESCE(SUM(v.total), 0) AS ventas,
         COALESCE((
           SELECT SUM(d.precio_cobrado)
           FROM detalle_venta d
           JOIN ventas vv ON vv.id = d.venta_id
           WHERE d.tipo = 'TIP'${subSql}
         ), 0) AS propinas,
         COALESCE((
           SELECT SUM(d.precio_cobrado)
           FROM detalle_venta d
           JOIN ventas vv ON vv.id = d.venta_id
           WHERE d.tipo = 'S'${subSql}
         ), 0) AS ventas_servicios,
         COALESCE((
           SELECT SUM(d.precio_cobrado)
           FROM detalle_venta d
           JOIN ventas vv ON vv.id = d.venta_id
           WHERE d.tipo = 'P'${subSql}
         ), 0) AS ventas_productos
       FROM ventas v WHERE 1=1${ventaSql}`,
      ventaParams
    );

    // ── Egresos totales + por concepto ─────────────────────────────────────────
    const egresosQ = await pool.query(
      `SELECT
         COALESCE(SUM(monto), 0) AS egresos,
         COALESCE(SUM(CASE WHEN salio_de_caja THEN monto ELSE 0 END), 0) AS egresos_caja
       FROM egresos e WHERE 1=1${egSql}`,
      egParams
    );

    // Efectivo total ingresado en el período
    const efectivoQ = await pool.query(
      `SELECT COALESCE(SUM(p.monto), 0) AS efectivo_ingreso
       FROM pagos_venta p
       JOIN ventas v ON v.id = p.venta_id
       WHERE p.metodo = 'EFECTIVO' AND 1=1${ventaSql}`,
      ventaParams
    );

    // Egresos por concepto con asignado_a y desglose salio_de_caja
    const egConceptoQ = await pool.query(
      `SELECT
         e.concepto,
         u.nombre_corto AS asignado_nombre,
         COALESCE(SUM(e.monto), 0) AS total,
         COALESCE(SUM(CASE WHEN e.salio_de_caja THEN e.monto ELSE 0 END), 0) AS monto_caja_si,
         COALESCE(SUM(CASE WHEN NOT e.salio_de_caja THEN e.monto ELSE 0 END), 0) AS monto_caja_no,
         COUNT(*) AS cantidad
       FROM egresos e
       LEFT JOIN usuarios u ON u.id = e.asignado_a
       WHERE 1=1${egSql}
       GROUP BY e.concepto, u.nombre_corto
       ORDER BY e.concepto, u.nombre_corto`,
      egParams
    );

    // ── Por método de pago ─────────────────────────────────────────────────────
    const metodosQ = await pool.query(
      `SELECT p.metodo,
              COALESCE(SUM(p.monto), 0) AS total,
              COUNT(*) AS cantidad
       FROM pagos_venta p
       JOIN ventas v ON v.id = p.venta_id
       WHERE 1=1${ventaSql}
       GROUP BY p.metodo
       ORDER BY total DESC`,
      ventaParams
    );

    // ── Por barbero — con ventas_servicios y ventas_productos ─────────────────
    // Si hay filtro de barbero, solo mostrar ese; si no, todos los activos
    const barberoWhere = barbero_id
      ? `u.id = ${parseInt(barbero_id)}`
      : `u.es_barbero = TRUE AND u.activo = TRUE`;

    const barberoQ = await pool.query(
      `SELECT
         u.id AS barbero_id,
         u.nombre_corto AS nombre,
         COALESCE(SUM(v.total), 0) - COALESCE((
           SELECT SUM(d.precio_cobrado)
           FROM detalle_venta d
           JOIN ventas vv ON vv.id = d.venta_id
           WHERE d.tipo = 'TIP' AND vv.barbero_id = u.id${subSql}
         ), 0) AS ventas,
         COALESCE((
           SELECT SUM(d.precio_cobrado)
           FROM detalle_venta d
           JOIN ventas vv ON vv.id = d.venta_id
           WHERE d.tipo = 'TIP' AND vv.barbero_id = u.id${subSql}
         ), 0) AS propinas,
         COALESCE((
           SELECT SUM(d.precio_cobrado)
           FROM detalle_venta d
           JOIN ventas vv ON vv.id = d.venta_id
           WHERE d.tipo = 'S' AND vv.barbero_id = u.id${subSql}
         ), 0) AS ventas_servicios,
         COALESCE((
           SELECT SUM(d.precio_cobrado)
           FROM detalle_venta d
           JOIN ventas vv ON vv.id = d.venta_id
           WHERE d.tipo = 'P' AND vv.barbero_id = u.id${subSql}
         ), 0) AS ventas_productos,
         COUNT(DISTINCT v.id) AS num_registros
       FROM usuarios u
       LEFT JOIN ventas v ON v.barbero_id = u.id AND 1=1${ventaSql}
       WHERE ${barberoWhere}
       GROUP BY u.id, u.nombre_corto
       ORDER BY ventas DESC`,
      ventaParams
    );

    // ── Egresos por barbero ────────────────────────────────────────────────────
    const egBarberoQ = await pool.query(
      `SELECT u.id AS barbero_id,
              COALESCE(SUM(e.monto), 0) AS egresos
       FROM usuarios u
       LEFT JOIN egresos e ON e.barbero_id = u.id AND 1=1${egSql}
       WHERE ${barberoWhere}
       GROUP BY u.id`,
      egParams
    );

    const egMap = {};
    for (const r of egBarberoQ.rows) egMap[r.barbero_id] = parseFloat(r.egresos);
    const porBarbero = barberoQ.rows.map((b) => ({
      ...b,
      egresos: egMap[b.barbero_id] || 0,
    }));

    const totalVentas    = parseFloat(totalesQ.rows[0].ventas);
    const totalPropinas  = parseFloat(totalesQ.rows[0].propinas);
    const totalEgresos   = parseFloat(egresosQ.rows[0].egresos);
    const egresosCaja    = parseFloat(egresosQ.rows[0].egresos_caja);
    const efectivoIngreso = parseFloat(efectivoQ.rows[0].efectivo_ingreso);

    const ventasServicios = parseFloat(totalesQ.rows[0].ventas_servicios);
    const ventasProductos = parseFloat(totalesQ.rows[0].ventas_productos);

    res.json({
      totales: {
        ventas:            totalVentas - totalPropinas,
        ventas_servicios:  ventasServicios,
        ventas_productos:  ventasProductos,
        propinas:          totalPropinas,
        egresos:           totalEgresos,
        efectivo_neto:     efectivoIngreso - egresosCaja,
        ventas_raw:        totalVentas,
      },
      egresos_por_concepto: egConceptoQ.rows.map(r => ({
        concepto:       r.concepto,
        asignado_nombre: r.asignado_nombre || '—',
        total:          parseFloat(r.total),
        monto_caja_si:  parseFloat(r.monto_caja_si),
        monto_caja_no:  parseFloat(r.monto_caja_no),
        cantidad:       parseInt(r.cantidad),
      })),
      por_metodo:  metodosQ.rows,
      por_barbero: porBarbero,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reportes/general — vista detallada
router.get("/general", async (req, res, next) => {
  try {
    const { desde, hasta, barbero_id } = req.query;
    const params    = [];
    const ventaWhere = [];
    const egWhere    = [];
    const egParams   = [];

    if (desde) {
      params.push(desde);
      ventaWhere.push(`v.fecha >= $${params.length}`);
      egParams.push(desde);
      egWhere.push(`e.fecha >= $${egParams.length}`);
    }
    if (hasta) {
      params.push(hasta);
      ventaWhere.push(`v.fecha <= $${params.length}`);
      egParams.push(hasta);
      egWhere.push(`e.fecha <= $${egParams.length}`);
    }
    if (barbero_id) {
      params.push(barbero_id);
      ventaWhere.push(`v.barbero_id = $${params.length}`);
      egParams.push(barbero_id);
      egWhere.push(`e.barbero_id = $${egParams.length}`);
    }

    const ventaSql = ventaWhere.length ? " AND " + ventaWhere.join(" AND ") : "";
    const egSql    = egWhere.length    ? " AND " + egWhere.join(" AND ")    : "";

    // Ventas agrupadas por venta (una fila = una venta completa con todos sus ítems)
    const ventasQ = await pool.query(
      `SELECT
         v.id,
         v.fecha,
         v.hora,
         v.es_manual,
         u.nombre_corto AS barbero,
         c.nombres || ' ' || c.apellidos AS cliente,
         c.es_generico,
         v.total,
         (SELECT json_agg(jsonb_build_object(
            'tipo', d.tipo, 'nombre', d.nombre_item, 'precio', d.precio_cobrado
          ) ORDER BY d.id)
          FROM detalle_venta d WHERE d.venta_id = v.id) AS items,
         COALESCE((SELECT SUM(p.monto) FROM pagos_venta p WHERE p.venta_id=v.id AND p.metodo='EFECTIVO'),0) AS efectivo,
         COALESCE((SELECT SUM(p.monto) FROM pagos_venta p WHERE p.venta_id=v.id AND p.metodo='TARJETA'),0)  AS tarjeta,
         COALESCE((SELECT SUM(p.monto) FROM pagos_venta p WHERE p.venta_id=v.id AND p.metodo='YAPE'),0)     AS yape,
         COALESCE((SELECT SUM(p.monto) FROM pagos_venta p WHERE p.venta_id=v.id AND p.metodo='PLIN'),0)     AS plin
       FROM ventas v
       JOIN usuarios u ON u.id = v.barbero_id
       JOIN clientes c ON c.id = v.cliente_id
       WHERE 1=1${ventaSql}
       ORDER BY v.fecha DESC, v.hora DESC`,
      params
    );

    // Egresos detallados
    const egresosQ = await pool.query(
      `SELECT e.fecha, e.hora, u.nombre_corto AS barbero, e.concepto, e.monto, e.notas,
              e.salio_de_caja, ua.nombre_corto AS asignado_nombre
       FROM egresos e
       JOIN usuarios u ON u.id = e.barbero_id
       LEFT JOIN usuarios ua ON ua.id = e.asignado_a
       WHERE 1=1${egSql}
       ORDER BY e.fecha DESC, e.hora DESC`,
      egParams
    );

    res.json({
      ventas:   ventasQ.rows,
      egresos:  egresosQ.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
