'use strict';

// Semilla ficticia para CHG-026. No lee CSV ni copia personas reales.

const FAKE_WAREHOUSE = Object.freeze({
  id: 1,
  nombre: 'Almacén Ficticio',
  usuario: 'almacen.ficticio',
  nivelRol: 'Almacen',
  email: 'almacen.ficticio@example.test'
});

const FAKE_PRODUCT = Object.freeze({
  id: 7,
  nombre: 'Híbrido Demostración'
});

async function applyReservationFixture(client) {
  await client.query(`
    CREATE TABLE asesores (
      id INTEGER PRIMARY KEY,
      nombre TEXT NOT NULL,
      usuario TEXT NOT NULL,
      nivel_rol TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      session_version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE productos (
      id INTEGER PRIMARY KEY,
      producto TEXT NOT NULL
    );
    CREATE TABLE cotizaciones (
      id INTEGER PRIMARY KEY,
      flujo_version TEXT NOT NULL,
      almacen_estado TEXT,
      condiciones_pago TEXT NOT NULL
    );
    CREATE TABLE cotizacion_detalles (
      id INTEGER PRIMARY KEY,
      cotizacion_id INTEGER NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
      producto_id INTEGER NOT NULL REFERENCES productos(id),
      cantidad_ordenada NUMERIC(14,3) NOT NULL
    );
    CREATE TABLE almacen_movimientos (
      id SERIAL PRIMARY KEY,
      producto_id INTEGER NOT NULL REFERENCES productos(id),
      tamano TEXT,
      cantidad_entrante NUMERIC(14,3) NOT NULL DEFAULT 0,
      cantidad_saliente NUMERIC(14,3) NOT NULL DEFAULT 0
    );
    CREATE TABLE cotizacion_reservas (
      id SERIAL PRIMARY KEY,
      cotizacion_id INTEGER NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
      cotizacion_detalle_id INTEGER NOT NULL REFERENCES cotizacion_detalles(id) ON DELETE CASCADE,
      producto_id INTEGER NOT NULL REFERENCES productos(id),
      tamano TEXT NOT NULL,
      cantidad NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
      estado TEXT NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'CONSUMIDA', 'LIBERADA')),
      reservado_por_id INTEGER NOT NULL REFERENCES asesores(id),
      reservado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(
    `INSERT INTO asesores (id, nombre, usuario, nivel_rol, email)
     VALUES ($1, $2, $3, $4, $5)`,
    [FAKE_WAREHOUSE.id, FAKE_WAREHOUSE.nombre, FAKE_WAREHOUSE.usuario, FAKE_WAREHOUSE.nivelRol, FAKE_WAREHOUSE.email]
  );
  await client.query(
    'INSERT INTO productos (id, producto) VALUES ($1, $2)',
    [FAKE_PRODUCT.id, FAKE_PRODUCT.nombre]
  );
  await client.query(`
    INSERT INTO cotizaciones (id, flujo_version, almacen_estado, condiciones_pago)
    VALUES (101, 'CHG-025', 'PENDIENTE', 'APARTADO')
  `);
  await client.query(`
    INSERT INTO cotizacion_detalles (id, cotizacion_id, producto_id, cantidad_ordenada)
    VALUES (201, 101, 7, 100)
  `);
  await client.query(`
    INSERT INTO almacen_movimientos (producto_id, tamano, cantidad_entrante, cantidad_saliente)
    VALUES
      (7, 'BT1', 90, 0),
      (7, 'BT2', 50, 0)
  `);
}

module.exports = {
  FAKE_WAREHOUSE,
  FAKE_PRODUCT,
  applyReservationFixture
};
