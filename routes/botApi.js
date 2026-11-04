'use strict';

const express = require('express');
const { pepper } = require('../utils/botKeys');
const { errorBody, decodeCursor, readLimit, unknownQuery } = require('../utils/botHttp');
const { requireBotRead } = require('../middleware/botAuth');
const inventory = require('../utils/botInventory');

const router = express.Router();
const PRODUCT_QUERY = new Set(['q', 'categoria', 'limite', 'cursor']);
const MOVEMENT_QUERY = new Set(['producto_id', 'limite', 'cursor']);

router.get('/health', (req, res) => {
  if (!pepper()) {
    return res.status(503).json(errorBody('SERVICIO_NO_DISPONIBLE', 'El API de bots no está configurado.'));
  }
  return res.json({ status: 'ok' });
});

router.get(
  '/inventario/productos',
  requireBotRead('catalogo', '/api/v1/bot/inventario/productos'),
  async (req, res) => {
    const page = readProductQuery(req.query);
    if (!page.ok) return res.status(400).json(errorBody('VALIDACION', 'El parámetro no forma parte del contrato.'));
    try {
      const rows = await inventory.listProducts({
        q: page.q,
        categoria: page.categoria,
        afterId: page.cursor,
        limit: page.limit + 1
      });
      const projected = inventory.page(
        rows.map(row => inventory.projectProduct(row, req.bot.view)),
        page.limit,
        row => row.id
      );
      return res.json({ vista: req.bot.view, ...projected });
    } catch (error) {
      console.error(JSON.stringify({ event: 'bot_inventory_list_failed', request_id: req.requestId || null }));
      return res.status(500).json(errorBody('ERROR_INTERNO', 'No fue posible completar la consulta.'));
    }
  }
);

router.get(
  '/inventario/productos/:productoId',
  requireBotRead('detalle', '/api/v1/bot/inventario/productos/{productoId}'),
  async (req, res) => {
    const productId = Number(req.params.productoId);
    if (!Number.isInteger(productId) || productId < 1) {
      return res.status(400).json(errorBody('VALIDACION', 'El parámetro no forma parte del contrato.'));
    }
    try {
      const row = await inventory.getProduct(productId);
      if (!row) return res.status(404).json(errorBody('NO_ENCONTRADO', 'El producto no está disponible.'));
      const body = {
        vista: req.bot.view,
        ...inventory.projectProduct(row, req.bot.view)
      };
      if (req.bot.view === 'almacen' || req.bot.view === 'administrador') {
        body.lotes = inventory.projectLots(await inventory.listLots(productId));
      }
      if (req.bot.view === 'almacen') {
        body.tamanos = inventory.projectSizes(
          await inventory.listSizePhysical(productId),
          await inventory.listSizeReserved(productId)
        );
      }
      return res.json(body);
    } catch (error) {
      console.error(JSON.stringify({ event: 'bot_inventory_detail_failed', request_id: req.requestId || null }));
      return res.status(500).json(errorBody('ERROR_INTERNO', 'No fue posible completar la consulta.'));
    }
  }
);

router.get(
  '/inventario/movimientos',
  requireBotRead('movimientos', '/api/v1/bot/inventario/movimientos'),
  async (req, res) => {
    const page = readMovementQuery(req.query);
    if (!page.ok) return res.status(400).json(errorBody('VALIDACION', 'El parámetro no forma parte del contrato.'));
    try {
      const rows = await inventory.listMovements({
        productId: page.productId,
        beforeId: page.cursor,
        limit: page.limit + 1
      });
      const projected = inventory.page(
        rows.map(row => inventory.projectMovement(row, req.bot.view)),
        page.limit,
        row => row.id
      );
      return res.json({ vista: req.bot.view, ...projected });
    } catch (error) {
      console.error(JSON.stringify({ event: 'bot_inventory_moves_failed', request_id: req.requestId || null }));
      return res.status(500).json(errorBody('ERROR_INTERNO', 'No fue posible completar la consulta.'));
    }
  }
);

function readProductQuery(query) {
  if (unknownQuery(query, PRODUCT_QUERY)) return { ok: false };
  if (query.q !== undefined && String(query.q).length > 80) return { ok: false };
  if (query.categoria !== undefined && String(query.categoria).length > 40) return { ok: false };
  const limit = readLimit(query);
  const cursor = decodeCursor(query.cursor);
  if (!limit.ok || !cursor.ok) return { ok: false };
  return {
    ok: true,
    q: query.q || '',
    categoria: query.categoria || '',
    limit: limit.value,
    cursor: cursor.id
  };
}

function readMovementQuery(query) {
  if (unknownQuery(query, MOVEMENT_QUERY)) return { ok: false };
  const limit = readLimit(query);
  const cursor = decodeCursor(query.cursor);
  if (!limit.ok || !cursor.ok) return { ok: false };
  if (query.producto_id === undefined) {
    return { ok: true, productId: null, limit: limit.value, cursor: cursor.id };
  }
  if (!/^[1-9]\d*$/.test(String(query.producto_id))) return { ok: false };
  return { ok: true, productId: Number(query.producto_id), limit: limit.value, cursor: cursor.id };
}

module.exports = router;
