'use strict';

const express = require('express');
const { pepper } = require('../utils/botKeys');
const { errorBody } = require('../utils/botHttp');
const { requireBotRead } = require('../middleware/botAuth');

const router = express.Router();

router.get('/health', (req, res) => {
  if (!pepper()) {
    return res.status(503).json(errorBody('SERVICIO_NO_DISPONIBLE', 'El API de bots no está configurado.'));
  }
  return res.json({ status: 'ok' });
});

function notImplemented(req, res) {
  return res.status(404).json(errorBody('NO_ENCONTRADO', 'El producto no está disponible.'));
}

router.get(
  '/inventario/productos',
  requireBotRead('catalogo', '/api/v1/bot/inventario/productos'),
  notImplemented
);
router.get(
  '/inventario/productos/:productoId',
  requireBotRead('detalle', '/api/v1/bot/inventario/productos/{productoId}'),
  notImplemented
);
router.get(
  '/inventario/movimientos',
  requireBotRead('movimientos', '/api/v1/bot/inventario/movimientos'),
  notImplemented
);

module.exports = router;
