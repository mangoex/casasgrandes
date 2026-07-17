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
    await pool.query('ALTER TABLE asesores ADD COLUMN IF NOT EXISTS calificacion REAL DEFAULT 5.0');
    await pool.query('ALTER TABLE metas_ventas ADD COLUMN IF NOT EXISTS meta_faena REAL DEFAULT 0.0');
    await pool.query('ALTER TABLE metas_ventas ADD COLUMN IF NOT EXISTS meta_clavis REAL DEFAULT 0.0');
    await pool.query('ALTER TABLE metas_ventas ADD COLUMN IF NOT EXISTS meta_cropprotection REAL DEFAULT 0.0');
    await pool.query('ALTER TABLE metas_ventas ADD COLUMN IF NOT EXISTS meta_cosecha REAL DEFAULT 0.0');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_clientes_activos_nombre ON clientes (nombre) WHERE activo = 1');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_clientes_asesor_activo_nombre ON clientes (asesor_id, nombre) WHERE activo = 1');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizaciones_asesor_fecha ON cotizaciones (asesor_id, fecha_creacion DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizaciones_asesor_ciclo_estatus ON cotizaciones (asesor_id, ciclo_agricola, estatus)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente_estatus ON cotizaciones (cliente_id, estatus)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizacion_detalles_cotizacion ON cotizacion_detalles (cotizacion_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_planificacion_asesor_realizada ON planificacion_semanal (asesor_id, realizada)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_planificacion_estado_fecha ON planificacion_semanal (realizada, fecha_programada)');
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

module.exports = {
  get: async (sql, params = []) => {
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
  
  pool, // Expose raw pool in case direct operations are needed
  initSchema
};
