require("dotenv").config();
const bcrypt = require("bcrypt");
const { pool } = require("./pool");

async function seed() {
  console.log("🌱  Seeding database…");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ── Admin: Hanz Ccorahua Aquiño  (pass: se7en2026) ──────────────────────
    const passHash = await bcrypt.hash("se7en2026", 10);
    await client.query(
      `INSERT INTO usuarios
         (tipo_documento, nro_documento, nombres, apellidos, nombre_corto,
          email, password_hash, es_admin, es_barbero, activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (email) DO NOTHING`,
      [
        "DNI","45000001","Hanz","Ccorahua Aquiño","HANZ",
        "hanz@seven.com", passHash, true, false, true,
      ]
    );

    // ── Barberos ─────────────────────────────────────────────────────────────
    const barberos = [
      ["DNI","73881200","Carlos","Pérez López","CARLOS"],
      ["DNI","48992201","Paolo","Ruiz Torres","PAOLO"],
      ["DNI","61230045","Omer","Vásquez Díaz","OMER"],
      ["DNI","70123456","JJ","Mamani Flores","JJ"],
      ["DNI","80234567","Weimber","Quispe Ramos","WEIMBER"],
      ["DNI","90345678","Eduardo","Flores Huanca","EDUARDO"],
    ];
    for (const [td, nd, nom, ape, nc] of barberos) {
      await client.query(
        `INSERT INTO usuarios (tipo_documento, nro_documento, nombres, apellidos,
           nombre_corto, es_admin, es_barbero, activo)
         VALUES ($1,$2,$3,$4,$5,false,true,true)
         ON CONFLICT DO NOTHING`,
        [td, nd, nom, ape, nc]
      );
    }

    // ── Cliente genérico ─────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO clientes (tipo_documento, nro_documento, nombres, apellidos, es_generico)
       VALUES ('GEN','GEN-00000000','CLIENTE GENÉRICO','',true)
       ON CONFLICT (nro_documento) DO NOTHING`
    );

    // ── Servicios ────────────────────────────────────────────────────────────
    const servicios = [
      ["Corte","Corte cabello","CORTE DEGRADADO",   25, true ],
      ["Corte","Corte cabello","CORTE CLÁSICO",     20, true ],
      ["Corte","Corte cabello","LÍNEA EN CABELLO",   5, false],
      ["Corte","Perfilado",    "PERFILADO CEJA",     5, true ],
      ["Corte","Perfilado",    "PERFILADO BARBA",    5, true ],
      ["Facial","Blackmaks",   "BLACKMAKS",         10, false],
      ["Facial","Facial completo","FACIAL COMPLETO",70, false],
      ["Manos y pies","Manicure","MANICURE",        10, false],
      ["Manos y pies","Pedicure","PEDICURE",        15, false],
      ["Manos y pies","Manicure y pedicure","MANICURE Y PEDICURE",20,false],
      ["Corte","Corte barba",  "CORTE BARBA",       15, true ],
      ["Corte","Corte cabello","CORTE DAMA",        20, false],
      ["Tinte","Tinte caballero","TINTE CABALLERO", 50, false],
      ["Tinte","Tinte caballero","TINTE BIGEN",      5, false],
      ["Tratamiento","Tratamiento ampoya","TRATAMIENTO AMPOYA",15,false],
      ["Lavado","Lavado cabello","SOLO LAVADO CABELLO",5,false],
      ["Ondulación","Ondulación","ONDULACIÓN CABELLO",50,false],
    ];
    for (const [cat, sub, nom, precio, fav] of servicios) {
      await client.query(
        `INSERT INTO servicios (categoria, subcategoria, nombre, precio, activo, es_favorito)
         VALUES ($1,$2,$3,$4,true,$5)
         ON CONFLICT DO NOTHING`,
        [cat, sub, nom, precio, fav]
      );
    }

    // ── Productos ────────────────────────────────────────────────────────────
    const productos = [
      ["Cabello","Gel",   "ROLDA GEL 500ml",        10, 12,  true ],
      ["Cabello","Cera",  "ROLDA CERA 250ml",        20, 13,  false],
      ["Barba",  "Barba", "MINOXIDIL",               15, 33,  true ],
      ["Cabello","Shampoo","SHAMPOO ANTI CAÍDA 400ML",55,null,false],
      ["Cabello","Tónico","TÓNICO CONTROL ANTICAÍDA", 55,null,false],
      ["Cabello","Laca",  "LACA INFUSE",             30, null,false],
      ["Cabello","Cera",  "CERA INFUSE",             35, 16,  true ],
      ["Cabello","Gel",   "GEL INFUSE",              30, 16,  true ],
    ];
    for (const [cat, sub, nom, pv, costo, fav] of productos) {
      await client.query(
        `INSERT INTO productos (categoria, subcategoria, nombre, precio_venta, costo, activo, es_favorito)
         VALUES ($1,$2,$3,$4,$5,true,$6)
         ON CONFLICT DO NOTHING`,
        [cat, sub, nom, pv, costo, fav]
      );
    }

    await client.query("COMMIT");
    console.log("✅  Seed completed successfully.");
    console.log("   Admin: hanz@seven.com / se7en2026");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌  Seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
