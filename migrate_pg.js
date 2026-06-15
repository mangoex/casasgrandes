const fs = require('fs');
const path = require('path');
const db = require('./db');

const defaultPasswordHash = "$2b$10$Ly0wcxrAZmfzIOSLPRzwdO3YxJQ2dPT6osFpn0j0hlAT9uK7ojTKm"; // Default: password123

function parseCsvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = [];
  let row = [];
  let insideQuote = false;
  let entry = '';
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (insideQuote) {
      if (char === '"') {
        if (nextChar === '"') {
          entry += '"';
          i++; // Skip next quote
        } else {
          insideQuote = false;
        }
      } else {
        entry += char;
      }
    } else {
      if (char === '"') {
        insideQuote = true;
      } else if (char === ',') {
        row.push(entry.trim());
        entry = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip \n
        }
        row.push(entry.trim());
        // Only push if there's actually some data in the row (e.g. not just empty fields on an empty line)
        if (row.some(val => val !== '')) {
          rows.push(row);
        }
        row = [];
        entry = '';
      } else {
        entry += char;
      }
    }
  }
  if (row.length > 0 || entry !== '') {
    row.push(entry.trim());
    if (row.some(val => val !== '')) {
      rows.push(row);
    }
  }
  return rows;
}

function safeFloat(valStr, defaultValue = 0.0) {
  if (!valStr) return defaultValue;
  const clean = valStr.replace(/\$/g, '').replace(/,/g, '').replace(/\s/g, '').trim();
  if (!clean || clean === '-' || clean === '$-') return defaultValue;
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? defaultValue : parsed;
}

async function runMigration() {
  console.log('Starting PostgreSQL migration...');

  try {
    // 1. Drop existing tables to start fresh
    console.log('Dropping existing tables if any...');
    await db.run('DROP TABLE IF EXISTS crm_pujas CASCADE');
    await db.run('DROP TABLE IF EXISTS crm_notificaciones CASCADE');
    await db.run('DROP TABLE IF EXISTS planificacion_semanal CASCADE');
    await db.run('DROP TABLE IF EXISTS metas_ventas CASCADE');
    await db.run('DROP TABLE IF EXISTS crm_visitas CASCADE');
    await db.run('DROP TABLE IF EXISTS almacen_movimientos CASCADE');
    await db.run('DROP TABLE IF EXISTS cotizacion_detalles CASCADE');
    await db.run('DROP TABLE IF EXISTS cotizaciones CASCADE');
    await db.run('DROP TABLE IF EXISTS temporadas CASCADE');
    await db.run('DROP TABLE IF EXISTS productos CASCADE');
    await db.run('DROP TABLE IF EXISTS clientes CASCADE');
    await db.run('DROP TABLE IF EXISTS cuentas_clave CASCADE');
    await db.run('DROP TABLE IF EXISTS asesores CASCADE');

    // 2. Create tables using Postgres SERIAL
    console.log('Creating tables...');
    
    await db.run(`
      CREATE TABLE asesores (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        usuario TEXT NOT NULL,
        nivel_rol TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        telefono TEXT,
        cumpleanos TEXT,
        password_hash TEXT NOT NULL,
        activo INTEGER DEFAULT 1,
        calificacion REAL DEFAULT 5.0
      )
    `);

    await db.run(`
      CREATE TABLE cuentas_clave (
        id SERIAL PRIMARY KEY,
        tier_name TEXT UNIQUE NOT NULL,
        descuento_mxn REAL NOT NULL
      )
    `);

    await db.run(`
      CREATE TABLE clientes (
        id SERIAL PRIMARY KEY,
        nombre TEXT UNIQUE NOT NULL,
        asesor_id INTEGER,
        cuenta_clave_id INTEGER,
        contacto TEXT,
        telefono TEXT,
        correo TEXT,
        cumpleanos TEXT,
        estado_status TEXT DEFAULT 'Nuevo',
        ubicacion TEXT,
        superficie_text TEXT,
        activo INTEGER DEFAULT 1,
        disponible_para_puja INTEGER DEFAULT 0,
        FOREIGN KEY (asesor_id) REFERENCES asesores(id),
        FOREIGN KEY (cuenta_clave_id) REFERENCES cuentas_clave(id)
      )
    `);

    await db.run(`
      CREATE TABLE productos (
        id SERIAL PRIMARY KEY,
        producto TEXT UNIQUE NOT NULL,
        tipo_categoria TEXT NOT NULL,
        list_price_mxn REAL NOT NULL,
        base_usd REAL DEFAULT 0.0,
        descuento_fijo_quimicos REAL DEFAULT 0.0,
        objetivo_anual INTEGER DEFAULT 0,
        descontar INTEGER DEFAULT 0, -- boolean
        activo INTEGER DEFAULT 1
      )
    `);

    await db.run(`
      CREATE TABLE temporadas (
        id SERIAL PRIMARY KEY,
        actividad TEXT UNIQUE NOT NULL,
        fecha_inicio TEXT,
        fecha_fin TEXT,
        descuento_percentage REAL NOT NULL, -- renamed to avoid sqlite percentage confusion if any, matched to float
        estado_operacion TEXT NOT NULL,
        notas TEXT
      )
    `);

    await db.run(`
      CREATE TABLE cotizaciones (
        id SERIAL PRIMARY KEY,
        fecha_creacion TEXT NOT NULL,
        cliente_id INTEGER NOT NULL,
        asesor_id INTEGER NOT NULL,
        ciclo_agricola TEXT NOT NULL,
        condiciones_pago TEXT NOT NULL,
        folio_cotizacion TEXT UNIQUE NOT NULL,
        mes TEXT,
        estatus TEXT NOT NULL DEFAULT 'Borrador',
        total_mxn REAL DEFAULT 0.0,
        anticipo_apartado REAL DEFAULT 0.0,
        notas TEXT,
        autorizado_por_id INTEGER,
        financiera TEXT,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id),
        FOREIGN KEY (asesor_id) REFERENCES asesores(id),
        FOREIGN KEY (autorizado_por_id) REFERENCES asesores(id)
      )
    `);

    await db.run(`
      CREATE TABLE cotizacion_detalles (
        id SERIAL PRIMARY KEY,
        cotizacion_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        temporada_id INTEGER,
        cantidad_ordenada INTEGER NOT NULL,
        cantidad_entregada INTEGER DEFAULT 0,
        precio_lista_unitario REAL NOT NULL,
        precio_neto_unitario REAL NOT NULL,
        subtotal_mxn REAL NOT NULL,
        FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id),
        FOREIGN KEY (temporada_id) REFERENCES temporadas(id)
      )
    `);

    await db.run(`
      CREATE TABLE almacen_movimientos (
        id SERIAL PRIMARY KEY,
        fecha_movimiento TEXT NOT NULL,
        tipo_movimiento TEXT NOT NULL,
        producto_id INTEGER NOT NULL,
        cantidad_entrante REAL DEFAULT 0.0,
        cantidad_saliente REAL DEFAULT 0.0,
        existencias_resultantes REAL NOT NULL,
        cotizacion_id INTEGER,
        asesor_id INTEGER,
        referencia_factura TEXT,
        notas TEXT,
        FOREIGN KEY (producto_id) REFERENCES productos(id),
        FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id),
        FOREIGN KEY (asesor_id) REFERENCES asesores(id)
      )
    `);

    await db.run(`
      CREATE TABLE crm_visitas (
        id SERIAL PRIMARY KEY,
        fecha_visita TEXT NOT NULL,
        cliente_id INTEGER NOT NULL,
        asesor_id INTEGER NOT NULL,
        comentarios_bitacora TEXT,
        proxima_cita TEXT,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id),
        FOREIGN KEY (asesor_id) REFERENCES asesores(id)
      )
    `);

    await db.run(`
      CREATE TABLE metas_ventas (
        id SERIAL PRIMARY KEY,
        asesor_id INTEGER,
        ciclo_agricola VARCHAR(30) NOT NULL,
        monto_objetivo_mxn REAL DEFAULT 0.0,
        bolsas_objetivo INTEGER DEFAULT 0,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        activo INTEGER DEFAULT 1,
        FOREIGN KEY (asesor_id) REFERENCES asesores(id)
      )
    `);

    await db.run(`
      CREATE TABLE planificacion_semanal (
        id SERIAL PRIMARY KEY,
        asesor_id INTEGER NOT NULL,
        cliente_id INTEGER NOT NULL,
        fecha_programada DATE NOT NULL,
        objetivo_visita TEXT,
        pronostico_bolsas INTEGER DEFAULT 0,
        pronostico_monto_mxn REAL DEFAULT 0.0,
        realizada INTEGER DEFAULT 0,
        visita_id INTEGER,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (asesor_id) REFERENCES asesores(id),
        FOREIGN KEY (cliente_id) REFERENCES clientes(id),
        FOREIGN KEY (visita_id) REFERENCES crm_visitas(id)
      )
    `);

    await db.run(`
      CREATE TABLE crm_pujas (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL,
        asesor_id INTEGER NOT NULL,
        justificacion TEXT,
        estatus TEXT DEFAULT 'Pendiente',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
        FOREIGN KEY (asesor_id) REFERENCES asesores(id) ON DELETE CASCADE
      )
    `);

    await db.run(`
      CREATE TABLE crm_notificaciones (
        id SERIAL PRIMARY KEY,
        asesor_id INTEGER NOT NULL,
        mensaje TEXT NOT NULL,
        leido INTEGER DEFAULT 0,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (asesor_id) REFERENCES asesores(id) ON DELETE CASCADE
      )
    `);

    console.log('Tables created successfully.');

    // 3. Populate Cuentas Clave
    console.log('Seeding Cuentas Clave...');
    await db.run("INSERT INTO cuentas_clave (tier_name, descuento_mxn) VALUES ('Ninguno / General', 0.0) ON CONFLICT (tier_name) DO NOTHING");
    const ccRows = parseCsvFile('Cuenta clave.csv');
    ccRows.shift(); // skip header
    for (const row of ccRows) {
      if (row.length >= 2) {
        const tier = row[0].trim();
        const desc = parseFloat(row[1].trim());
        await db.run("INSERT INTO cuentas_clave (tier_name, descuento_mxn) VALUES (?, ?) ON CONFLICT (tier_name) DO NOTHING", [tier, desc]);
      }
    }

    // Read SQLite database if it exists to preserve custom usernames and passwords
    const sqlitePath = path.join(__dirname, 'database.sqlite');
    const customUserCredentials = {}; // Map of email/name -> { usuario, password_hash }
    
    if (fs.existsSync(sqlitePath)) {
      console.log('Found local database.sqlite. Reading custom user credentials to preserve passwords and usernames...');
      try {
        const sqlite3 = require('sqlite3').verbose();
        const sqliteDb = new sqlite3.Database(sqlitePath);
        
        const sqliteRows = await new Promise((resolve, reject) => {
          sqliteDb.all("SELECT nombre, usuario, email, password_hash FROM asesores", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        for (const row of sqliteRows) {
          const emailKey = row.email ? row.email.trim().toLowerCase() : '';
          const nameKey = row.nombre ? row.nombre.trim().toLowerCase() : '';
          
          if (emailKey) {
            customUserCredentials[emailKey] = { usuario: row.usuario, password_hash: row.password_hash };
          } else if (nameKey) {
            customUserCredentials[nameKey] = { usuario: row.usuario, password_hash: row.password_hash };
          }
        }
        
        sqliteDb.close();
        console.log(`Loaded custom credentials for ${Object.keys(customUserCredentials).length} advisors.`);
      } catch (err) {
        console.error('Failed to read custom credentials from SQLite (will fall back to CSV defaults):', err.message);
      }
    }

    // 4. Populate Asesores
    console.log('Seeding Asesores...');
    const asesoresRows = parseCsvFile('Asesores.csv');
    asesoresRows.shift();
    for (const row of asesoresRows) {
      if (row.length >= 5) {
        const nombre = row[0].trim();
        const usuarioVal = row[1].trim();
        const nivel = row[2].trim();
        const telefono = row[3].trim();
        let email = row[4] ? row[4].trim() : "";
        const cumpleanos = row[5] ? row[5].trim() : "";

        // If email is empty but usuario looks like an email, use it as email
        if (!email && usuarioVal.includes('@')) {
          email = usuarioVal;
        }
        // Fallback to dummy email to satisfy UNIQUE constraint if both are empty
        if (!email) {
          email = `temp_email_${nombre.replace(/\s+/g, '_').toLowerCase()}@casasgrandes.mx`;
        }

        const emailKey = email.trim().toLowerCase();
        const nameKey = nombre.trim().toLowerCase();
        
        // Use custom credentials if found in SQLite, otherwise use default
        let finalUsuario = usuarioVal;
        let finalPasswordHash = defaultPasswordHash;
        
        if (customUserCredentials[emailKey]) {
          finalUsuario = customUserCredentials[emailKey].usuario;
          finalPasswordHash = customUserCredentials[emailKey].password_hash;
        } else if (customUserCredentials[nameKey]) {
          finalUsuario = customUserCredentials[nameKey].usuario;
          finalPasswordHash = customUserCredentials[nameKey].password_hash;
        }

        await db.run(`
          INSERT INTO asesores (nombre, usuario, nivel_rol, email, telefono, cumpleanos, password_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (email) DO NOTHING
        `, [nombre, finalUsuario, nivel, email, telefono, cumpleanos, finalPasswordHash]);
      }
    }

    // Get asesores lookup for mapping
    const dbAsesores = await db.all("SELECT id, nombre FROM asesores");
    const asesoresLookup = {};
    for (const row of dbAsesores) {
      asesoresLookup[row.nombre.toLowerCase()] = row.id;
    }

    const asesoresHomologation = {
      "juan": asesoresLookup["juan francisco lopez valdez"],
      "bon": asesoresLookup["osvaldo bon lópez"],
      "christian": asesoresLookup["christian alcantar nieblas"],
      "eduardo": asesoresLookup["eduardo leyva"],
      "casa": asesoresLookup["casas grandes"],
      "sigala": asesoresLookup["casa (jose sigala)"],
      "jiova": asesoresLookup["jiovani lópez"],
      "wil": asesoresLookup["wilfredo carrasco flores"]
    };

    function resolveAsesorId(nameStr) {
      const defaultId = asesoresLookup["casas grandes"] || Object.values(asesoresLookup)[0];
      if (!nameStr) return defaultId;
      const nameLower = nameStr.toLowerCase().trim();
      if (asesoresLookup[nameLower]) return asesoresLookup[nameLower];
      for (const [k, v] of Object.entries(asesoresHomologation)) {
        if (nameLower.includes(k)) return v;
      }
      for (const [k, v] of Object.entries(asesoresLookup)) {
        if (nameLower.includes(k) || k.includes(nameLower)) return v;
      }
      return defaultId;
    }

    const dbCuentasClave = await db.all("SELECT id, tier_name FROM cuentas_clave");
    const cuentasClaveLookup = {};
    for (const row of dbCuentasClave) {
      cuentasClaveLookup[row.tier_name.toLowerCase()] = row.id;
    }

    function resolveCuentaClaveId(tierStr) {
      if (!tierStr) return cuentasClaveLookup["ninguno / general"];
      const tierLower = tierStr.toLowerCase().trim();
      if (cuentasClaveLookup[tierLower]) return cuentasClaveLookup[tierLower];
      for (const [k, v] of Object.entries(cuentasClaveLookup)) {
        if (tierLower.includes(k)) return v;
      }
      return cuentasClaveLookup["ninguno / general"];
    }

    // 5. Populate Temporadas
    console.log('Seeding Temporadas...');
    await db.run("INSERT INTO temporadas (actividad, descuento_percentage, estado_operacion) VALUES ('Temporada (Precio Lleno)', 0.0, 'Sumar') ON CONFLICT (actividad) DO NOTHING");
    const temporadasRows = parseCsvFile('Temporadas.csv');
    temporadasRows.shift();
    for (const row of temporadasRows) {
      if (row.length >= 6) {
        const actividad = row[0].trim();
        const inicio = row[1].trim();
        const fin = row[2].trim();
        const desc = row[3].trim() ? parseFloat(row[3].trim()) : 0.0;
        const notas = row[4].trim();
        const estado = row[5].trim();
        await db.run(`
          INSERT INTO temporadas (actividad, fecha_inicio, fecha_fin, descuento_percentage, estado_operacion, notas)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (actividad) DO NOTHING
        `, [actividad, inicio, fin, desc, estado, notas]);
      }
    }

    // 6. Populate Productos (Consolidating Producto.csv and Productos.csv)
    console.log('Seeding Productos...');
    const productsDict = {};

    // Read Producto.csv (seeds and chemicals)
    const productRows = parseCsvFile('Producto.csv');
    productRows.shift();
    for (const row of productRows) {
      if (row.length >= 10) {
        const nombre = row[0].trim().replace(/\n/g, ' ').replace(/\r/g, '');
        const tipo = row[1].trim();
        const listPriceStr = row[2].trim();
        const listPrice = safeFloat(listPriceStr);
        
        const cat = (tipo === "Híbrido") ? "Híbrido" : "Agroquímico";
        const descontar = (row[3].trim().toLowerCase() === "true" || nombre.startsWith("Hipopótamo")) ? 1 : 0;
        
        const flatDescStr = row[5] ? row[5].trim() : "";
        const flatDesc = safeFloat(flatDescStr);
        
        const objStr = row[6] ? row[6].trim() : "";
        const obj = objStr ? parseInt(objStr, 10) : 0;
        
        let baseUsd = 0.0;
        if (descontar === 1) {
          baseUsd = Math.round((listPrice / 100.0) * 100) / 100;
        }

        productsDict[nombre] = {
          producto: nombre,
          tipo_categoria: cat,
          list_price_mxn: listPrice,
          base_usd: baseUsd,
          descuento_fijo_quimicos: flatDesc,
          objetivo_anual: obj,
          descontar: descontar
        };
      }
    }

    // Read Productos.csv (fertilizers and others)
    const productsCsvRows = parseCsvFile('Productos.csv');
    productsCsvRows.shift();
    for (const row of productsCsvRows) {
      if (row.length >= 4) {
        const nombre = row[1].trim().replace(/\n/g, ' ').replace(/\r/g, '');
        const costStr = row[3].trim();
        const cost = safeFloat(costStr);
        
        if (!productsDict[nombre] && nombre) {
          productsDict[nombre] = {
            producto: nombre,
            tipo_categoria: "Fertilizante",
            list_price_mxn: cost,
            base_usd: 0.0,
            descuento_fijo_quimicos: 0.0,
            objetivo_anual: 0,
            descontar: 0
          };
        }
      }
    }

    // Insert products into PostgreSQL
    for (const prodData of Object.values(productsDict)) {
      await db.run(`
        INSERT INTO productos (producto, tipo_categoria, list_price_mxn, base_usd, descuento_fijo_quimicos, objetivo_anual, descontar)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (producto) DO NOTHING
      `, [
        prodData.producto,
        prodData.tipo_categoria,
        prodData.list_price_mxn,
        prodData.base_usd,
        prodData.descuento_fijo_quimicos,
        prodData.objetivo_anual,
        prodData.descontar
      ]);
    }

    // 7. Populate Clientes (Agricultores)
    console.log('Seeding Clientes...');
    const agricultoresRows = parseCsvFile('Agricultores.csv');
    agricultoresRows.shift();
    for (const row of agricultoresRows) {
      if (row.length >= 1) {
        const nombre = row[0].trim();
        if (!nombre) continue;
        const asesorStr = row[1] ? row[1].trim() : "";
        const ccStr = row[2] ? row[2].trim() : "";
        const clave = row[3] ? row[3].trim() : "";
        const contacto = row[4] ? row[4].trim() : "";
        const telefono = row[5] ? row[5].trim() : "";
        const correo = row[6] ? row[6].trim() : "";
        const cumpleanos = row[7] ? row[7].trim() : "";
        const estado = row[8] ? row[8].trim() : "Cliente";
        const ubicacion = row[9] ? row[9].trim() : "";
        const superficie = row[10] ? row[10].trim() : "";
        
        const asesorId = resolveAsesorId(asesorStr);
        const ccId = resolveCuentaClaveId(ccStr);
        
        await db.run(`
          INSERT INTO clientes (nombre, asesor_id, cuenta_clave_id, contacto, telefono, correo, cumpleanos, estado_status, ubicacion, superficie_text)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (nombre) DO UPDATE SET 
            asesor_id = EXCLUDED.asesor_id,
            cuenta_clave_id = EXCLUDED.cuenta_clave_id,
            contacto = EXCLUDED.contacto,
            telefono = EXCLUDED.telefono,
            correo = EXCLUDED.correo,
            cumpleanos = EXCLUDED.cumpleanos,
            estado_status = EXCLUDED.estado_status,
            ubicacion = EXCLUDED.ubicacion,
            superficie_text = EXCLUDED.superficie_text
        `, [nombre, asesorId, ccId, contacto, telefono, correo, cumpleanos, estado, ubicacion, superficie]);
      }
    }

    // Load lookups for clients and products
    const dbClientes = await db.all("SELECT id, nombre FROM clientes");
    const clientesLookup = {};
    for (const row of dbClientes) {
      clientesLookup[row.nombre.toLowerCase()] = row.id;
    }

    function resolveClienteId(nameStr) {
      if (!nameStr) return null;
      const nameLower = nameStr.toLowerCase().trim();
      if (clientesLookup[nameLower]) return clientesLookup[nameLower];
      for (const [k, v] of Object.entries(clientesLookup)) {
        if (nameLower.includes(k) || k.includes(nameLower)) return v;
      }
      return null;
    }

    const dbProductos = await db.all("SELECT id, producto FROM productos");
    const productosLookup = {};
    for (const row of dbProductos) {
      productosLookup[row.producto.toLowerCase()] = row.id;
    }

    function resolveProductoId(prodStr) {
      if (!prodStr) return null;
      const prodLower = prodStr.toLowerCase().trim();
      if (productosLookup[prodLower]) return productosLookup[prodLower];
      
      const homol = {
        "hipopotamo acc": "hipopótamo acceleron",
        "rinoceronte acc": "rinoceronte acceleron",
        "armadillo acc": "armadillo acceleron",
        "armadillo p": "armadillo poncho",
        "a7573 p": "a-7573 poncho",
        "delfin acc": "delfin",
        "faena fuerte 1l": "faena fuerte 1l",
        "faena clásica 1l": "faena clásica 1l",
        "urea": "urea",
        "amoniaco": "amoniaco",
        "sulfato de amonio": "sulfato de amonio",
        "map (11-52-00)": "map (11-52-00)",
        "triple 16": "triple 16",
        "uan-32": "uan-32"
      };

      for (const [k, v] of Object.entries(homol)) {
        if (prodLower.includes(k)) return productosLookup[v];
      }
      for (const [k, v] of Object.entries(productosLookup)) {
        if (prodLower.includes(k) || k.includes(prodLower)) return v;
      }
      return null;
    }

    const dbTemporadas = await db.all("SELECT id, actividad FROM temporadas");
    const temporadasLookup = {};
    for (const row of dbTemporadas) {
      temporadasLookup[row.actividad.toLowerCase()] = row.id;
    }

    function resolveTemporadaId(tempStr) {
      if (!tempStr) return temporadasLookup["temporada (precio lleno)"];
      const tempLower = tempStr.toLowerCase().trim();
      
      const monthsMap = {
        "jul": "precio jul-sep15",
        "sep": "precio 16 sep-oct",
        "oct": "precio 16 sep-oct",
        "nov": "precio nov-dic",
        "dic": "precio nov-dic",
        "ene": "precio pv ene-feb",
        "feb": "precio pv ene-feb",
        "mzo": "precio pv hasta 16 mzo"
      };

      for (const [k, v] of Object.entries(monthsMap)) {
        if (tempLower.includes(k)) return temporadasLookup[v];
      }
      for (const [k, v] of Object.entries(temporadasLookup)) {
        if (tempLower.includes(k)) return v;
      }
      return temporadasLookup["temporada (precio lleno)"];
    }

    // 8. Populate Cotizaciones & Detalles (Control.csv)
    console.log('Seeding Cotizaciones and Detalles...');
    const controlRows = parseCsvFile('Control.csv');
    controlRows.shift();
    const quotesCache = {};

    for (let idx = 0; idx < controlRows.length; idx++) {
      const row = controlRows[idx];
      if (row.length < 20 || !row[0].trim()) continue;
      
      const fecha = row[0].trim();
      const clienteStr = row[1].trim();
      const ciclo = row[3].trim();
      const asesorStr = row[4].trim();
      const condPago = row[5].trim();
      let folio = row[6].trim();
      const mes = row[7].trim();
      const prodStr = row[8].trim();
      
      const qtyOrd = row[9].trim() ? parseInt(row[9].trim(), 10) : 0;
      const qtyEnt = row[10].trim() ? parseInt(row[10].trim(), 10) : 0;
      
      const priceUnit = safeFloat(row[12]);
      const priceList = safeFloat(row[14], priceUnit);
      const priceNet = safeFloat(row[17], priceUnit);
      const total = safeFloat(row[18], qtyOrd * priceNet);
      const status = row[19].trim();
      const anticipo = row[20] ? safeFloat(row[20]) : 0.0;
      
      const notes = row[29] ? row[29].trim() : "";
      const authByStr = row[30] ? row[30].trim() : "";
      const finan = row[32] ? row[32].trim() : "";

      let clienteId = resolveClienteId(clienteStr);
      if (!clienteId) {
        await db.run("INSERT INTO clientes (nombre, estado_status) VALUES (?, 'Cliente') ON CONFLICT (nombre) DO NOTHING", [clienteStr]);
        const updatedClientes = await db.all("SELECT id, nombre FROM clientes WHERE nombre = ?", [clienteStr]);
        if (updatedClientes.length > 0) {
          clientesLookup[clienteStr.toLowerCase()] = updatedClientes[0].id;
          clienteId = updatedClientes[0].id;
        }
      }

      const asesorId = resolveAsesorId(asesorStr);
      const prodId = resolveProductoId(prodStr);
      const tempId = resolveTemporadaId(mes);
      const authId = authByStr ? resolveAsesorId(authByStr) : null;

      if (!prodId) continue;
      if (!folio) folio = `TEMP-F-${idx}`;

      if (!quotesCache[folio]) {
        quotesCache[folio] = {
          fecha_creacion: fecha,
          cliente_id: clienteId,
          asesor_id: asesorId,
          ciclo_agricola: ciclo,
          condiciones_pago: condPago,
          folio_cotizacion: folio,
          mes: mes,
          estatus: ["CONTADO", "CREDITO", "PAGADO"].includes(status) ? "Vendido" : "Borrador",
          total_mxn: 0.0,
          anticipo_apartado: 0.0,
          notas: notes,
          autorizado_por_id: authId,
          financiera: finan,
          items: []
        };
      }

      quotesCache[folio].total_mxn += total;
      quotesCache[folio].anticipo_apartado += anticipo * qtyOrd;
      if (notes && !quotesCache[folio].notas.includes(notes)) {
        quotesCache[folio].notas += " | " + notes;
      }

      quotesCache[folio].items.push({
        producto_id: prodId,
        temporada_id: tempId,
        cantidad_ordenada: qtyOrd,
        cantidad_entregada: qtyEnt,
        precio_lista_unitario: priceList,
        precio_neto_unitario: priceNet,
        subtotal_mxn: total
      });
    }

    // Insert grouped quotes and details into PostgreSQL
    for (const q of Object.values(quotesCache)) {
      const res = await db.run(`
        INSERT INTO cotizaciones (fecha_creacion, cliente_id, asesor_id, ciclo_agricola, condiciones_pago, folio_cotizacion, mes, estatus, total_mxn, anticipo_apartado, notas, autorizado_por_id, financiera)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (folio_cotizacion) DO NOTHING
      `, [q.fecha_creacion, q.cliente_id, q.asesor_id, q.ciclo_agricola, q.condiciones_pago, q.folio_cotizacion, q.mes, q.estatus, q.total_mxn, q.anticipo_apartado, q.notas, q.autorizado_por_id, q.financiera]);
      
      let cotId = res.id;
      if (!cotId) {
        // If not inserted because of conflict, fetch the existing ID
        const existing = await db.get("SELECT id FROM cotizaciones WHERE folio_cotizacion = ?", [q.folio_cotizacion]);
        if (existing) cotId = existing.id;
      }

      if (cotId) {
        for (const item of q.items) {
          await db.run(`
            INSERT INTO cotizacion_detalles (cotizacion_id, producto_id, temporada_id, cantidad_ordenada, cantidad_entregada, precio_lista_unitario, precio_neto_unitario, subtotal_mxn)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [cotId, item.producto_id, item.temporada_id, item.cantidad_ordenada, item.cantidad_entregada, item.precio_lista_unitario, item.precio_neto_unitario, item.subtotal_mxn]);
        }
      }
    }

    // Load lookups of cotizaciones for movements
    const dbCotizaciones = await db.all("SELECT id, folio_cotizacion FROM cotizaciones");
    const cotFolioToId = {};
    for (const row of dbCotizaciones) {
      cotFolioToId[row.folio_cotizacion] = row.id;
    }

    // 9. Populate Almacén Movimientos (Almacen.csv)
    console.log('Seeding Almacen Movimientos...');
    const almacenRows = parseCsvFile('Almacen.csv');
    almacenRows.shift();

    for (const row of almacenRows) {
      if (row.length < 13) continue;
      
      const clienteStr = row[0].trim();
      const asesorStr = row[1].trim();
      const ordenFolio = row[3].trim();
      const precioStr = row[4].trim();
      const tipoVenta = row[5].trim();
      const prodStr = row[6].trim();
      const fecha = row[7].trim();
      
      const compras = row[8].trim() ? parseFloat(row[8].trim()) : 0.0;
      const entradas = row[9].trim() ? parseFloat(row[9].trim()) : 0.0;
      const salidas = row[10].trim() ? parseFloat(row[10].trim()) : 0.0;
      const entregadas = row[11].trim() ? parseFloat(row[11].trim()) : 0.0;
      const existencias = row[12].trim() ? parseFloat(row[12].trim()) : 0.0;
      const notas = row[13] ? row[13].trim() : "";

      const prodId = resolveProductoId(prodStr);
      if (!prodId) continue;

      const cotId = cotFolioToId[ordenFolio] || null;
      const asesorId = resolveAsesorId(asesorStr);

      let tipoMov = '';
      if (tipoVenta.toLowerCase() === "compra") {
        tipoMov = "Entrada de Compra";
      } else if (tipoVenta.toLowerCase() === "contado") {
        tipoMov = "Salida por Contado";
      } else if (tipoVenta.toLowerCase() === "crédito") {
        tipoMov = "Salida por Crédito";
      } else {
        if (compras > 0 || entradas > 0) {
          tipoMov = "Entrada de Compra";
        } else {
          tipoMov = "Salida por Entrega";
        }
      }

      const cantEnt = Math.max(compras, entradas);
      const cantSal = Math.max(salidas, entregadas);

      await db.run(`
        INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, cotizacion_id, asesor_id, referencia_factura, notas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [fecha, tipoMov, prodId, cantEnt, cantSal, existencias, cotId, asesorId, ordenFolio, notas]);
    }

    // 10. Print Diagnostics
    console.log('Migration and seeding completed successfully!');
    
    const countAsesores = await db.get("SELECT count(*) as count FROM asesores");
    const countClientes = await db.get("SELECT count(*) as count FROM clientes");
    const countProductos = await db.get("SELECT count(*) as count FROM productos");
    const countTemporadas = await db.get("SELECT count(*) as count FROM temporadas");
    const countCotizaciones = await db.get("SELECT count(*) as count FROM cotizaciones");
    const countDetalles = await db.get("SELECT count(*) as count FROM cotizacion_detalles");
    const countAlmacen = await db.get("SELECT count(*) as count FROM almacen_movimientos");

    console.log('------------------------------------------------');
    console.log(`Migrated Asesores: ${countAsesores.count}`);
    console.log(`Migrated Clientes: ${countClientes.count}`);
    console.log(`Migrated Productos: ${countProductos.count}`);
    console.log(`Migrated Temporadas: ${countTemporadas.count}`);
    console.log(`Migrated Cotizaciones (Headers): ${countCotizaciones.count}`);
    console.log(`Migrated Cotizacion Detalles (Items): ${countDetalles.count}`);
    console.log(`Migrated Almacen Movimientos: ${countAlmacen.count}`);
    console.log('------------------------------------------------');

  } catch (err) {
    console.error('Migration failed with error:', err);
  } finally {
    // Terminate raw pool connection
    if (db.pool) {
      await db.pool.end();
      console.log('PostgreSQL client pool disconnected.');
    }
  }
}

// Run if called directly
if (require.main === module) {
  runMigration();
}
