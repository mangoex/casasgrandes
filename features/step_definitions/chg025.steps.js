'use strict';

const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { Given, When, Then } = require('@cucumber/cucumber');
const db = require('../../db');
const { TEST_JWT_SECRET } = require('../support/preload');

const FAKE_ADVISOR = {
  id: 1,
  nombre: 'Asesor Ficticio',
  usuario: 'asesor.ficticio',
  nivel_rol: 'Asesor',
  email: 'asesor.ficticio@example.test',
  telefono: null,
  activo: 1,
  session_version: 1
};

const FAKE_WAREHOUSE = {
  id: 1,
  nombre: 'Almacén Ficticio',
  usuario: 'almacen.ficticio',
  nivel_rol: 'Almacen',
  email: 'almacen.ficticio@example.test',
  telefono: null,
  activo: 1,
  session_version: 1
};

function sign(user) {
  return jwt.sign(
    { id: user.id, nivel_rol: user.nivel_rol, session_version: user.session_version },
    TEST_JWT_SECRET
  );
}

Given('un asesor ficticio autenticado con un híbrido de precio lleno {int}', function (listPrice) {
  db.get = async sql => {
    const text = String(sql);
    if (text.includes('FROM asesores')) return FAKE_ADVISOR;
    if (text.includes('FROM clientes')) {
      return {
        id: 10,
        nombre: 'Productor Ficticio',
        asesor_id: FAKE_ADVISOR.id,
        cuenta_clave_id: 1,
        activo: 1
      };
    }
    if (text.includes('FROM cuentas_clave')) return { id: 1, tier_name: 'General', descuento_mxn: 0 };
    if (text.includes('FROM productos')) {
      return {
        id: 7,
        producto: 'Híbrido Demostración',
        tipo_categoria: 'Híbrido',
        list_price_mxn: listPrice,
        descontar: 1,
        activo: 1
      };
    }
    return null;
  };
  this.token = sign(FAKE_ADVISOR);
});

When(
  'calcula una solicitud {string} de {int} unidad(es) con descuento {int}',
  async function (condition, quantity, discount) {
    this.response = await this.http()
      .post('/api/cotizaciones/calcular')
      .set('Authorization', `Bearer ${this.token}`)
      .send({
        cliente_id: 10,
        condiciones_pago: condition,
        items: [{ producto_id: 7, cantidad: quantity, descuento_aplicado: discount }]
      });
  }
);

Then('el precio final de la partida es {int}', function (price) {
  assert.equal(this.response.body.items[0].precio_final, price);
});

Then('el descuento máximo de la partida es {int}', function (discount) {
  assert.equal(this.response.body.items[0].max_discount_mxn, discount);
});

Then('el total es {int}', function (total) {
  assert.equal(this.response.body.total_mxn, total);
});

Given('un operador de almacén ficticio autenticado', function () {
  db.get = async sql => {
    if (!String(sql).includes('FROM asesores')) {
      throw new Error(`consulta de autenticación inesperada: ${sql}`);
    }
    return FAKE_WAREHOUSE;
  };
  this.token = sign(FAKE_WAREHOUSE);
  this.reservationWrites = 0;
});

Given('una solicitud CHG-025 de {int} bolsas pendiente de reserva', function (quantity) {
  db.transaction = async callback => callback({
    get: async sql => {
      if (String(sql).includes('FROM cotizaciones')) {
        return {
          id: 101,
          flujo_version: 'CHG-025',
          almacen_estado: 'PENDIENTE',
          condiciones_pago: 'APARTADO'
        };
      }
      return null;
    },
    all: async sql => {
      const text = String(sql);
      if (text.includes('FROM cotizacion_detalles')) {
        return [{ id: 201, cotizacion_id: 101, producto_id: 7, cantidad_ordenada: quantity }];
      }
      if (text.includes('FROM productos')) return [{ id: 7 }];
      if (text.includes('FROM cotizacion_reservas')) return [];
      return [];
    },
    run: async () => {
      this.reservationWrites += 1;
      return { id: 1, changes: 1 };
    }
  });
});

When(
  'asigna {int} bolsas {string} y {int} bolsas {string}',
  async function (firstQuantity, firstSize, secondQuantity, secondSize) {
    this.response = await this.http()
      .post('/api/almacen/solicitudes/101/asignaciones')
      .set('Authorization', `Bearer ${this.token}`)
      .send({
        detalles: [{
          cotizacion_detalle_id: 201,
          asignaciones: [
            { producto_id: 7, tamano: firstSize, cantidad: firstQuantity },
            { producto_id: 7, tamano: secondSize, cantidad: secondQuantity }
          ]
        }]
      });
  }
);

Then('no se escribe ninguna reserva', function () {
  assert.equal(this.reservationWrites, 0);
});
