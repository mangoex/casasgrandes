-- CHG-027. Migración aditiva e idempotente.
-- No borra columnas ni reescribe cotizaciones ni movimientos de almacén.
-- Se puede ejecutar otra vez: CREATE/ADD IF NOT EXISTS y el registro de versión no pisa filas.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  aplicada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_claves (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  prefijo TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL,
  alcances TEXT NOT NULL,
  asesor_id INTEGER REFERENCES asesores(id),
  rol_visibilidad TEXT,
  limite_por_minuto INTEGER NOT NULL,
  creada_por INTEGER REFERENCES asesores(id),
  creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revocada_en TIMESTAMPTZ,
  CONSTRAINT bot_claves_un_vinculo CHECK (
    (asesor_id IS NOT NULL AND rol_visibilidad IS NULL)
    OR (asesor_id IS NULL AND rol_visibilidad IS NOT NULL)
  ),
  CONSTRAINT bot_claves_limite CHECK (limite_por_minuto BETWEEN 1 AND 600)
);

ALTER TABLE bot_claves ADD COLUMN IF NOT EXISTS nombre TEXT;
ALTER TABLE bot_claves ADD COLUMN IF NOT EXISTS prefijo TEXT;
ALTER TABLE bot_claves ADD COLUMN IF NOT EXISTS hash TEXT;
ALTER TABLE bot_claves ADD COLUMN IF NOT EXISTS alcances TEXT;
ALTER TABLE bot_claves ADD COLUMN IF NOT EXISTS asesor_id INTEGER;
ALTER TABLE bot_claves ADD COLUMN IF NOT EXISTS rol_visibilidad TEXT;
ALTER TABLE bot_claves ADD COLUMN IF NOT EXISTS limite_por_minuto INTEGER;
ALTER TABLE bot_claves ADD COLUMN IF NOT EXISTS creada_por INTEGER;
ALTER TABLE bot_claves ADD COLUMN IF NOT EXISTS creada_en TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE bot_claves ADD COLUMN IF NOT EXISTS revocada_en TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS bot_llamadas (
  id SERIAL PRIMARY KEY,
  clave_id INTEGER REFERENCES bot_claves(id),
  metodo TEXT NOT NULL,
  ruta_plantilla TEXT NOT NULL,
  codigo_http INTEGER NOT NULL,
  codigo_error TEXT,
  duracion_ms INTEGER NOT NULL,
  request_id TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bot_llamadas ADD COLUMN IF NOT EXISTS clave_id INTEGER;
ALTER TABLE bot_llamadas ADD COLUMN IF NOT EXISTS metodo TEXT;
ALTER TABLE bot_llamadas ADD COLUMN IF NOT EXISTS ruta_plantilla TEXT;
ALTER TABLE bot_llamadas ADD COLUMN IF NOT EXISTS codigo_http INTEGER;
ALTER TABLE bot_llamadas ADD COLUMN IF NOT EXISTS codigo_error TEXT;
ALTER TABLE bot_llamadas ADD COLUMN IF NOT EXISTS duracion_ms INTEGER;
ALTER TABLE bot_llamadas ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE bot_llamadas ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_bot_claves_prefijo ON bot_claves (prefijo);
CREATE INDEX IF NOT EXISTS idx_bot_llamadas_creado ON bot_llamadas (creado_en);

INSERT INTO schema_migrations (version)
VALUES ('027_bot_api')
ON CONFLICT (version) DO NOTHING;
