const { Pool, types } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

// Force PostgreSQL DATE columns (OID 1082) to be returned as simple strings (YYYY-MM-DD)
types.setTypeParser(1082, (val) => val);

const connectionString = process.env.DATABASE_URL;

// SSL is usually required in production, but not for localhost
const isLocal = !connectionString || connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE || 'casas_grandes',
      ssl: (process.env.PGHOST === 'localhost' || !process.env.PGHOST) ? false : { rejectUnauthorized: false }
    });

// Database auto-migration / schema updates
async function initSchema() {
  try {
    await pool.query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS disponible_para_puja INTEGER DEFAULT 0');
    await pool.query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cliente_principal_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL');
    await pool.query('ALTER TABLE asesores ADD COLUMN IF NOT EXISTS calificacion REAL DEFAULT 5.0');
    await pool.query('ALTER TABLE metas_ventas ADD COLUMN IF NOT EXISTS meta_faena REAL DEFAULT 0.0');
    await pool.query('ALTER TABLE metas_ventas ADD COLUMN IF NOT EXISTS meta_clavis REAL DEFAULT 0.0');
    await pool.query('ALTER TABLE metas_ventas ADD COLUMN IF NOT EXISTS meta_cropprotection REAL DEFAULT 0.0');
    await pool.query('ALTER TABLE metas_ventas ADD COLUMN IF NOT EXISTS meta_cosecha REAL DEFAULT 0.0');
    await pool.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS clave TEXT');
    await pool.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS descripcion TEXT');
    await pool.query('ALTER TABLE productos ADD COLUMN IF NOT EXISTS tamanos TEXT');
    await pool.query('ALTER TABLE cotizacion_detalles ADD COLUMN IF NOT EXISTS tamano TEXT');
    await pool.query('ALTER TABLE almacen_movimientos ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT \'Agroquímicos\'');
    await pool.query('ALTER TABLE almacen_movimientos ADD COLUMN IF NOT EXISTS lote TEXT');
    await pool.query('ALTER TABLE almacen_movimientos ADD COLUMN IF NOT EXISTS tamano TEXT');

    // Seed default known sizes for existing products if not configured yet
    await pool.query(`
      UPDATE productos 
      SET tamanos = 'PW1, PW2' 
      WHERE tamanos IS NULL AND (UPPER(producto) LIKE '%A-7573%PONCHO%' OR UPPER(producto) LIKE '%A7573%PONCHO%')
    `);
    await pool.query(`
      UPDATE productos 
      SET tamanos = 'BT1, BT2, BT3, BW1, BW2, PT1, PT2, PT3' 
      WHERE tamanos IS NULL AND (UPPER(producto) LIKE '%A-7573%ACCELERON%' OR UPPER(producto) LIKE '%A-7573%ACELERON%' OR UPPER(producto) LIKE '%A7573%ACCELERON%')
    `);
    await pool.query(`
      UPDATE productos 
      SET tamanos = 'BT1, BT2, BT3, BW1, BW2, PT1, PT2, PT3, PW1, PW2' 
      WHERE tamanos IS NULL AND (UPPER(producto) LIKE '%HIPOP%ACCELERON%' OR UPPER(producto) LIKE '%CALAMAR%')
    `);
    await pool.query('ALTER TABLE almacen_movimientos ADD COLUMN IF NOT EXISTS opcion_operacion TEXT');
    await pool.query('ALTER TABLE almacen_movimientos ADD COLUMN IF NOT EXISTS numero_remision TEXT');
    await pool.query('ALTER TABLE almacen_movimientos ADD COLUMN IF NOT EXISTS numero_movimiento TEXT');
    await pool.query('ALTER TABLE almacen_movimientos ADD COLUMN IF NOT EXISTS precio_venta REAL DEFAULT 0.0');
    await pool.query('ALTER TABLE almacen_movimientos ADD COLUMN IF NOT EXISTS proveedor_cliente TEXT');
    await pool.query('ALTER TABLE almacen_movimientos ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id)');
    await pool.query(`
      UPDATE almacen_movimientos 
      SET categoria = 'Semilla' 
      WHERE categoria = 'Híbrido' 
         OR producto_id IN (SELECT id FROM productos WHERE tipo_categoria = 'Híbrido' OR tipo_categoria = 'Semilla')
    `);
    await pool.query('ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS prospecto_id INTEGER');
    await pool.query('ALTER TABLE cuentas_clave ADD COLUMN IF NOT EXISTS descripcion TEXT');
    // The original import stored this hash while documenting password123 as the default,
    // but it does not validate that password. Repair only accounts that still have it.
    await pool.query(
      'UPDATE asesores SET password_hash = $1 WHERE password_hash = $2',
      [
        '$2b$10$fgcwgOeS3gyws4l95smgDOBhuagB/mIxKZmg5UgJLAfE5BFXBN0Vq',
        '$2b$10$Ly0wcxrAZmfzIOSLPRzwdO3YxJQ2dPT6osFpn0j0hlAT9uK7ojTKm'
      ]
    );
    for (const tierName of ['Adquirir', 'Desarrollar', 'Retener', 'Retener GOLD']) {
      await pool.query(
        'INSERT INTO cuentas_clave (tier_name, descripcion, descuento_mxn) SELECT $1, NULL, 0 WHERE NOT EXISTS (SELECT 1 FROM cuentas_clave WHERE LOWER(tier_name) = LOWER($1))',
        [tierName]
      );
    }
    await pool.query("CREATE INDEX IF NOT EXISTS idx_productos_clave ON productos (clave) WHERE clave IS NOT NULL AND clave <> ''");
    await pool.query('CREATE INDEX IF NOT EXISTS idx_clientes_activos_nombre ON clientes (nombre) WHERE activo = 1');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_clientes_asesor_activo_nombre ON clientes (asesor_id, nombre) WHERE activo = 1');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_clientes_principal ON clientes (cliente_principal_id) WHERE cliente_principal_id IS NOT NULL');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizaciones_asesor_fecha ON cotizaciones (asesor_id, fecha_creacion DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizaciones_asesor_ciclo_estatus ON cotizaciones (asesor_id, ciclo_agricola, estatus)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente_estatus ON cotizaciones (cliente_id, estatus)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizacion_detalles_cotizacion ON cotizacion_detalles (cotizacion_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_planificacion_asesor_realizada ON planificacion_semanal (asesor_id, realizada)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_planificacion_estado_fecha ON planificacion_semanal (realizada, fecha_programada)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizaciones_prospecto ON cotizaciones (prospecto_id) WHERE prospecto_id IS NOT NULL');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_almacen_mov_prod ON almacen_movimientos (producto_id, id DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_almacen_mov_cli ON almacen_movimientos (cliente_id) WHERE cliente_id IS NOT NULL');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_almacen_mov_cot ON almacen_movimientos (cotizacion_id) WHERE cotizacion_id IS NOT NULL');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cotizacion_adjuntos (
        id SERIAL PRIMARY KEY,
        cotizacion_id INTEGER NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
        nombre_archivo VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        contenido BYTEA NOT NULL,
        tamano_bytes INTEGER NOT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizacion_adjuntos_cotizacion ON cotizacion_adjuntos (cotizacion_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_metas_asesor_ciclo_activo ON metas_ventas (asesor_id, ciclo_agricola) WHERE activo = 1');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_pujas (
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_notificaciones (
        id SERIAL PRIMARY KEY,
        asesor_id INTEGER NOT NULL,
        mensaje TEXT NOT NULL,
        leido INTEGER DEFAULT 0,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (asesor_id) REFERENCES asesores(id) ON DELETE CASCADE
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_agentes_config (
        id SERIAL PRIMARY KEY,
        agente_id TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL,
        activo INTEGER DEFAULT 0,
        configuracion TEXT DEFAULT '{}',
        ultima_ejecucion TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_agentes_logs (
        id SERIAL PRIMARY KEY,
        agente_id TEXT NOT NULL,
        tipo_evento TEXT NOT NULL,
        mensaje TEXT NOT NULL,
        detalle TEXT,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_ceo_propuestas (
        id SERIAL PRIMARY KEY,
        propuesta_json TEXT NOT NULL,
        propuesta_markdown TEXT NOT NULL,
        estatus TEXT DEFAULT 'Pendiente',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add ciclo_id column to crm_ceo_propuestas
    await pool.query('ALTER TABLE crm_ceo_propuestas ADD COLUMN IF NOT EXISTS ciclo_id INTEGER');

    // Create ciclos table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ciclos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(50) UNIQUE NOT NULL,
        activo INTEGER DEFAULT 1,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create metas_globales table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS metas_globales (
        id SERIAL PRIMARY KEY,
        ciclo_id INTEGER REFERENCES ciclos(id) ON DELETE CASCADE,
        producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
        cantidad_objetivo REAL DEFAULT 0.0,
        monto_objetivo_mxn REAL DEFAULT 0.0,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ciclo_id, producto_id)
      )
    `);

    // Seed default cycles
    await pool.query(`
      INSERT INTO ciclos (nombre, activo)
      VALUES ('O-I 2026', 1), ('P-V 2026', 1)
      ON CONFLICT (nombre) DO NOTHING
    `);

    await pool.query(`
      INSERT INTO crm_agentes_config (agente_id, nombre, activo, configuracion)
      VALUES 
        ('ceo', 'CEO Agent', 0, '{"prompt_adicional": "", "frecuencia_horas": 24}'),
        ('coordinador', 'Coordinador Agent', 0, '{"prompt_adicional": "", "frecuencia_horas": 12}'),
        ('outreach', 'Outreach Agent', 0, '{"prompt_adicional": "", "frecuencia_horas": 12}')
      ON CONFLICT (agente_id) DO NOTHING
    `);

    // Create crm_etapas_programacion table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_etapas_programacion (
        id SERIAL PRIMARY KEY,
        clave VARCHAR(50) UNIQUE NOT NULL,
        nombre VARCHAR(100) NOT NULL,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        color VARCHAR(20) NOT NULL
      )
    `);

    const currentYear = new Date().getFullYear();
    await pool.query(`
      INSERT INTO crm_etapas_programacion (clave, nombre, fecha_inicio, fecha_fin, color)
      VALUES
        ('V', 'Venta', '${currentYear}-07-01', '${currentYear + 1}-01-31', '#60a5fa'),
        ('DV', 'Desarrollo Vegetativo', '${currentYear - 1}-10-01', '${currentYear}-03-31', '#34d399'),
        ('DR', 'Desarrollo Reproductivo', '${currentYear}-01-01', '${currentYear}-04-30', '#f59e0b'),
        ('C', 'Cosecha', '${currentYear}-03-01', '${currentYear}-07-31', '#ef4444')
      ON CONFLICT (clave) DO NOTHING
    `);

    // Repair only the dates created by the previous default-seed error.
    // Manually configured stages do not match these exact values and stay untouched.
    await pool.query(`
      UPDATE crm_etapas_programacion
      SET fecha_inicio = '${currentYear}-03-01', fecha_fin = '${currentYear}-07-31'
      WHERE clave = 'C'
        AND fecha_inicio = '${currentYear + 1}-03-01'
        AND fecha_fin = '${currentYear + 1}-07-31'
    `);
    await pool.query(`
      UPDATE crm_etapas_programacion
      SET fecha_inicio = '${currentYear}-01-01', fecha_fin = '${currentYear}-04-30'
      WHERE clave = 'DR'
        AND fecha_inicio = '${currentYear + 1}-01-01'
        AND fecha_fin = '${currentYear + 1}-04-30'
    `);
    await pool.query(`
      UPDATE crm_etapas_programacion
      SET fecha_inicio = '${currentYear - 1}-10-01', fecha_fin = '${currentYear}-03-31'
      WHERE clave = 'DV'
        AND fecha_inicio = '${currentYear}-10-01'
        AND fecha_fin = '${currentYear + 1}-03-31'
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_reportes_etapa (
        id SERIAL PRIMARY KEY,
        planificacion_id INTEGER,
        visita_id INTEGER,
        cliente_id INTEGER,
        asesor_id INTEGER,
        etapa_clave VARCHAR(10) NOT NULL,
        fecha_reporte DATE NOT NULL,
        respuestas JSONB DEFAULT '{}'::jsonb,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tiene_cartera_pendiente INTEGER DEFAULT 0,
        monto_cartera_pendiente REAL DEFAULT 0.0,
        tiene_beneficio_contrato INTEGER DEFAULT 0,
        fuente_integracion TEXT,
        actualizado_integracion_en TIMESTAMP,
        UNIQUE(planificacion_id, etapa_clave)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_prospectos (
        id SERIAL PRIMARY KEY,
        planificacion_id INTEGER UNIQUE REFERENCES planificacion_semanal(id) ON DELETE SET NULL,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        asesor_id INTEGER NOT NULL REFERENCES asesores(id),
        estado VARCHAR(30) NOT NULL DEFAULT 'Prospecto',
        cotizacion_id INTEGER,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'cotizaciones_prospecto_id_fkey'
        ) THEN
          ALTER TABLE cotizaciones
          ADD CONSTRAINT cotizaciones_prospecto_id_fkey
          FOREIGN KEY (prospecto_id) REFERENCES crm_prospectos(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_prospectos_asesor_estado ON crm_prospectos (asesor_id, estado)');

    // Create crm_precios_mensuales table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_precios_mensuales (
        id SERIAL PRIMARY KEY,
        producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
        mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
        precio REAL DEFAULT 0.0,
        promo_dinero REAL DEFAULT 0.0,
        promo_porcentaje REAL DEFAULT 0.0,
        UNIQUE(producto_id, mes)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_respaldos_limpieza_operacion (
        id SERIAL PRIMARY KEY,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        creado_por_id INTEGER REFERENCES asesores(id),
        alcance TEXT NOT NULL,
        resumen JSONB NOT NULL,
        datos JSONB NOT NULL
      )
    `);

    // Auto-restore planificacion_semanal from backup table if planificacion_semanal is empty
    try {
      const planCountRes = await pool.query('SELECT count(*)::int AS count FROM planificacion_semanal');
      if (planCountRes.rows[0]?.count === 0) {
        const backupPlanRes = await pool.query(`
          SELECT datos->'planificacion' AS planificacion
          FROM crm_respaldos_limpieza_operacion
          WHERE datos->'planificacion' IS NOT NULL 
            AND jsonb_array_length(datos->'planificacion') > 0
          ORDER BY id DESC LIMIT 1
        `);
        if (backupPlanRes.rows.length > 0 && Array.isArray(backupPlanRes.rows[0].planificacion)) {
          const planItems = backupPlanRes.rows[0].planificacion;
          for (const item of planItems) {
            if (item && item.asesor_id && item.cliente_id) {
              await pool.query(`
                INSERT INTO planificacion_semanal (id, asesor_id, cliente_id, fecha_programada, objetivo_visita, pronostico_bolsas, pronostico_monto_mxn, realizada, visita_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO NOTHING
              `, [
                item.id,
                item.asesor_id,
                item.cliente_id,
                item.fecha_programada,
                item.objetivo_visita || '',
                item.pronostico_bolsas || 0,
                item.pronostico_monto_mxn || 0.0,
                item.realizada || 0,
                item.visita_id || null
              ]);
            }
          }
          await pool.query("SELECT setval('planificacion_semanal_id_seq', (SELECT COALESCE(MAX(id), 1) FROM planificacion_semanal))");
          console.log(`Auto-restored ${planItems.length} planning records from operational backup.`);
        }
      }

      // Auto-sync missing crm_visitas into planificacion_semanal
      try {
        await pool.query(`
          INSERT INTO planificacion_semanal (asesor_id, cliente_id, fecha_programada, objetivo_visita, pronostico_bolsas, pronostico_monto_mxn, realizada, visita_id)
          SELECT v.asesor_id, v.cliente_id, v.fecha_visita::date, COALESCE(v.comentarios_bitacora, 'Visita CRM Registrada'), 0, 0.0, 1, v.id
          FROM crm_visitas v
          WHERE NOT EXISTS (
            SELECT 1 FROM planificacion_semanal p WHERE p.visita_id = v.id OR (p.asesor_id = v.asesor_id AND p.cliente_id = v.cliente_id AND p.fecha_programada::text = v.fecha_visita::text)
          )
        `);
      } catch (syncErr) {
        console.warn('Auto-sync of crm_visitas to planificacion_semanal skipped:', syncErr.message);
      }
    } catch (restoreErr) {
      console.warn('Auto-restore check for planificacion_semanal skipped:', restoreErr.message);
    }

    // Create comision_reglas_base table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comision_reglas_base (
        id SERIAL PRIMARY KEY,
        producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
        tipo_categoria TEXT,
        condicion_pago TEXT,
        tipo_valor TEXT NOT NULL CHECK (tipo_valor IN ('porcentaje', 'monto_fijo')),
        valor REAL NOT NULL,
        activo INTEGER DEFAULT 1,
        CONSTRAINT chk_producto_o_categoria CHECK (producto_id IS NOT NULL OR tipo_categoria IS NOT NULL)
      )
    `);

    // Create comision_reglas_temporada table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comision_reglas_temporada (
        id SERIAL PRIMARY KEY,
        temporada_id INTEGER NOT NULL REFERENCES temporadas(id) ON DELETE CASCADE,
        producto_id INTEGER REFERENCES productos(id),
        tipo_valor TEXT NOT NULL CHECK (tipo_valor IN ('porcentaje', 'monto_fijo')),
        valor REAL NOT NULL,
        comportamiento TEXT NOT NULL CHECK (comportamiento IN ('sobrescribir', 'sumar')),
        activo INTEGER DEFAULT 1
      )
    `);

    // Create comision_bonos_metas table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comision_bonos_metas (
        id SERIAL PRIMARY KEY,
        ciclo_agricola TEXT NOT NULL,
        porcentaje_meta_requerido REAL NOT NULL,
        bono_mxn REAL NOT NULL,
        activo INTEGER DEFAULT 1
      )
    `);

    // Create comisiones_generadas table and indexes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comisiones_generadas (
        id SERIAL PRIMARY KEY,
        cotizacion_id INTEGER REFERENCES cotizaciones(id) ON DELETE CASCADE,
        cotizacion_detalle_id INTEGER REFERENCES cotizacion_detalles(id) ON DELETE CASCADE,
        asesor_id INTEGER NOT NULL REFERENCES asesores(id),
        fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        monto_base_aplicado REAL NOT NULL,
        monto_temporada_aplicado REAL DEFAULT 0.0,
        total_comision_mxn REAL NOT NULL,
        estatus TEXT NOT NULL DEFAULT 'Pendiente',
        notas TEXT
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_comisiones_asesor ON comisiones_generadas(asesor_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_comisiones_estatus ON comisiones_generadas(estatus)');

    // Ensure ON DELETE CASCADE is active for existing comisiones_generadas constraints
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE table_name = 'comisiones_generadas' AND constraint_name = 'comisiones_generadas_cotizacion_id_fkey'
        ) THEN
          ALTER TABLE comisiones_generadas DROP CONSTRAINT comisiones_generadas_cotizacion_id_fkey;
          ALTER TABLE comisiones_generadas 
            ADD CONSTRAINT comisiones_generadas_cotizacion_id_fkey 
            FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE table_name = 'comisiones_generadas' AND constraint_name = 'comisiones_generadas_cotizacion_detalle_id_fkey'
        ) THEN
          ALTER TABLE comisiones_generadas DROP CONSTRAINT comisiones_generadas_cotizacion_detalle_id_fkey;
          ALTER TABLE comisiones_generadas 
            ADD CONSTRAINT comisiones_generadas_cotizacion_detalle_id_fkey 
            FOREIGN KEY (cotizacion_detalle_id) REFERENCES cotizacion_detalles(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    console.log('PostgreSQL schema auto-updates checked/applied successfully.');
  } catch (err) {
    console.error('Error checking/applying PostgreSQL schema updates:', err.message);
    throw err;
  }
}
pool.on('connect', () => {
  console.log('Successfully connected to PostgreSQL pool.');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

// Helper function to translate SQLite query syntax to PostgreSQL
function rewriteQuery(sql) {
  let index = 1;
  let rewritten = sql.replace(/\?/g, () => `$${index++}`);
  
  // Auto-append RETURNING id for standard insert queries so they return the generated primary key
  if (/^\s*insert\s+into/i.test(rewritten) && !/returning/i.test(rewritten)) {
    rewritten = rewritten.trim().replace(/;+$/, '').trim();
    rewritten += ' RETURNING id';
  }
  
  return rewritten;
}

let initSchemaPromise = null;
function ensureSchema() {
  if (!initSchemaPromise) {
    initSchemaPromise = initSchema();
  }
  return initSchemaPromise;
}
ensureSchema();

module.exports = {
  initSchema: ensureSchema,
  get: async (sql, params = []) => {
    await ensureSchema();
    const rewritten = rewriteQuery(sql);
    try {
      const result = await pool.query(rewritten, params);
      return result.rows[0]; // Returns the single row or undefined if none found
    } catch (err) {
      console.error(`PostgreSQL query error (get) for: "${sql}"`, err.message);
      throw err;
    }
  },
  
  all: async (sql, params = []) => {
    await ensureSchema();
    const rewritten = rewriteQuery(sql);
    try {
      const result = await pool.query(rewritten, params);
      return result.rows; // Returns array of rows
    } catch (err) {
      console.error(`PostgreSQL query error (all) for: "${sql}"`, err.message);
      throw err;
    }
  },
  
  run: async (sql, params = []) => {
    await ensureSchema();
    const rewritten = rewriteQuery(sql);
    try {
      const result = await pool.query(rewritten, params);
      const id = result.rows[0]?.id || null;
      return { id, changes: result.rowCount }; // Returns object matching SQLite's interface
    } catch (err) {
      console.error(`PostgreSQL query error (run) for: "${sql}"`, err.message);
      throw err;
    }
  },
  
  transaction: async (callback) => {
    await ensureSchema();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tx = {
        get: async (sql, params = []) => {
          const rewritten = rewriteQuery(sql);
          const result = await client.query(rewritten, params);
          return result.rows[0];
        },
        all: async (sql, params = []) => {
          const rewritten = rewriteQuery(sql);
          const result = await client.query(rewritten, params);
          return result.rows;
        },
        run: async (sql, params = []) => {
          const rewritten = rewriteQuery(sql);
          const result = await client.query(rewritten, params);
          const id = result.rows[0]?.id || null;
          return { id, changes: result.rowCount };
        },
        query: (text, params) => client.query(text, params)
      };
      const res = await callback(tx);
      await client.query('COMMIT');
      return res;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  rewriteQuery,
  initSchemaPromise,
  initSchema,
  pool // Expose raw pool in case direct operations are needed
};
