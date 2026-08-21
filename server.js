const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { execFile } = require('child_process');
const db = require('./db');
const agentsService = require('./agentsService');
const { getVolumeMultiplier, getNetPrice, getSeasonPrice, calculateItemPricing } = require('./utils/pricing');
const { normalizeProductSizes } = require('./utils/productos');
const { normalizeMovementItems } = require('./utils/almacen');
const { getActiveStageCodesForDate, isStageActiveOnDate, validateStageReportPayload } = require('./utils/stageReports');
const { authenticateToken, requireAdmin, requireAdminOrCoordinador, requireProgramacionManager } = require('./middleware/auth');

// Routers
const authRouter = require('./routes/auth');
const clientesRouter = require('./routes/clientes');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured before starting the server.');
}

const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors((req, callback) => {
  const origin = req.get('origin');
  let isSameOrigin = false;

  if (origin) {
    try {
      // The browser UI is served by this application, so its own host is always allowed.
      isSameOrigin = new URL(origin).host.toLowerCase() === req.get('host')?.toLowerCase();
    } catch {
      isSameOrigin = false;
    }
  }

  // Health checks do not send Origin. External applications still require CORS_ORIGINS.
  if (!origin || isSameOrigin || allowedOrigins.includes(origin)) {
    return callback(null, { origin: true });
  }
  return callback(new Error('Origin not allowed by CORS'));
}));
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Mount API Routers
app.use('/api/auth', authRouter);
app.use('/api/clientes', clientesRouter);

// -------------------------------------------------------------
// PRODUCTS ENDPOINTS
// -------------------------------------------------------------

function normalizeProductCode(value) {
  return String(value || '').trim();
}

async function syncMonthlyBasePrice(client, productId, price) {
  for (let mes = 1; mes <= 12; mes += 1) {
    await client.query(
      `INSERT INTO crm_precios_mensuales (producto_id, mes, precio, promo_dinero, promo_porcentaje)
       VALUES ($1, $2, $3, 0, 0)
       ON CONFLICT (producto_id, mes)
       DO UPDATE SET precio = EXCLUDED.precio`,
      [productId, mes, price]
    );
  }
}

async function getMonthlyProductPricing(prod, month) {
  const monthly = await db.get(
    'SELECT precio, promo_dinero, promo_porcentaje FROM crm_precios_mensuales WHERE producto_id = ? AND mes = ?',
    [prod.id, month]
  );
  const listPrice = monthly ? Number(monthly.precio) : Number(prod.list_price_mxn);
  const promoMoney = monthly ? Number(monthly.promo_dinero || 0) : 0;
  const promoPercent = monthly ? Number(monthly.promo_porcentaje || 0) : 0;
  const maxDiscountMxn = promoMoney > 0 ? promoMoney : Math.round((listPrice * promoPercent / 100) * 100) / 100;

  return {
    product: { ...prod, list_price_mxn: listPrice, precio_programado_mxn: listPrice },
    listPrice,
    maxDiscountMxn,
    promoMoney,
    promoPercent
  };
}

app.get('/api/productos', authenticateToken, async (req, res) => {
  try {
    let query = 'SELECT * FROM productos';
    const params = [];
    const includeInactive = req.user.nivel_rol === 'Administrador' && req.query.include_inactive === '1';
    if (!includeInactive) {
      query += ' WHERE activo = 1';
    }
    query += ' ORDER BY activo DESC, tipo_categoria DESC, producto ASC';
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/productos', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { producto, clave, descripcion, tipo_categoria, list_price_mxn, base_usd, descuento_fijo_quimicos, objetivo_anual, descontar, stock_inicial, tamanos } = req.body;
  if (!producto || !tipo_categoria || !Number.isFinite(Number(list_price_mxn)) || Number(list_price_mxn) < 0) {
    return res.status(400).json({ error: 'Missing required product fields' });
  }
  const productCode = normalizeProductCode(clave);
  const normalizedSizes = normalizeProductSizes(tamanos);
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM productos WHERE producto = $1', [producto.trim()]);
    if (existing.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'A product with this name already exists' });
    }
    if (productCode) {
      const duplicateCode = await client.query('SELECT id FROM productos WHERE clave = $1', [productCode]);
      if (duplicateCode.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'A product with this key already exists' });
      }
    }
    const result = await client.query(`
      INSERT INTO productos (producto, clave, descripcion, tipo_categoria, list_price_mxn, base_usd, descuento_fijo_quimicos, objetivo_anual, descontar, activo, tamanos)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10) RETURNING id
    `, [
      producto.trim(),
      productCode || null,
      String(descripcion || '').trim() || null,
      tipo_categoria,
      Number(list_price_mxn),
      Number(base_usd) || 0.0,
      Number(descuento_fijo_quimicos) || 0.0,
      Number(objetivo_anual) || 0,
      descontar ? 1 : 0,
      normalizedSizes
    ]);
    
    const newProdId = result.rows[0].id;
    await syncMonthlyBasePrice(client, newProdId, Number(list_price_mxn));
    const initialQty = Number(stock_inicial) || 0.0;
    
    // Register initial stock in warehouse if > 0
    if (initialQty > 0) {
      const now = new Date().toISOString();
      await client.query(`
        INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, referencia_factura, asesor_id, notas)
        VALUES ($1, 'Entrada de Compra', $2, $3, 0, $4, 'Inventario Inicial', $5, 'Registro de inventario inicial al dar de alta el producto')
      `, [now, newProdId, initialQty, initialQty, req.user.id]);
    }
    await client.query('COMMIT');
    res.status(201).json({ id: newProdId, message: 'Product created successfully' });
  } catch (err) {
    await client?.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create product' });
  } finally {
    client?.release();
  }
});

app.put('/api/productos/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  const { producto, clave, descripcion, tipo_categoria, list_price_mxn, base_usd, descuento_fijo_quimicos, objetivo_anual, descontar, activo, tamanos } = req.body;
  if (!producto || !tipo_categoria || !Number.isFinite(Number(list_price_mxn)) || Number(list_price_mxn) < 0) {
    return res.status(400).json({ error: 'Missing required product fields' });
  }
  const productCode = normalizeProductCode(clave);
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const productResult = await client.query('SELECT * FROM productos WHERE id = $1 FOR UPDATE', [id]);
    const prod = productResult.rows[0];
    if (!prod) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }
    const duplicate = await client.query('SELECT id FROM productos WHERE producto = $1 AND id != $2', [producto.trim(), id]);
    if (duplicate.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Another product with this name already exists' });
    }
    const nextProductCode = clave === undefined ? (prod.clave || '') : productCode;
    const nextDescription = descripcion === undefined ? prod.descripcion : (String(descripcion || '').trim() || null);
    const nextSizes = tamanos === undefined ? (prod.tamanos || null) : normalizeProductSizes(tamanos);
    if (nextProductCode) {
      const duplicateCode = await client.query('SELECT id FROM productos WHERE clave = $1 AND id != $2', [nextProductCode, id]);
      if (duplicateCode.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Another product with this key already exists' });
      }
    }
    
    const activeVal = (activo === undefined || activo === null) ? prod.activo : (activo ? 1 : 0);
    
    await client.query(`
      UPDATE productos
      SET producto = $1, clave = $2, descripcion = $3, tipo_categoria = $4, list_price_mxn = $5, base_usd = $6, descuento_fijo_quimicos = $7, objetivo_anual = $8, descontar = $9, activo = $10, tamanos = $11
      WHERE id = $12
    `, [
      producto.trim(),
      nextProductCode || null,
      nextDescription,
      tipo_categoria,
      Number(list_price_mxn),
      Number(base_usd) || 0.0,
      Number(descuento_fijo_quimicos) || 0.0,
      Number(objetivo_anual) || 0,
      descontar ? 1 : 0,
      activeVal,
      nextSizes,
      id
    ]);
    if (Number(prod.list_price_mxn) !== Number(list_price_mxn)) {
      await syncMonthlyBasePrice(client, Number(id), Number(list_price_mxn));
    }
    await client.query('COMMIT');
    res.json({ message: 'Product updated successfully' });
  } catch (err) {
    await client?.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to update product' });
  } finally {
    client?.release();
  }
});

app.delete('/api/productos/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  try {
    const prod = await db.get('SELECT id, producto FROM productos WHERE id = ?', [id]);
    if (!prod) return res.status(404).json({ error: 'Product not found' });

    const [quotationUsage, warehouseUsage] = await Promise.all([
      db.get('SELECT COUNT(*) AS total FROM cotizacion_detalles WHERE producto_id = ?', [id]),
      db.get('SELECT COUNT(*) AS total FROM almacen_movimientos WHERE producto_id = ?', [id])
    ]);
    if (Number(quotationUsage.total) > 0 || Number(warehouseUsage.total) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar un producto con cotizaciones o movimientos de almacén. Desactívalo para conservar su historial.'
      });
    }

    await db.run('DELETE FROM productos WHERE id = ?', [id]);
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// -------------------------------------------------------------
// CONFIGURATION ENDPOINTS
// -------------------------------------------------------------

app.get('/api/temporadas', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM temporadas ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch seasons' });
  }
});

app.get('/api/cuentas-clave', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM cuentas_clave ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch key account tiers' });
  }
});

app.post('/api/cuentas-clave', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Solo un administrador puede crear cuentas clave.' });
  }
  const nombre = String(req.body.nombre || '').trim();
  const descripcion = String(req.body.descripcion || '').trim();
  const descuento = Number(req.body.descuento_mxn) || 0;
  if (!nombre) return res.status(400).json({ error: 'El nombre de la cuenta clave es obligatorio.' });
  if (descuento < 0) return res.status(400).json({ error: 'El descuento no puede ser negativo.' });
  try {
    const existing = await db.get('SELECT id FROM cuentas_clave WHERE LOWER(tier_name) = LOWER(?)', [nombre]);
    if (existing) return res.status(409).json({ error: 'Ya existe una cuenta clave con ese nombre.' });
    const result = await db.run(
      'INSERT INTO cuentas_clave (tier_name, descripcion, descuento_mxn) VALUES (?, ?, ?)',
      [nombre, descripcion || null, descuento]
    );
    res.status(201).json({ id: result.id, message: 'Cuenta clave creada correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No fue posible crear la cuenta clave.' });
  }
});

app.put('/api/cuentas-clave/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Solo un administrador puede modificar cuentas clave.' });
  }
  const id = Number(req.params.id);
  const nombre = String(req.body.nombre || '').trim();
  const descripcion = String(req.body.descripcion || '').trim();
  const descuento = Number(req.body.descuento_mxn) || 0;
  if (!nombre) return res.status(400).json({ error: 'El nombre de la cuenta clave es obligatorio.' });
  if (descuento < 0) return res.status(400).json({ error: 'El descuento no puede ser negativo.' });
  try {
    const tier = await db.get('SELECT id FROM cuentas_clave WHERE id = ?', [id]);
    if (!tier) return res.status(404).json({ error: 'Cuenta clave no encontrada.' });
    const duplicate = await db.get('SELECT id FROM cuentas_clave WHERE LOWER(tier_name) = LOWER(?) AND id <> ?', [nombre, id]);
    if (duplicate) return res.status(409).json({ error: 'Ya existe una cuenta clave con ese nombre.' });
    await db.run(
      'UPDATE cuentas_clave SET tier_name = ?, descripcion = ?, descuento_mxn = ? WHERE id = ?',
      [nombre, descripcion || null, descuento, id]
    );
    res.json({ message: 'Cuenta clave actualizada correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No fue posible actualizar la cuenta clave.' });
  }
});

app.delete('/api/cuentas-clave/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Solo un administrador puede eliminar cuentas clave.' });
  }
  const id = Number(req.params.id);
  try {
    const tier = await db.get('SELECT id FROM cuentas_clave WHERE id = ?', [id]);
    if (!tier) return res.status(404).json({ error: 'Cuenta clave no encontrada.' });
    const linkedClients = await db.get('SELECT COUNT(*)::int AS total FROM clientes WHERE cuenta_clave_id = ?', [id]);
    if (Number(linkedClients?.total) > 0) {
      return res.status(409).json({ error: 'No se puede eliminar porque hay agricultores asignados a esta cuenta clave.' });
    }
    await db.run('DELETE FROM cuentas_clave WHERE id = ?', [id]);
    res.json({ message: 'Cuenta clave eliminada correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No fue posible eliminar la cuenta clave.' });
  }
});

app.get('/api/asesores', authenticateToken, async (req, res) => {
  try {
    let query = 'SELECT id, nombre, usuario, nivel_rol, email, telefono, activo, cumpleanos, calificacion FROM asesores';
    const params = [];
    if (req.user.nivel_rol !== 'Administrador') {
      query += ' WHERE activo = 1';
    }
    query += ' ORDER BY activo DESC, nombre ASC';
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch advisers' });
  }
});

app.post('/api/asesores', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { nombre, usuario, nivel_rol, email, telefono, cumpleanos, password, calificacion } = req.body;
  if (!nombre || !usuario || !nivel_rol || !email) {
    return res.status(400).json({ error: 'Missing required advisor fields' });
  }
  try {
    const existing = await db.get('SELECT id FROM asesores WHERE email = ? OR usuario = ?', [email.trim(), usuario.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'An advisor with this email or username already exists' });
    }
    const rawPassword = password || 'password123';
    const password_hash = await bcrypt.hash(rawPassword, 10);
    const califVal = (calificacion === undefined || calificacion === null || calificacion === '') ? 5.0 : Number(calificacion);
    const result = await db.run(`
      INSERT INTO asesores (nombre, usuario, nivel_rol, email, telefono, cumpleanos, password_hash, activo, calificacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [nombre.trim(), usuario.trim(), nivel_rol, email.trim(), telefono || null, cumpleanos || null, password_hash, califVal]);
    res.status(201).json({ id: result.id, message: 'Advisor registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create advisor' });
  }
});

app.put('/api/asesores/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  const { nombre, usuario, nivel_rol, email, telefono, cumpleanos, activo, password, calificacion } = req.body;
  if (!nombre || !usuario || !nivel_rol || !email) {
    return res.status(400).json({ error: 'Missing required advisor fields' });
  }
  try {
    const adv = await db.get('SELECT * FROM asesores WHERE id = ?', [id]);
    if (!adv) return res.status(404).json({ error: 'Advisor not found' });

    const duplicate = await db.get('SELECT id FROM asesores WHERE (email = ? OR usuario = ?) AND id != ?', [email.trim(), usuario.trim(), id]);
    if (duplicate) {
      return res.status(400).json({ error: 'Another advisor with this email or username already exists' });
    }

    let passwordHash = adv.password_hash;
    if (password && password.trim().length > 0) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    const activeVal = (activo === undefined || activo === null) ? adv.activo : (activo ? 1 : 0);
    const califVal = (calificacion === undefined || calificacion === null || calificacion === '') ? adv.calificacion : Number(calificacion);

    await db.run(`
      UPDATE asesores
      SET nombre = ?, usuario = ?, nivel_rol = ?, email = ?, telefono = ?, cumpleanos = ?, password_hash = ?, activo = ?, calificacion = ?
      WHERE id = ?
    `, [nombre.trim(), usuario.trim(), nivel_rol, email.trim(), telefono || null, cumpleanos || null, passwordHash, activeVal, califVal, id]);
    res.json({ message: 'Advisor updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update advisor' });
  }
});

app.delete('/api/asesores/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  try {
    const adv = await db.get('SELECT * FROM asesores WHERE id = ?', [id]);
    if (!adv) return res.status(404).json({ error: 'Advisor not found' });

    await db.run('UPDATE asesores SET activo = 0 WHERE id = ?', [id]);
    await db.run('UPDATE clientes SET asesor_id = NULL WHERE asesor_id = ?', [id]);
    res.json({ message: 'Advisor deactivated and their clients unassigned successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to deactivate advisor' });
  }
});

// -------------------------------------------------------------
// CATALOGO DE CICLOS & METAS GLOBALES API
// -------------------------------------------------------------

app.get('/api/ciclos', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM ciclos ORDER BY creado_en DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los ciclos agrícolas' });
  }
});

app.post('/api/ciclos', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Permisos insuficientes para administrar ciclos' });
  }
  const { nombre, activo } = req.body;
  if (!nombre) {
    return res.status(400).json({ error: 'El nombre del ciclo es requerido' });
  }
  try {
    const result = await db.run('INSERT INTO ciclos (nombre, activo) VALUES (?, ?) ON CONFLICT (nombre) DO NOTHING', [nombre, activo !== undefined ? activo : 1]);
    res.status(201).json({ id: result.id, nombre, activo: activo !== undefined ? activo : 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar el ciclo agrícola' });
  }
});

app.put('/api/ciclos/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Permisos insuficientes para administrar ciclos' });
  }
  const { id } = req.params;
  const { nombre, activo } = req.body;
  try {
    await db.run('UPDATE ciclos SET nombre = ?, activo = ? WHERE id = ?', [nombre, activo, id]);
    res.json({ message: 'Ciclo agrícola actualizado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el ciclo agrícola' });
  }
});

app.delete('/api/ciclos/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Permisos de administrador requeridos' });
  }
  const { id } = req.params;
  try {
    await db.run('DELETE FROM ciclos WHERE id = ?', [id]);
    res.json({ message: 'Ciclo agrícola eliminado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el ciclo agrícola' });
  }
});

app.get('/api/metas-globales', authenticateToken, async (req, res) => {
  const { ciclo_id } = req.query;
  try {
    let query = `
      SELECT mg.*, p.producto, p.tipo_categoria, p.list_price_mxn 
      FROM metas_globales mg
      JOIN productos p ON mg.producto_id = p.id
    `;
    const params = [];
    if (ciclo_id) {
      query += ' WHERE mg.ciclo_id = ?';
      params.push(ciclo_id);
    }
    query += ' ORDER BY p.producto ASC';
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las metas globales' });
  }
});

app.post('/api/metas-globales', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Permisos insuficientes para administrar metas globales' });
  }
  const { ciclo_id, producto_id, cantidad_objetivo, monto_objetivo_mxn } = req.body;
  if (!ciclo_id || !producto_id) {
    return res.status(400).json({ error: 'El ciclo y el producto son requeridos' });
  }
  try {
    await db.run(`
      INSERT INTO metas_globales (ciclo_id, producto_id, cantidad_objetivo, monto_objetivo_mxn)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (ciclo_id, producto_id) 
      DO UPDATE SET 
        cantidad_objetivo = EXCLUDED.cantidad_objetivo,
        monto_objetivo_mxn = EXCLUDED.monto_objetivo_mxn
    `, [ciclo_id, producto_id, cantidad_objetivo || 0.0, monto_objetivo_mxn || 0.0]);
    res.json({ success: true, message: 'Meta global configurada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al configurar la meta global' });
  }
});

app.delete('/api/metas-globales/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Permisos de administrador requeridos' });
  }
  const { id } = req.params;
  try {
    await db.run('DELETE FROM metas_globales WHERE id = ?', [id]);
    res.json({ message: 'Meta global eliminada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la meta global' });
  }
});

// -------------------------------------------------------------
// QUOTING & CALCULATING ENGINE
// -------------------------------------------------------------

// getVolumeMultiplier is imported from utils/pricing.js
// The canonical volume discount scale (aligned with cotizador.py):
//   < 40 bolsas  -> 1.00 (no discount)
//   < 60 bolsas  -> 0.95 (5%)
//   < 80 bolsas  -> 0.90 (10%)
//   < 90 bolsas  -> 0.85 (15%)
//   >= 90 bolsas -> 0.80 (20%)

app.post('/api/cotizaciones/calcular', authenticateToken, async (req, res) => {
  const { cliente_id, items, temporada_id, cuenta_clave_id } = req.body;
  
  if (!cliente_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'cliente_id and non-empty items array are required' });
  }
  
  try {
    const client = await db.get('SELECT * FROM clientes WHERE id = ?', [cliente_id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (req.user.nivel_rol === 'Asesor' && client.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'No puedes cotizar para un cliente asignado a otro asesor.' });
    }
    
    // Determine key account tier and season
    const ccId = cuenta_clave_id || client.cuenta_clave_id || 1;
    const keyAccount = await db.get('SELECT * FROM cuentas_clave WHERE id = ?', [ccId]);
    const keyAccountDesc = keyAccount ? keyAccount.descuento_mxn : 0.0;
    
    const activeSeason = temporada_id ? 
      await db.get('SELECT * FROM temporadas WHERE id = ?', [temporada_id]) : 
      await db.get("SELECT * FROM temporadas WHERE actividad = 'Temporada (Precio Lleno)'");
      
    // Calculate total quantity of discountable seeds first to get correct volume scale
    const currentMonth = new Date().getMonth() + 1;
    let totalDiscountableSeeds = 0;
    const dbItems = [];
    
    for (const item of items) {
      const prod = await db.get('SELECT * FROM productos WHERE id = ? AND activo = 1', [item.producto_id]);
      if (!prod) return res.status(400).json({ error: `El producto seleccionado ya no está disponible para cotizar.` });
      
      const monthlyPricing = await getMonthlyProductPricing(prod, currentMonth);
      dbItems.push({ item, prod: monthlyPricing.product, monthlyPricing });
      if (monthlyPricing.product.descontar === 1) {
        totalDiscountableSeeds += item.cantidad;
      }
    }
    
    const volMultiplier = getVolumeMultiplier(totalDiscountableSeeds);
    const calculatedItems = [];
    let grandTotal = 0.0;
    
    for (const { item, prod, monthlyPricing } of dbItems) {
      const maxDiscountMxn = monthlyPricing.maxDiscountMxn;
      const { netPrice: priceBeforeKeyAccount } = calculateItemPricing(
        prod,
        item.cantidad,
        volMultiplier,
        0,
        activeSeason
      );
      
      const { netPrice, subtotal } = calculateItemPricing(
        prod,
        item.cantidad,
        volMultiplier,
        keyAccountDesc,
        activeSeason
      );
      
      grandTotal += subtotal;
      
      calculatedItems.push({
        producto_id: prod.id,
        producto_nombre: prod.producto,
        tipo_categoria: prod.tipo_categoria,
        tamano: item.tamano ? String(item.tamano).trim() : null,
        cantidad: item.cantidad,
        precio_lista: monthlyPricing.listPrice,
        precio_temporada: getSeasonPrice(prod.list_price_mxn, prod.tipo_categoria, activeSeason),
        precio_antes_cuenta_clave: priceBeforeKeyAccount,
        precio_neto: netPrice,
        descuento_cuenta_clave_mxn: Math.max(priceBeforeKeyAccount - netPrice, 0),
        max_discount_mxn: maxDiscountMxn,
        subtotal
      });
    }
    

    res.json({
      cliente_nombre: client.nombre,
      cuenta_clave_nombre: keyAccount ? keyAccount.tier_name : 'General',
      descuento_cuenta_clave_mxn: Number(keyAccountDesc) || 0,
      temporada_nombre: activeSeason ? activeSeason.actividad : 'Precio Lleno',
      vol_multiplier: volMultiplier,
      total_discountable_seeds: totalDiscountableSeeds,
      items: calculatedItems,
      total_mxn: grandTotal,
      // For APARTADO conditions: requires $2,000 pesos deposit per bag of seed
      anticipo_requerido: totalDiscountableSeeds * 2000.0
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Pricing calculation failed' });
  }
});

// CREATE QUOTATION / ORDER
app.post('/api/cotizaciones', authenticateToken, async (req, res) => {
  const { cliente_id, ciclo_agricola, condiciones_pago, temporada_id, items, financiera, notas, prospecto_id, planificacion_id, origen_etapa } = req.body;
  
  if (!cliente_id || !ciclo_agricola || !condiciones_pago || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required header or items list' });
  }
  
  try {
    // Generate unique Folio
    const date = new Date();
    const prefix = `CG-${date.getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const mesShort = date.toLocaleString('es-MX', { month: 'short' }).toUpperCase().slice(0, 3);
    const now = date.toISOString().slice(0, 10);
    
    // First run the pricing calculation
    const calcReq = { body: { cliente_id, items, temporada_id } };
    let calcResData;
    
    // Manual local function call logic to compute pricing safely
    const client = await db.get('SELECT * FROM clientes WHERE id = ? AND activo = 1', [cliente_id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (req.user.nivel_rol === 'Asesor' && client.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to quote for this client' });
    }
    let prospectId = null;
    let quoteAdvisorId = req.user.id;
    let directSalePlan = null;
    if (prospecto_id !== undefined && prospecto_id !== null) {
      const prospect = await db.get('SELECT * FROM crm_prospectos WHERE id = ?', [Number(prospecto_id)]);
      if (!prospect || prospect.cliente_id !== Number(cliente_id) || prospect.estado !== 'Prospecto'
        || (req.user.nivel_rol === 'Asesor' && prospect.asesor_id !== req.user.id)) {
        return res.status(400).json({ error: 'El prospecto seleccionado no está disponible para cotizar.' });
      }
      prospectId = prospect.id;
      quoteAdvisorId = prospect.asesor_id;
    }
    if (planificacion_id !== undefined && planificacion_id !== null) {
      if (prospectId || String(origen_etapa || '').trim().toUpperCase() !== 'V') {
        return res.status(400).json({ error: 'La cotización directa desde planificación solo está disponible para la etapa Venta.' });
      }
      directSalePlan = await db.get('SELECT * FROM planificacion_semanal WHERE id = ?', [Number(planificacion_id)]);
      if (!directSalePlan || directSalePlan.cliente_id !== Number(cliente_id)) {
        return res.status(400).json({ error: 'La visita de Venta no corresponde al agricultor seleccionado.' });
      }
      if (req.user.nivel_rol === 'Asesor' && directSalePlan.asesor_id !== req.user.id) {
        return res.status(403).json({ error: 'Solo puedes cotizar visitas asignadas a tu cuenta.' });
      }
      const stageRows = await db.all('SELECT clave, fecha_inicio, fecha_fin FROM crm_etapas_programacion');
      const activeStageCodes = getActiveStageCodesForDate(stageRows, directSalePlan.fecha_programada);
      if (!activeStageCodes.includes('V')) {
        return res.status(400).json({ error: 'La etapa Venta no está activa para la fecha de esta visita.' });
      }
      const existingProspect = await db.get('SELECT * FROM crm_prospectos WHERE planificacion_id = ?', [directSalePlan.id]);
      if (existingProspect) {
        return res.status(400).json({ error: 'Esta visita ya fue enviada al Canal de Ventas.' });
      }
      quoteAdvisorId = directSalePlan.asesor_id;
    }
    const ccId = client.cuenta_clave_id || 1;
    const keyAccount = await db.get('SELECT * FROM cuentas_clave WHERE id = ?', [ccId]);
    const keyAccountDesc = keyAccount ? keyAccount.descuento_mxn : 0.0;
    const activeSeason = temporada_id ? 
      await db.get('SELECT * FROM temporadas WHERE id = ?', [temporada_id]) : 
      await db.get("SELECT * FROM temporadas WHERE actividad = 'Temporada (Precio Lleno)'");
      
    const currentMonth = new Date().getMonth() + 1;
    let totalDiscountableSeeds = 0;
    const calculatedItems = [];
    let grandTotal = 0.0;
    
    for (const item of items) {
      const prod = await db.get('SELECT * FROM productos WHERE id = ? AND activo = 1', [item.producto_id]);
      if (!prod) return res.status(400).json({ error: `El producto seleccionado ya no está disponible para cotizar.` });
      const monthlyPricing = await getMonthlyProductPricing(prod, currentMonth);
      if (monthlyPricing.product.descontar === 1) totalDiscountableSeeds += item.cantidad;
      calculatedItems.push({ item, prod: monthlyPricing.product, monthlyPricing });
    }
    
    const volMultiplier = getVolumeMultiplier(totalDiscountableSeeds);
    
    for (const row of calculatedItems) {
      const prod = row.prod;
      const item = row.item;
      
      const { netPrice: baseNetPrice } = calculateItemPricing(
        prod,
        item.cantidad,
        volMultiplier,
        keyAccountDesc,
        activeSeason
      );
      
      // Look up and apply advisor discount safely
      const maxDiscountMxn = row.monthlyPricing.maxDiscountMxn;
      const discountApplied = Math.min(Math.max(Number(item.descuento_aplicado) || 0, 0), maxDiscountMxn);
      
      const netPrice = baseNetPrice - discountApplied;
      const subtotal = netPrice * item.cantidad;
      
      row.netPrice = netPrice;
      row.subtotal = subtotal;
      row.listPrice = row.monthlyPricing.listPrice;
      grandTotal += subtotal;
    }
    
    const anticipoApartado = condiciones_pago === 'APARTADO' ? totalDiscountableSeeds * 2000.0 : 0.0;
    
    // Status logic: quotations start as 'Pendiente' until authorized by Admin/Coordinator
    const defaultStatus = 'Pendiente';
    
    const cotId = await db.transaction(async (tx) => {
      const result = await tx.run(`
        INSERT INTO cotizaciones (fecha_creacion, cliente_id, asesor_id, ciclo_agricola, condiciones_pago, folio_cotizacion, mes, estatus, total_mxn, anticipo_apartado, notas, financiera, prospecto_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [now, cliente_id, quoteAdvisorId, ciclo_agricola, condiciones_pago, prefix, mesShort, defaultStatus, grandTotal, anticipoApartado, notas, financiera || null, prospectId]);
      
      const newCotId = result.id;
      
      for (const row of calculatedItems) {
        await tx.run(`
          INSERT INTO cotizacion_detalles (cotizacion_id, producto_id, temporada_id, cantidad_ordenada, cantidad_entregada, precio_lista_unitario, precio_neto_unitario, subtotal_mxn, tamano)
          VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
        `, [newCotId, row.item.producto_id, temporada_id || activeSeason.id, row.item.cantidad, row.listPrice, row.netPrice, row.subtotal, row.item.tamano ? String(row.item.tamano).trim() : null]);
      }

      if (directSalePlan) {
        const prospectResult = await tx.run(`
          INSERT INTO crm_prospectos (planificacion_id, cliente_id, asesor_id, estado, cotizacion_id)
          VALUES (?, ?, ?, 'En cotización', ?)
        `, [directSalePlan.id, directSalePlan.cliente_id, directSalePlan.asesor_id, newCotId]);
        prospectId = prospectResult.id;
        await tx.run('UPDATE cotizaciones SET prospecto_id = ? WHERE id = ?', [prospectId, newCotId]);
        await tx.run('UPDATE planificacion_semanal SET realizada = 1 WHERE id = ?', [directSalePlan.id]);
        await tx.run(`
          INSERT INTO crm_reportes_etapa (
            planificacion_id, visita_id, cliente_id, asesor_id, etapa_clave, fecha_reporte, respuestas, creado_en, actualizado_en
          ) VALUES (?, ?, ?, ?, 'V', ?, ?::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (planificacion_id, etapa_clave)
          DO UPDATE SET respuestas = EXCLUDED.respuestas, actualizado_en = CURRENT_TIMESTAMP
        `, [
          directSalePlan.id,
          directSalePlan.visita_id || null,
          directSalePlan.cliente_id,
          directSalePlan.asesor_id,
          directSalePlan.fecha_programada,
          JSON.stringify({ cotizacion_id: newCotId, enviada_a_cotizador: true })
        ]);
      }

      if (prospectId && !directSalePlan) {
        await tx.run("UPDATE crm_prospectos SET estado = 'En cotización', cotizacion_id = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?", [newCotId, prospectId]);
      }

      return newCotId;
    });
    
    res.status(201).json({ id: cotId, folio: prefix, total_mxn: grandTotal, status: defaultStatus, message: 'Quotation submitted successfully' });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create quotation' });
  }
});

async function getAttachmentQuoteAccess(quoteId, user) {
  const quote = await db.get('SELECT id, asesor_id, condiciones_pago FROM cotizaciones WHERE id = ?', [quoteId]);
  if (!quote) return { error: 'Cotización no encontrada.', status: 404 };
  if (user.nivel_rol === 'Asesor' && quote.asesor_id !== user.id) {
    return { error: 'No tienes acceso a los anexos de esta cotización.', status: 403 };
  }
  return { quote };
}

app.post('/api/cotizaciones/:id/adjuntos', authenticateToken, async (req, res) => {
  const quoteId = Number(req.params.id);
  const nombreArchivo = String(req.body.nombre_archivo || '').trim();
  const mimeType = String(req.body.mime_type || '').trim().toLowerCase();
  const contenidoBase64 = String(req.body.contenido_base64 || '').replace(/^data:application\/pdf;base64,/, '');
  if (!nombreArchivo || mimeType !== 'application/pdf' || !contenidoBase64) {
    return res.status(400).json({ error: 'Selecciona un archivo PDF válido.' });
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(contenidoBase64)) {
    return res.status(400).json({ error: 'El contenido del PDF no es válido.' });
  }
  const contenido = Buffer.from(contenidoBase64, 'base64');
  if (!contenido.length || contenido.length > 8 * 1024 * 1024 || contenido.subarray(0, 4).toString() !== '%PDF') {
    return res.status(400).json({ error: 'El anexo debe ser un PDF de hasta 8 MB.' });
  }
  try {
    const access = await getAttachmentQuoteAccess(quoteId, req.user);
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (access.quote.condiciones_pago !== 'CREDITO') {
      return res.status(400).json({ error: 'Solo las cotizaciones a crédito pueden tener un PDF adjunto.' });
    }
    const result = await db.run(
      'INSERT INTO cotizacion_adjuntos (cotizacion_id, nombre_archivo, mime_type, contenido, tamano_bytes) VALUES (?, ?, ?, ?, ?)',
      [quoteId, nombreArchivo.slice(0, 255), mimeType, contenido, contenido.length]
    );
    res.status(201).json({ id: result.id, message: 'PDF adjuntado correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No fue posible guardar el PDF adjunto.' });
  }
});

app.get('/api/cotizaciones/:id/adjuntos', authenticateToken, async (req, res) => {
  const quoteId = Number(req.params.id);
  try {
    const access = await getAttachmentQuoteAccess(quoteId, req.user);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const rows = await db.all(
      'SELECT id, nombre_archivo, mime_type, tamano_bytes, creado_en FROM cotizacion_adjuntos WHERE cotizacion_id = ? ORDER BY creado_en ASC',
      [quoteId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No fue posible consultar los anexos.' });
  }
});

app.get('/api/cotizaciones/:id/adjuntos/:adjuntoId/descargar', authenticateToken, async (req, res) => {
  const quoteId = Number(req.params.id);
  const attachmentId = Number(req.params.adjuntoId);
  try {
    const access = await getAttachmentQuoteAccess(quoteId, req.user);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const attachment = await db.get(
      'SELECT nombre_archivo, mime_type, contenido FROM cotizacion_adjuntos WHERE id = ? AND cotizacion_id = ?',
      [attachmentId, quoteId]
    );
    if (!attachment) return res.status(404).json({ error: 'Anexo no encontrado.' });
    res.type(attachment.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.nombre_archivo)}"`);
    res.send(attachment.contenido);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No fue posible descargar el anexo.' });
  }
});

// FETCH QUOTATIONS
app.get('/api/cotizaciones', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT q.*, c.nombre as cliente_nombre, a.nombre as asesor_nombre
      FROM cotizaciones q
      JOIN clientes c ON q.cliente_id = c.id
      JOIN asesores a ON q.asesor_id = a.id
    `;
    const params = [];
    
    if (req.user.nivel_rol === 'Asesor') {
      query += ` WHERE q.asesor_id = ?`;
      params.push(req.user.id);
    }
    
    query += ` ORDER BY q.fecha_creacion DESC`;
    const quotes = await db.all(query, params);
    
    // Fetch details for each quote
    for (const q of quotes) {
      q.items = await db.all(`
        SELECT d.*, p.producto as producto_nombre, p.tipo_categoria
        FROM cotizacion_detalles d
        JOIN productos p ON d.producto_id = p.id
        WHERE d.cotizacion_id = ?
      `, [q.id]);
    }
    
    res.json(quotes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch quotations' });
  }
});

app.put('/api/cotizaciones/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { estatus } = req.body;
  if (!estatus) return res.status(400).json({ error: 'Status is required' });
  
  try {
    const q = await db.get('SELECT * FROM cotizaciones WHERE id = ?', [id]);
    if (!q) return res.status(404).json({ error: 'Quotation not found' });
    
    if (req.user.nivel_rol === 'Asesor' && q.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (req.user.nivel_rol !== 'Administrador') {
      return res.status(403).json({ error: 'Solo un administrador puede autorizar o mover una cotización en el canal de ventas.' });
    }

    const allowedTransitions = {
      'Borrador': ['Autorizada'],
      'Pendiente': ['Autorizada'],
      'Pendiente Autorización': ['Autorizada'],
      'Autorizada': ['Vendido'],
      'Vendido': ['Autorizada', 'Entregado'],
      'Entregado': ['Vendido']
    };
    if (!allowedTransitions[q.estatus]?.includes(estatus)) {
      return res.status(400).json({ error: 'El movimiento solicitado no es válido para el estatus actual de la cotización.' });
    }
    
    // The last movement for the quotation is the source of truth for its current stock effect.
    const lastStockMovement = await db.get(
      'SELECT tipo_movimiento FROM almacen_movimientos WHERE cotizacion_id = ? ORDER BY id DESC LIMIT 1',
      [id]
    );
    const stockDeducted = Boolean(lastStockMovement?.tipo_movimiento?.startsWith('Salida'));
    
    const now = new Date().toISOString();
    const dateOnly = now.slice(0, 10);
    const items = await db.all('SELECT * FROM cotizacion_detalles WHERE cotizacion_id = ?', [id]);
    
    if (q.estatus !== 'Entregado' && estatus === 'Entregado') {
      // Inventory leaves the warehouse only when the quotation is delivered.
      if (!stockDeducted) {
        for (const item of items) {
          const last_move = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [item.producto_id]);
          const current_stock = last_move ? last_move.existencias_resultantes : 0.0;
          const new_stock = current_stock - item.cantidad_ordenada;
          
          await db.run(`
            INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, cotizacion_id, asesor_id, referencia_factura, notas)
            VALUES (?, 'Salida por Pedido', ?, 0, ?, ?, ?, ?, ?, ?)
          `, [now, item.producto_id, item.cantidad_ordenada, new_stock, id, req.user.id, q.folio_cotizacion, 'Salida registrada por entrega de cotización']);
        }
      }
      if (estatus === 'Entregado') {
        await db.run('UPDATE cotizacion_detalles SET cantidad_entregada = cantidad_ordenada WHERE cotizacion_id = ?', [id]);
      } else {
        await db.run('UPDATE cotizacion_detalles SET cantidad_entregada = 0 WHERE cotizacion_id = ?', [id]);
      }

      // Materialize commissions for quote
      await calcularComisionCotizacion(id);
      
    } else if (estatus === 'Borrador' || estatus === 'Autorizada' || estatus === 'Cancelado') {
      if (stockDeducted) {
        for (const item of items) {
          const last_move = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [item.producto_id]);
          const current_stock = last_move ? last_move.existencias_resultantes : 0.0;
          const new_stock = current_stock + item.cantidad_ordenada;
          
          await db.run(`
            INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, cotizacion_id, asesor_id, referencia_factura, notas)
            VALUES (?, 'Reversión por Cancelación', ?, ?, 0, ?, ?, ?, ?, ?)
          `, [now, item.producto_id, item.cantidad_ordenada, new_stock, id, req.user.id, q.folio_cotizacion, `Reversión por cambio de entregada a ${estatus}`]);
        }
      }
      await db.run('UPDATE cotizacion_detalles SET cantidad_entregada = 0 WHERE cotizacion_id = ?', [id]);

      // Revert / cancel commissions for quote
      await cancelarComisionCotizacion(id);
    }
    
    await db.run('UPDATE cotizaciones SET estatus = ? WHERE id = ?', [estatus, id]);
    if (estatus === 'Autorizada' && q.prospecto_id) {
      await db.run("UPDATE crm_prospectos SET estado = 'Convertido', actualizado_en = CURRENT_TIMESTAMP WHERE id = ?", [q.prospecto_id]);
    }
    
    res.json({ message: 'Quotation status updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// DELETE QUOTATION
app.delete('/api/cotizaciones/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  let client;
  try {
    const q = await db.get('SELECT * FROM cotizaciones WHERE id = ?', [id]);
    if (!q) return res.status(404).json({ error: 'Quotation not found' });
    
    // Authorization check
    if (req.user.nivel_rol === 'Asesor') {
      if (q.asesor_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized to delete this quote' });
      }
      if (!['Borrador', 'Pendiente', 'Pendiente Autorización'].includes(q.estatus)) {
        return res.status(403).json({ error: 'Un asesor solo puede eliminar sus cotizaciones pendientes de autorización.' });
      }
    }
    
    client = await db.pool.connect();
    await client.query('BEGIN');

    // The warehouse rows reference the quotation and must be removed before its header.
    await client.query('DELETE FROM almacen_movimientos WHERE cotizacion_id = $1', [id]);
    if (q.prospecto_id) {
      await client.query("UPDATE crm_prospectos SET estado = 'Prospecto', cotizacion_id = NULL, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1", [q.prospecto_id]);
    }
    await client.query('DELETE FROM cotizaciones WHERE id = $1', [id]);

    // Rebuild the running stock from the movements that remain in the warehouse.
    await client.query(`
      WITH recalculated AS (
        SELECT id,
          SUM(COALESCE(cantidad_entrante, 0) - COALESCE(cantidad_saliente, 0))
          OVER (PARTITION BY producto_id ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS existencias
        FROM almacen_movimientos
      )
      UPDATE almacen_movimientos m
      SET existencias_resultantes = recalculated.existencias
      FROM recalculated
      WHERE m.id = recalculated.id
    `);

    await client.query('COMMIT');
    res.json({ message: 'Quotation deleted successfully' });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Failed to roll back quotation deletion:', rollbackErr);
      }
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to delete quotation' });
  } finally {
    client?.release();
  }
});

// EDIT QUOTATION (HEADER & DETAILS)
app.put('/api/cotizaciones/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { ciclo_agricola, condiciones_pago, financiera, notas, temporada_id, items } = req.body;
  
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'items array is required' });
  }
  
  try {
    const q = await db.get('SELECT * FROM cotizaciones WHERE id = ?', [id]);
    if (!q) return res.status(404).json({ error: 'Quotation not found' });
    
    if (req.user.nivel_rol === 'Asesor' && q.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to edit this quote' });
    }
    if (req.user.nivel_rol === 'Asesor' && !['Borrador', 'Pendiente', 'Pendiente Autorización'].includes(q.estatus)) {
      return res.status(403).json({ error: 'Solo puedes editar tus cotizaciones pendientes de autorización.' });
    }
    
    // Only delivered quotations affect inventory, based on their latest movement.
    const lastStockMovement = await db.get(
      'SELECT tipo_movimiento FROM almacen_movimientos WHERE cotizacion_id = ? ORDER BY id DESC LIMIT 1',
      [id]
    );
    const stockDeducted = Boolean(lastStockMovement?.tipo_movimiento?.startsWith('Salida'));
    const now = new Date().toISOString();
    
    if (stockDeducted) {
      const oldItems = await db.all('SELECT * FROM cotizacion_detalles WHERE cotizacion_id = ?', [id]);
      for (const item of oldItems) {
        const last_move = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [item.producto_id]);
        const current_stock = last_move ? last_move.existencias_resultantes : 0.0;
        const new_stock = current_stock + item.cantidad_ordenada;
        
        await db.run(`
          INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, cotizacion_id, asesor_id, referencia_factura, notas)
          VALUES (?, 'Reversión por Edición', ?, ?, 0, ?, ?, ?, ?, ?)
        `, [now, item.producto_id, item.cantidad_ordenada, new_stock, id, req.user.id, q.folio_cotizacion, `Reversión de stock por edición de cotización`]);
      }
    }
    
    // Step 2: Calculate pricing for new items
    const client = await db.get('SELECT * FROM clientes WHERE id = ?', [q.cliente_id]);
    const ccId = client.cuenta_clave_id || 1;
    const keyAccount = await db.get('SELECT * FROM cuentas_clave WHERE id = ?', [ccId]);
    const keyAccountDesc = keyAccount ? keyAccount.descuento_mxn : 0.0;
    
    const activeSeason = temporada_id ? 
      await db.get('SELECT * FROM temporadas WHERE id = ?', [temporada_id]) : 
      await db.get("SELECT * FROM temporadas WHERE actividad = 'Temporada (Precio Lleno)'");
      
    const currentMonth = new Date().getMonth() + 1;
    let totalDiscountableSeeds = 0;
    const calculatedRows = [];
    
    for (const item of items) {
      const prod = await db.get('SELECT * FROM productos WHERE id = ? AND activo = 1', [item.producto_id]);
      if (!prod) return res.status(400).json({ error: `El producto seleccionado ya no está disponible para cotizar.` });
      
      const monthlyPricing = await getMonthlyProductPricing(prod, currentMonth);
      if (monthlyPricing.product.descontar === 1) {
        totalDiscountableSeeds += item.cantidad;
      }
      calculatedRows.push({ item, prod: monthlyPricing.product, monthlyPricing });
    }
    
    // Using canonical getVolumeMultiplier imported from utils/pricing.js
    
    const volMultiplier = getVolumeMultiplier(totalDiscountableSeeds);
    let grandTotal = 0.0;
    
    for (const row of calculatedRows) {
      const prod = row.prod;
      const item = row.item;
      
      const { netPrice: baseNetPrice } = calculateItemPricing(
        prod,
        item.cantidad,
        volMultiplier,
        keyAccountDesc,
        activeSeason
      );
      
      // Look up and apply advisor discount safely
      const maxDiscountMxn = row.monthlyPricing.maxDiscountMxn;
      const discountApplied = Math.min(Math.max(Number(item.descuento_aplicado) || 0, 0), maxDiscountMxn);
      
      const netPrice = baseNetPrice - discountApplied;
      const subtotal = netPrice * item.cantidad;
      
      row.netPrice = netPrice;
      row.subtotal = subtotal;
      row.listPrice = row.monthlyPricing.listPrice;
      grandTotal += subtotal;
    }
    
    await db.transaction(async (tx) => {
      // Step 1: Revert old stock movements if delivered
      if (stockDeducted) {
        const oldItems = await tx.all('SELECT * FROM cotizacion_detalles WHERE cotizacion_id = ?', [id]);
        for (const item of oldItems) {
          const last_move = await tx.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [item.producto_id]);
          const current_stock = last_move ? last_move.existencias_resultantes : 0.0;
          const new_stock = current_stock + item.cantidad_ordenada;
          
          await tx.run(`
            INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, cotizacion_id, asesor_id, referencia_factura, notas)
            VALUES (?, 'Reversión por Edición', ?, ?, 0, ?, ?, ?, ?, ?)
          `, [now, item.producto_id, item.cantidad_ordenada, new_stock, id, req.user.id, q.folio_cotizacion, `Reversión de stock por edición de cotización`]);
        }
      }

      // Step 3: Delete old details
      await tx.run('DELETE FROM cotizacion_detalles WHERE cotizacion_id = ?', [id]);
      
      // Step 4: Insert new details
      for (const row of calculatedRows) {
        await tx.run(`
          INSERT INTO cotizacion_detalles (cotizacion_id, producto_id, temporada_id, cantidad_ordenada, cantidad_entregada, precio_lista_unitario, precio_neto_unitario, subtotal_mxn, tamano)
          VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
        `, [id, row.item.producto_id, temporada_id || (activeSeason ? activeSeason.id : 1), row.item.cantidad, row.listPrice, row.netPrice, row.subtotal, row.item.tamano ? String(row.item.tamano).trim() : null]);
      }
      
      // Update header
      const anticipoApartado = condiciones_pago === 'APARTADO' ? totalDiscountableSeeds * 2000.0 : 0.0;
      
      await tx.run(`
        UPDATE cotizaciones
        SET ciclo_agricola = ?, condiciones_pago = ?, financiera = ?, notas = ?, total_mxn = ?, anticipo_apartado = ?
        WHERE id = ?
      `, [ciclo_agricola, condiciones_pago, financiera || null, notas || null, grandTotal, anticipoApartado, id]);
      
      // Step 5: Re-deduct stock only when the quotation was already delivered.
      if (q.estatus === 'Entregado') {
        for (const row of calculatedRows) {
          const last_move = await tx.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [row.item.producto_id]);
          const current_stock = last_move ? last_move.existencias_resultantes : 0.0;
          const new_stock = current_stock - row.item.cantidad;
          
          await tx.run(`
            INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, cotizacion_id, asesor_id, referencia_factura, notas)
            VALUES (?, 'Salida por Pedido (Editado)', ?, 0, ?, ?, ?, ?, ?, ?)
          `, [now, row.item.producto_id, row.item.cantidad, new_stock, id, req.user.id, q.folio_cotizacion, `Salida registrada por cambio de detalles de cotización`]);
        }
        
        await tx.run('UPDATE cotizacion_detalles SET cantidad_entregada = cantidad_ordenada WHERE cotizacion_id = ?', [id]);
      }
    });
    
    res.json({ message: 'Quotation updated successfully', total_mxn: grandTotal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update quotation' });
  }
});

// -------------------------------------------------------------
// WAREHOUSE & INVENTORY ENDPOINTS
// -------------------------------------------------------------

app.get('/api/almacen/existencias', authenticateToken, async (req, res) => {
  try {
    const products = await db.all('SELECT id, producto, tipo_categoria, list_price_mxn FROM productos WHERE activo = 1');
    const existencias = [];
    
    for (const p of products) {
      const last_move = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [p.id]);
      existencias.push({
        id: p.id,
        producto: p.producto,
        tipo_categoria: p.tipo_categoria,
        existencias: last_move ? Number(last_move.existencias_resultantes || 0) : 0.0
      });
    }
    res.json(existencias);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stock existencias' });
  }
});

app.get('/api/almacen/movimientos', authenticateToken, async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    const productId = Number(req.query.producto_id);
    const movementType = String(req.query.tipo_movimiento || '').trim();
    const categoria = String(req.query.categoria || '').trim();
    
    if (Number.isInteger(productId) && productId > 0) {
      conditions.push('m.producto_id = ?');
      params.push(productId);
    }
    if (movementType) {
      conditions.push('m.tipo_movimiento LIKE ?');
      params.push(`%${movementType}%`);
    }
    if (categoria) {
      conditions.push('m.categoria = ?');
      params.push(categoria);
    }
    
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await db.all(`
      SELECT m.*, 
             p.producto as producto_nombre, 
             p.tipo_categoria as producto_categoria_orig,
             a.nombre as asesor_nombre, 
             cli.nombre as cliente_nombre,
             c.folio_cotizacion
      FROM almacen_movimientos m
      JOIN productos p ON m.producto_id = p.id
      LEFT JOIN asesores a ON m.asesor_id = a.id
      LEFT JOIN clientes cli ON m.cliente_id = cli.id
      LEFT JOIN cotizaciones c ON m.cotizacion_id = c.id
      ${whereClause}
      ORDER BY m.id DESC LIMIT 500
    `, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch warehouse movements' });
  }
});

app.get('/api/almacen/movimientos/tipos', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all('SELECT DISTINCT tipo_movimiento FROM almacen_movimientos WHERE tipo_movimiento IS NOT NULL AND tipo_movimiento <> \'\' ORDER BY tipo_movimiento ASC');
    res.json(rows.map(row => row.tipo_movimiento));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch warehouse movement types' });
  }
});

app.get('/api/almacen/lotes-disponibles', authenticateToken, async (req, res) => {
  const prodId = Number(req.query.producto_id);
  const tamano = req.query.tamano ? String(req.query.tamano).trim() : null;

  if (!prodId) {
    return res.status(400).json({ error: 'El producto_id es requerido' });
  }

  try {
    let sql = `
      SELECT lote, tamano, (SUM(COALESCE(cantidad_entrante, 0)) - SUM(COALESCE(cantidad_saliente, 0))) AS existencias
      FROM almacen_movimientos
      WHERE producto_id = ? AND lote IS NOT NULL AND TRIM(lote) <> ''
    `;
    const params = [prodId];

    if (tamano) {
      sql += ' AND tamano = ?';
      params.push(tamano);
    }

    sql += `
      GROUP BY lote, tamano
      HAVING (SUM(COALESCE(cantidad_entrante, 0)) - SUM(COALESCE(cantidad_saliente, 0))) > 0
      ORDER BY lote ASC
    `;

    const rows = await db.all(sql, params);
    const result = rows.map(r => ({
      lote: r.lote,
      tamano: r.tamano,
      existencias: Math.round((Number(r.existencias) || 0) * 1000) / 1000
    }));
    res.json(result);
  } catch (err) {
    console.error('Error fetching available lots:', err);
    res.status(500).json({ error: 'Failed to fetch available lots' });
  }
});

app.get('/api/almacen/lotes-historial', authenticateToken, async (req, res) => {
  const prodId = Number(req.query.producto_id);
  const tamano = req.query.tamano ? String(req.query.tamano).trim() : null;

  if (!prodId) {
    return res.status(400).json({ error: 'El producto_id es requerido' });
  }

  try {
    let sql = `
      SELECT DISTINCT lote
      FROM almacen_movimientos
      WHERE producto_id = ? AND lote IS NOT NULL AND TRIM(lote) <> ''
    `;
    const params = [prodId];

    if (tamano) {
      sql += ' AND tamano = ?';
      params.push(tamano);
    }

    sql += ' ORDER BY lote ASC';

    const rows = await db.all(sql, params);
    res.json(rows.map(r => r.lote));
  } catch (err) {
    console.error('Error fetching lot history:', err);
    res.status(500).json({ error: 'Failed to fetch lot history' });
  }
});

app.post('/api/almacen/existencias/:productoId/ajuste', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Solo un administrador puede ajustar existencias físicas.' });
  }

  const productId = Number(req.params.productoId);
  const targetStock = Number(req.body.existencias);
  const notes = String(req.body.notas || '').trim();
  if (!Number.isInteger(productId) || productId <= 0 || !Number.isFinite(targetStock) || targetStock < 0) {
    return res.status(400).json({ error: 'Indica una existencia física válida, igual o mayor a cero.' });
  }

  try {
    const product = await db.get('SELECT id, producto, tipo_categoria FROM productos WHERE id = ?', [productId]);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado.' });

    const lastMove = await db.get(
      'SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1',
      [productId]
    );
    const currentStock = Number(lastMove?.existencias_resultantes || 0);
    const difference = targetStock - currentStock;
    if (difference === 0) return res.json({ existencias: currentStock, message: 'Las existencias ya tienen ese valor.' });

    const cat = product.tipo_categoria === 'Híbrido' || product.tipo_categoria === 'Semilla' ? 'Semilla' : 'Agroquímicos';

    await db.run(`
      INSERT INTO almacen_movimientos
        (fecha_movimiento, tipo_movimiento, categoria, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, referencia_factura, asesor_id, notas)
      VALUES (?, 'Ajuste de Inventario', ?, ?, ?, ?, ?, 'Ajuste manual', ?, ?)
    `, [
      new Date().toISOString(),
      cat,
      productId,
      difference > 0 ? difference : 0,
      difference < 0 ? Math.abs(difference) : 0,
      targetStock,
      req.user.id,
      notes || `Ajuste de existencias físicas de ${currentStock} a ${targetStock}.`
    ]);
    res.status(201).json({ existencias: targetStock, message: 'Existencias ajustadas correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No fue posible ajustar las existencias.' });
  }
});

app.post('/api/almacen/movimientos', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Permisos insuficientes para registrar movimientos de almacén.' });
  }

  const items = normalizeMovementItems(req.body);
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Debe especificar al menos un producto para registrar el movimiento.' });
  }

  const {
    categoria,
    tipo,
    tipo_movimiento,
    opcion_operacion,
    numero_remision,
    numero_movimiento,
    fecha_movimiento,
    asesor_id,
    cliente_id,
    proveedor_cliente,
    referencia_factura,
    notas
  } = req.body;

  const isSalida = String(tipo || tipo_movimiento || '').toLowerCase().includes('salida');
  const fullTipoMovimiento = tipo_movimiento || (isSalida ? `Salida (${opcion_operacion || 'Venta'})` : 'Entrada');
  const dateVal = fecha_movimiento || new Date().toISOString();

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Validaciones previas de todas las partidas
      const productRunningStock = new Map();
      const lotRunningStock = new Map();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const indexLabel = items.length > 1 ? ` (Partida #${i + 1})` : '';

        if (!item.producto_id || item.producto_id <= 0) {
          throw new Error(`El producto es requerido${indexLabel}`);
        }
        if (item.cantidad <= 0) {
          throw new Error(`La cantidad debe ser mayor a cero${indexLabel}`);
        }
        if (!item.lote) {
          throw new Error(`El lote es obligatorio${indexLabel}`);
        }

        const prod = await tx.get('SELECT * FROM productos WHERE id = ?', [item.producto_id]);
        if (!prod) {
          throw new Error(`Producto #${item.producto_id} no encontrado${indexLabel}`);
        }

        const isSeed = item.categoria === 'Semilla' || prod.tipo_categoria === 'Híbrido' || prod.tipo_categoria === 'Semilla';
        if (isSeed && !item.tamano) {
          throw new Error(`El tamaño es obligatorio para el producto "${prod.producto}"${indexLabel}`);
        }

        if (isSalida) {
          // Validar existencias globales del producto
          if (!productRunningStock.has(item.producto_id)) {
            const lastMove = await tx.get(
              'SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1',
              [item.producto_id]
            );
            productRunningStock.set(item.producto_id, lastMove ? Number(lastMove.existencias_resultantes || 0) : 0.0);
          }

          const currentProdStock = productRunningStock.get(item.producto_id);
          if (currentProdStock < item.cantidad) {
            throw new Error(
              `Existencias insuficientes para el producto "${prod.producto}"${indexLabel}. Disponibles: ${currentProdStock.toLocaleString('es-MX', { minimumFractionDigits: 3 })}`
            );
          }
          productRunningStock.set(item.producto_id, currentProdStock - item.cantidad);

          // Validar existencias específicas por lote
          const lotKey = `${item.producto_id}__${item.lote.toUpperCase()}__${(item.tamano || '').toUpperCase()}`;
          if (!lotRunningStock.has(lotKey)) {
            let lotQuery = `
              SELECT (SUM(COALESCE(cantidad_entrante, 0)) - SUM(COALESCE(cantidad_saliente, 0))) AS existencias
              FROM almacen_movimientos
              WHERE producto_id = ? AND lote = ?
            `;
            const lotParams = [item.producto_id, item.lote];
            if (item.tamano) {
              lotQuery += ' AND tamano = ?';
              lotParams.push(item.tamano);
            }
            const lotRes = await tx.get(lotQuery, lotParams);
            lotRunningStock.set(lotKey, lotRes ? (Number(lotRes.existencias) || 0.0) : 0.0);
          }

          const currentLotStock = lotRunningStock.get(lotKey);
          if (currentLotStock < item.cantidad) {
            throw new Error(
              `Existencias insuficientes para el lote "${item.lote}" del producto "${prod.producto}"${indexLabel}. Disponibles: ${currentLotStock.toLocaleString('es-MX', { minimumFractionDigits: 3 })}, Requeridas: ${item.cantidad.toLocaleString('es-MX', { minimumFractionDigits: 3 })}`
            );
          }
          lotRunningStock.set(lotKey, currentLotStock - item.cantidad);
        }
      }

      // 2. Inserción atómica de todos los renglones
      productRunningStock.clear();
      let lastResultingStock = 0.0;

      for (const item of items) {
        if (!productRunningStock.has(item.producto_id)) {
          const lastMove = await tx.get(
            'SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1',
            [item.producto_id]
          );
          productRunningStock.set(item.producto_id, lastMove ? Number(lastMove.existencias_resultantes || 0) : 0.0);
        }

        const currentStock = productRunningStock.get(item.producto_id);
        const ent = isSalida ? 0.0 : item.cantidad;
        const sal = isSalida ? item.cantidad : 0.0;
        const newStock = currentStock + ent - sal;
        productRunningStock.set(item.producto_id, newStock);
        lastResultingStock = newStock;

        await tx.run(`
          INSERT INTO almacen_movimientos (
            fecha_movimiento, 
            tipo_movimiento, 
            categoria,
            producto_id, 
            lote,
            tamano,
            opcion_operacion,
            numero_remision,
            numero_movimiento,
            precio_venta,
            proveedor_cliente,
            cantidad_entrante, 
            cantidad_saliente, 
            existencias_resultantes, 
            referencia_factura, 
            asesor_id,
            cliente_id,
            notas
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          dateVal,
          fullTipoMovimiento,
          item.categoria || categoria || 'Agroquímicos',
          item.producto_id,
          item.lote || null,
          item.tamano || null,
          opcion_operacion || null,
          numero_remision || null,
          numero_movimiento || referencia_factura || null,
          Number(item.precio_venta) || 0.0,
          proveedor_cliente || null,
          ent,
          sal,
          newStock,
          referencia_factura || numero_movimiento || null,
          asesor_id || req.user.id,
          cliente_id || null,
          notas || null
        ]);
      }

      return { count: items.length, existencias: lastResultingStock };
    });

    const msg = result.count > 1
      ? `Se registraron ${result.count} partidas de producto exitosamente en la remisión ${numero_remision || numero_movimiento || ''}`.trim()
      : 'Movimiento de almacén registrado correctamente';

    res.status(201).json({
      success: true,
      count: result.count,
      existencias: result.existencias,
      message: msg
    });
  } catch (err) {
    console.error('Error registrando movimiento de almacén:', err);
    res.status(400).json({ error: err.message || 'No se pudo registrar el movimiento de almacén' });
  }
});

app.delete('/api/almacen/movimientos/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Solo un administrador puede eliminar movimientos.' });
  }

  const moveId = Number(req.params.id);
  if (!moveId) return res.status(400).json({ error: 'ID de movimiento inválido.' });

  try {
    const move = await db.get('SELECT * FROM almacen_movimientos WHERE id = ?', [moveId]);
    if (!move) return res.status(404).json({ error: 'Movimiento no encontrado.' });

    await db.run('DELETE FROM almacen_movimientos WHERE id = ?', [moveId]);

    const subsequentMoves = await db.all('SELECT * FROM almacen_movimientos WHERE producto_id = ? AND id > ? ORDER BY id ASC', [move.producto_id, moveId]);
    const previousMove = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? AND id < ? ORDER BY id DESC LIMIT 1', [move.producto_id, moveId]);
    
    let runningStock = previousMove ? Number(previousMove.existencias_resultantes || 0) : 0;
    
    for (const m of subsequentMoves) {
      runningStock = runningStock + Number(m.cantidad_entrante || 0) - Number(m.cantidad_saliente || 0);
      await db.run('UPDATE almacen_movimientos SET existencias_resultantes = ? WHERE id = ?', [runningStock, m.id]);
    }

    res.json({ message: 'Movimiento eliminado correctamente.' });
  } catch (err) {
    console.error('Error eliminando movimiento:', err);
    res.status(500).json({ error: 'No se pudo eliminar el movimiento.' });
  }
});

// INTERNAL UAN-32 PRODUCTION
app.post('/api/almacen/produccion-uan32', authenticateToken, async (req, res) => {
  const { cantidad_solub_toneladas } = req.body;
  if (!cantidad_solub_toneladas || Number(cantidad_solub_toneladas) <= 0) {
    return res.status(400).json({ error: 'cantidad_solub_toneladas must be a positive number' });
  }
  
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Permisos insuficientes para producción interna de UAN-32.' });
  }
  
  try {
    const solub = await db.get("SELECT id FROM productos WHERE producto LIKE '%Solub 45%'");
    const uan = await db.get("SELECT id FROM productos WHERE producto = 'UAN-32'");
    
    if (!solub || !uan) return res.status(404).json({ error: 'Solub 45 or UAN-32 products not found in catalog' });
    
    const last_solub = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [solub.id]);
    const current_solub = last_solub ? last_solub.existencias_resultantes : 0.0;
    
    const solub_to_deduct = Number(cantidad_solub_toneladas);
    if (current_solub < solub_to_deduct) {
      return res.status(400).json({ error: `Insufficient stock of Novatec Solub 45 (Current: ${current_solub} Tons)` });
    }
    
    // Conversion formula: 2000 Liters of UAN-32 per 1 Ton of Solub 45
    const uan_to_add = solub_to_deduct * 2000.0;
    
    const last_uan = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [uan.id]);
    const current_uan = last_uan ? last_uan.existencias_resultantes : 0.0;
    
    const new_solub = current_solub - solub_to_deduct;
    const new_uan = current_uan + uan_to_add;
    
    const now = new Date().toISOString();
    
    // Deduct Solub
    await db.run(`
      INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, asesor_id, notas)
      VALUES (?, 'Conversión Producción UAN-32', ?, 0, ?, ?, ?, 'Salida de materia prima para producción interna UAN-32')
    `, [now, solub.id, solub_to_deduct, new_solub, req.user.id]);
    
    // Add UAN
    await db.run(`
      INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, asesor_id, notas)
      VALUES (?, 'Conversión Producción UAN-32', ?, ?, 0, ?, ?, 'Entrada de producto terminado por producción interna')
    `, [now, uan.id, uan_to_add, new_uan, req.user.id]);
    
    res.json({
      solub_existencias: new_solub,
      uan_existencias: new_uan,
      uan_produced_liters: uan_to_add,
      message: 'UAN-32 production successfully completed and stock updated.'
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'UAN-32 conversion process failed' });
  }
});

// -------------------------------------------------------------
// DASHBOARD & ANALYTICS ENDPOINTS
// -------------------------------------------------------------

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const ciclo = req.query.ciclo_agricola || 'O-I 2026';
    
    // 1. Clients Count
    let clientsSql = 'SELECT count(*) as count FROM clientes WHERE activo = 1';
    const clientsParams = [];
    if (req.user.nivel_rol === 'Asesor') {
      clientsSql += ' AND asesor_id = ?';
      clientsParams.push(req.user.id);
    }
    const clientsCount = await db.get(clientsSql, clientsParams);

    // 2. Promesa de Venta (Borrador/Autorizada)
    let promesaSql = "SELECT COALESCE(SUM(total_mxn), 0.0) as total FROM cotizaciones WHERE estatus IN ('Borrador', 'Autorizada') AND ciclo_agricola = ?";
    const promesaParams = [ciclo];
    if (req.user.nivel_rol === 'Asesor') {
      promesaSql += ' AND asesor_id = ?';
      promesaParams.push(req.user.id);
    }
    const promesaRes = await db.get(promesaSql, promesaParams);

    // 3. Ventas Contado (Contado + Vendido/Entregado)
    let contadoSql = "SELECT COALESCE(SUM(total_mxn), 0.0) as total FROM cotizaciones WHERE condiciones_pago = 'Contado' AND estatus IN ('Vendido', 'Entregado') AND ciclo_agricola = ?";
    const contadoParams = [ciclo];
    if (req.user.nivel_rol === 'Asesor') {
      contadoSql += ' AND asesor_id = ?';
      contadoParams.push(req.user.id);
    }
    const contadoRes = await db.get(contadoSql, contadoParams);

    // 4. Ventas Crédito (Crédito + Entregado)
    let creditoSql = "SELECT COALESCE(SUM(total_mxn), 0.0) as total FROM cotizaciones WHERE (condiciones_pago LIKE '%Crédito%' OR condiciones_pago LIKE '%Credito%') AND estatus = 'Entregado' AND ciclo_agricola = ?";
    const creditoParams = [ciclo];
    if (req.user.nivel_rol === 'Asesor') {
      creditoSql += ' AND asesor_id = ?';
      creditoParams.push(req.user.id);
    }
    const creditoRes = await db.get(creditoSql, creditoParams);

    // 5. Monto Recuperado (Crédito + Vendido)
    let recuperadoSql = "SELECT COALESCE(SUM(total_mxn), 0.0) as total FROM cotizaciones WHERE (condiciones_pago LIKE '%Crédito%' OR condiciones_pago LIKE '%Credito%') AND estatus = 'Vendido' AND ciclo_agricola = ?";
    const recuperadoParams = [ciclo];
    if (req.user.nivel_rol === 'Asesor') {
      recuperadoSql += ' AND asesor_id = ?';
      recuperadoParams.push(req.user.id);
    }
    const recuperadoRes = await db.get(recuperadoSql, recuperadoParams);

    const promesa_sales_mxn = promesaRes ? promesaRes.total : 0.0;
    const contado_sales_mxn = contadoRes ? contadoRes.total : 0.0;
    const credito_sales_mxn = creditoRes ? creditoRes.total : 0.0;
    const recuperado_sales_mxn = recuperadoRes ? recuperadoRes.total : 0.0;
    const total_sales_mxn = contado_sales_mxn + recuperado_sales_mxn;

    // 6. Real quantities for goals
    let realSql = `
      SELECT 
        COALESCE(SUM(CASE WHEN p.tipo_categoria = 'Híbrido' THEN cd.cantidad_ordenada ELSE 0 END), 0) as real_semilla,
        COALESCE(SUM(CASE WHEN p.tipo_categoria = 'Agroquímico' AND p.producto ILIKE '%Faena%' THEN cd.cantidad_ordenada ELSE 0 END), 0) as real_faena,
        COALESCE(SUM(CASE WHEN p.tipo_categoria = 'Agroquímico' AND p.producto ILIKE '%Clavis%' THEN cd.cantidad_ordenada ELSE 0 END), 0) as real_clavis,
        COALESCE(SUM(CASE WHEN p.tipo_categoria = 'Agroquímico' AND p.producto NOT ILIKE '%Faena%' AND p.producto NOT ILIKE '%Clavis%' THEN cd.cantidad_ordenada ELSE 0 END), 0) as real_cropprotection,
        COALESCE(SUM(CASE WHEN p.tipo_categoria = 'Fertilizante' THEN cd.cantidad_ordenada ELSE 0 END), 0) as real_cosecha
      FROM cotizacion_detalles cd
      JOIN productos p ON cd.producto_id = p.id
      JOIN cotizaciones c ON cd.cotizacion_id = c.id
      WHERE c.estatus IN ('Vendido', 'Entregado') AND c.ciclo_agricola = ?
    `;
    const realParams = [ciclo];
    if (req.user.nivel_rol === 'Asesor') {
      realSql += ' AND c.asesor_id = ?';
      realParams.push(req.user.id);
    }
    const realRes = await db.get(realSql, realParams);

    // 7. Target quantities (metas)
    let targetsSql = `
      SELECT 
        COALESCE(SUM(bolsas_objetivo), 0) as target_semilla,
        COALESCE(SUM(meta_faena), 0) as target_faena,
        COALESCE(SUM(meta_clavis), 0) as target_clavis,
        COALESCE(SUM(meta_cropprotection), 0) as target_cropprotection,
        COALESCE(SUM(meta_cosecha), 0) as target_cosecha,
        COALESCE(SUM(monto_objetivo_mxn), 0.0) as target_monto
      FROM metas_ventas
      WHERE ciclo_agricola = ? AND activo = 1
    `;
    const targetsParams = [ciclo];
    if (req.user.nivel_rol === 'Asesor') {
      targetsSql += ' AND asesor_id = ?';
      targetsParams.push(req.user.id);
    }
    const targetsRes = await db.get(targetsSql, targetsParams);

    const goals_progress = [
      { category: 'Semilla', target: targetsRes ? targetsRes.target_semilla : 0, real: realRes ? realRes.real_semilla : 0, unit: 'bolsas' },
      { category: 'Agroquímicos (Faena)', target: targetsRes ? targetsRes.target_faena : 0, real: realRes ? realRes.real_faena : 0, unit: 'L/kg' },
      { category: 'Agroquímicos (Clavis)', target: targetsRes ? targetsRes.target_clavis : 0, real: realRes ? realRes.real_clavis : 0, unit: 'L/kg' },
      { category: 'Agroquímicos (Crop Protection)', target: targetsRes ? targetsRes.target_cropprotection : 0, real: realRes ? realRes.real_cropprotection : 0, unit: 'L/kg' },
      { category: 'Cosecha', target: targetsRes ? targetsRes.target_cosecha : 0, real: realRes ? realRes.real_cosecha : 0, unit: 'toneladas' }
    ];

    // 8. Performance cards for active advisors
    const performanceSql = `
      SELECT 
        a.id, 
        a.nombre, 
        a.usuario, 
        a.email, 
        a.telefono, 
        COALESCE(a.calificacion, 5.0) as calificacion,
        COALESCE(c.client_count, 0) as client_count,
        COALESCE(q.quote_count, 0) as quote_count,
        COALESCE(s.sales_total, 0.0) as sales_total,
        COALESCE(p.plan_completed, 0) as plan_completed,
        COALESCE(p.plan_expired, 0) as plan_expired,
        COALESCE(p.plan_total, 0) as plan_total
      FROM asesores a
      LEFT JOIN (
        SELECT asesor_id, COUNT(DISTINCT COALESCE(cliente_principal_id, id)) as client_count 
        FROM clientes 
        WHERE activo = 1 
        GROUP BY asesor_id
      ) c ON c.asesor_id = a.id
      LEFT JOIN (
        SELECT asesor_id, COUNT(*) as quote_count 
        FROM cotizaciones 
        WHERE ciclo_agricola = ?
        GROUP BY asesor_id
      ) q ON q.asesor_id = a.id
      LEFT JOIN (
        SELECT asesor_id, SUM(total_mxn) as sales_total 
        FROM cotizaciones 
        WHERE estatus IN ('Vendido', 'Entregado') AND ciclo_agricola = ?
        GROUP BY asesor_id
      ) s ON s.asesor_id = a.id
      LEFT JOIN (
        SELECT 
          asesor_id, 
          COUNT(*) as plan_total,
          SUM(CASE WHEN realizada = 1 THEN 1 ELSE 0 END) as plan_completed,
          SUM(CASE WHEN realizada = 3 THEN 1 ELSE 0 END) as plan_expired
        FROM planificacion_semanal 
        WHERE fecha_programada >= (CURRENT_DATE - 7)
        GROUP BY asesor_id
      ) p ON p.asesor_id = a.id

      WHERE a.activo = 1 AND a.nivel_rol = 'Asesor'
      ORDER BY sales_total DESC, a.nombre ASC
    `;
    const performanceParams = [ciclo, ciclo];
    const scopedPerformanceSql = req.user.nivel_rol === 'Asesor'
      ? performanceSql.replace("WHERE a.activo = 1 AND a.nivel_rol = 'Asesor'", "WHERE a.activo = 1 AND a.nivel_rol = 'Asesor' AND a.id = ?")
      : performanceSql;
    if (req.user.nivel_rol === 'Asesor') performanceParams.push(req.user.id);
    const performance = await db.all(scopedPerformanceSql, performanceParams);

    // Backward compatible
    let visitsSql = `
      SELECT a.nombre as adviser, count(v.id) as count
      FROM asesores a
      LEFT JOIN crm_visitas v ON v.asesor_id = a.id
      WHERE a.activo = 1
    `;
    const visitsParams = [];
    if (req.user.nivel_rol === 'Asesor') {
      visitsSql += ' AND a.id = ?';
      visitsParams.push(req.user.id);
    }
    visitsSql += ' GROUP BY a.id ORDER BY count DESC';
    const visits = await db.all(visitsSql, visitsParams);

    res.json({
      total_clients: clientsCount ? Number(clientsCount.count) : 0,
      promesa_sales_mxn: Number(promesa_sales_mxn),
      contado_sales_mxn: Number(contado_sales_mxn),
      credito_sales_mxn: Number(credito_sales_mxn),
      recuperado_sales_mxn: Number(recuperado_sales_mxn),
      total_sales_mxn: Number(total_sales_mxn),
      goals_progress,
      advisers_visits: visits,
      advisers_performance: performance
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Direct assignment of client to advisor
app.put('/api/asignacion/clientes/:id/asesor', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  const { asesor_id } = req.body;
  
  try {
    const client = await db.get('SELECT * FROM clientes WHERE id = ? AND activo = 1', [id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    const oldAsesorId = client.asesor_id;
    await db.run('UPDATE clientes SET asesor_id = ?, disponible_para_puja = 0 WHERE id = ?', [asesor_id || null, id]);
    
    // Create notifications for changes
    if (asesor_id && Number(oldAsesorId) !== Number(asesor_id)) {
      await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
        [asesor_id, `Se te ha asignado al agricultor: ${client.nombre}`]);
    }
    
    if (oldAsesorId && Number(oldAsesorId) !== Number(asesor_id)) {
      await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
        [oldAsesorId, `Se te ha retirado del agricultor: ${client.nombre}`]);
    }
    
    // Reject any pending bids and notify those advisors
    const pendingBids = await db.all("SELECT id, asesor_id FROM crm_pujas WHERE cliente_id = ? AND estatus = 'Pendiente'", [id]);
    for (const b of pendingBids) {
      if (asesor_id && Number(b.asesor_id) === Number(asesor_id)) {
        await db.run("UPDATE crm_pujas SET estatus = 'Aprobada' WHERE id = ?", [b.id]);
        await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
          [b.asesor_id, `Tu propuesta para el agricultor ${client.nombre} fue Aprobada y se te ha asignado.`]);
      } else {
        await db.run("UPDATE crm_pujas SET estatus = 'Rechazada' WHERE id = ?", [b.id]);
        await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
          [b.asesor_id, `Tu propuesta para el agricultor ${client.nombre} fue rechazada (asignado a otro asesor).`]);
      }
    }
    
    res.json({ message: 'Client advisor assigned successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign client advisor' });
  }
});

// Fetch clients without advisors
app.get('/api/asignacion/sin-asesor', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT c.*, cc.tier_name as cuenta_clave_nombre, cc.descuento_mxn
      FROM clientes c
      LEFT JOIN cuentas_clave cc ON c.cuenta_clave_id = cc.id
      WHERE c.activo = 1 AND c.asesor_id IS NULL
      ORDER BY c.nombre ASC
    `;
    const clients = await db.all(query);
    res.json(clients);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch unassigned clients' });
  }
});

// Update client biddable status
app.put('/api/clientes/:id/puja-status', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  const { disponible_para_puja } = req.body;
  
  try {
    const client = await db.get('SELECT * FROM clientes WHERE id = ? AND activo = 1', [id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    await db.run('UPDATE clientes SET disponible_para_puja = ? WHERE id = ?', [disponible_para_puja ? 1 : 0, id]);
    
    // If removed from biddable pool, clean up pending bids
    if (!disponible_para_puja) {
      await db.run("UPDATE crm_pujas SET estatus = 'Rechazada' WHERE cliente_id = ? AND estatus = 'Pendiente'", [id]);
    }
    
    res.json({ message: 'Client bidding status updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update client bidding status' });
  }
});

// Get bids list
app.get('/api/asignacion/pujas', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT p.*, c.nombre as cliente_nombre, a.nombre as asesor_nombre
      FROM crm_pujas p
      JOIN clientes c ON p.cliente_id = c.id
      JOIN asesores a ON p.asesor_id = a.id
    `;
    const params = [];
    if (req.user.nivel_rol === 'Asesor') {
      query += ` WHERE p.asesor_id = ?`;
      params.push(req.user.id);
    }
    query += ` ORDER BY p.creado_en DESC`;
    
    const bids = await db.all(query, params);
    res.json(bids);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

// Submit a bid (Advisor only)
app.post('/api/asignacion/pujas', authenticateToken, async (req, res) => {
  const { cliente_id, justificacion } = req.body;
  const asesor_id = req.user.id;
  
  if (!cliente_id || !justificacion) {
    return res.status(400).json({ error: 'cliente_id and justificacion are required' });
  }
  
  try {
    const client = await db.get('SELECT * FROM clientes WHERE id = ? AND activo = 1', [cliente_id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.disponible_para_puja) {
      return res.status(400).json({ error: 'Client is not available for bidding' });
    }
    if (client.asesor_id !== null) {
      return res.status(400).json({ error: 'Client already has an advisor assigned' });
    }
    
    const existing = await db.get(
      "SELECT * FROM crm_pujas WHERE cliente_id = ? AND asesor_id = ? AND estatus = 'Pendiente'",
      [cliente_id, asesor_id]
    );
    
    if (existing) {
      await db.run(
        "UPDATE crm_pujas SET justificacion = ?, creado_en = CURRENT_TIMESTAMP WHERE id = ?",
        [justificacion, existing.id]
      );
      return res.json({ message: 'Bid updated successfully', bidId: existing.id });
    }
    
    const result = await db.run(
      "INSERT INTO crm_pujas (cliente_id, asesor_id, justificacion) VALUES (?, ?, ?)",
      [cliente_id, asesor_id, justificacion]
    );
    res.json({ message: 'Bid placed successfully', bidId: result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to place bid' });
  }
});

// Approve or reject a bid (Admin only)
app.post('/api/asignacion/pujas/:id/decision', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  const { decision } = req.body;
  
  if (decision !== 'Aprobada' && decision !== 'Rechazada') {
    return res.status(400).json({ error: "Decision must be 'Aprobada' or 'Rechazada'" });
  }
  
  try {
    const bid = await db.get('SELECT * FROM crm_pujas WHERE id = ?', [id]);
    if (!bid) return res.status(404).json({ error: 'Bid not found' });
    if (bid.estatus !== 'Pendiente') {
      return res.status(400).json({ error: 'Decision has already been made on this bid' });
    }
    
    if (decision === 'Aprobada') {
      const client = await db.get('SELECT * FROM clientes WHERE id = ?', [bid.cliente_id]);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      if (client.asesor_id !== null) {
        return res.status(400).json({ error: 'Client already has an advisor assigned' });
      }
      
      const oldAsesorId = client.asesor_id;
      await db.run('UPDATE clientes SET asesor_id = ?, disponible_para_puja = 0 WHERE id = ?', [bid.asesor_id, bid.cliente_id]);
      await db.run("UPDATE crm_pujas SET estatus = 'Aprobada' WHERE id = ?", [id]);
      
      // Notify approved advisor
      await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
        [bid.asesor_id, `Tu propuesta para el agricultor ${client.nombre} fue Aprobada. Se te ha asignado el cliente.`]);
        
      if (oldAsesorId && Number(oldAsesorId) !== Number(bid.asesor_id)) {
        await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
          [oldAsesorId, `Se te ha retirado del agricultor: ${client.nombre}`]);
      }
      
      // Reject and notify other pending candidates
      const otherBids = await db.all("SELECT id, asesor_id FROM crm_pujas WHERE cliente_id = ? AND id != ? AND estatus = 'Pendiente'", [bid.cliente_id, id]);
      for (const ob of otherBids) {
        await db.run("UPDATE crm_pujas SET estatus = 'Rechazada' WHERE id = ?", [ob.id]);
        await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
          [ob.asesor_id, `Tu propuesta para el agricultor ${client.nombre} fue rechazada (asignado a otro asesor).`]);
      }
      
      res.json({ message: 'Bid approved and client assigned successfully' });
    } else {
      await db.run("UPDATE crm_pujas SET estatus = 'Rechazada' WHERE id = ?", [id]);
      
      const client = await db.get('SELECT nombre FROM clientes WHERE id = ?', [bid.cliente_id]);
      const clientName = client ? client.nombre : 'desconocido';
      
      // Notify rejected advisor
      await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
        [bid.asesor_id, `Tu propuesta para el agricultor ${clientName} fue rechazada.`]);
        
      res.json({ message: 'Bid rejected successfully' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process decision' });
  }
});

// Fetch AI matching metrics
app.get('/api/asignacion/metricas-AI', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  try {
    const advisorsQuery = `
      WITH sales_agg AS (
        SELECT asesor_id, COALESCE(SUM(total_mxn), 0.0) AS total_sales_mxn
        FROM cotizaciones
        WHERE estatus IN ('Vendido', 'Entregado')
        GROUP BY asesor_id
      ),
      visits_agg AS (
        SELECT asesor_id,
               COUNT(id) AS total_visits,
               COUNT(CASE WHEN realizada = 1 THEN 1 END) AS completed_visits,
               COUNT(CASE WHEN realizada = 0 THEN 1 END) AS pending_visits
        FROM planificacion_semanal
        GROUP BY asesor_id
      )
      SELECT 
        a.id AS asesor_id,
        a.nombre,
        COALESCE(s.total_sales_mxn, 0.0) AS total_sales_mxn,
        COALESCE(v.completed_visits, 0) AS completed_visits,
        COALESCE(v.total_visits, 0) AS total_visits,
        COALESCE(v.pending_visits, 0) AS pending_visits
      FROM asesores a
      LEFT JOIN sales_agg s ON s.asesor_id = a.id
      LEFT JOIN visits_agg v ON v.asesor_id = a.id
      WHERE a.activo = 1 AND a.nivel_rol = 'Asesor'
      ORDER BY a.nombre ASC
    `;
    const advisorsMetrics = await db.all(advisorsQuery);
    
    const clientsQuery = `
      SELECT 
        c.id as cliente_id,
        c.nombre,
        COALESCE(SUM(q.total_mxn), 0) as total_purchase_mxn
      FROM clientes c
      LEFT JOIN cotizaciones q ON q.cliente_id = c.id AND q.estatus IN ('Vendido', 'Entregado')
      WHERE c.activo = 1 AND c.asesor_id IS NULL
      GROUP BY c.id, c.nombre
    `;
    const clientsMetrics = await db.all(clientsQuery);
    
    res.json({
      advisors: advisorsMetrics,
      clients: clientsMetrics
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch matching metrics' });
  }
});

// -------------------------------------------------------------
// SALES TARGETS (METAS) ENDPOINTS
// -------------------------------------------------------------

app.get('/api/metas', authenticateToken, async (req, res) => {
  const { ciclo_agricola } = req.query;
  const ciclo = ciclo_agricola || 'O-I 2026';
  try {
    let query = `
      SELECT m.*, a.nombre as asesor_nombre
      FROM metas_ventas m
      LEFT JOIN asesores a ON m.asesor_id = a.id
      WHERE m.activo = 1 AND m.ciclo_agricola = ?
    `;
    const params = [ciclo];
    
    if (req.user.nivel_rol === 'Asesor') {
      query += ` AND m.asesor_id = ?`;
      params.push(req.user.id);
    }
    
    query += ` ORDER BY a.nombre ASC`;
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch metas' });
  }
});

app.post('/api/metas', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { 
    asesor_id, 
    ciclo_agricola, 
    monto_objetivo_mxn, 
    bolsas_objetivo,
    meta_faena,
    meta_clavis,
    meta_cropprotection,
    meta_cosecha
  } = req.body;
  if (!asesor_id || !ciclo_agricola) {
    return res.status(400).json({ error: 'asesor_id and ciclo_agricola are required' });
  }
  
  try {
    // Check if target already exists (upsert)
    const existing = await db.get(
      'SELECT id FROM metas_ventas WHERE asesor_id = ? AND ciclo_agricola = ? AND activo = 1',
      [asesor_id, ciclo_agricola]
    );
    
    if (existing) {
      await db.run(`
        UPDATE metas_ventas
        SET monto_objetivo_mxn = ?, bolsas_objetivo = ?,
            meta_faena = ?, meta_clavis = ?, meta_cropprotection = ?, meta_cosecha = ?
        WHERE id = ?
      `, [
        Number(monto_objetivo_mxn) || 0.0, 
        Number(bolsas_objetivo) || 0,
        Number(meta_faena) || 0.0,
        Number(meta_clavis) || 0.0,
        Number(meta_cropprotection) || 0.0,
        Number(meta_cosecha) || 0.0,
        existing.id
      ]);
      res.json({ message: 'Meta updated successfully' });
    } else {
      await db.run(`
        INSERT INTO metas_ventas (
          asesor_id, ciclo_agricola, monto_objetivo_mxn, bolsas_objetivo,
          meta_faena, meta_clavis, meta_cropprotection, meta_cosecha
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        asesor_id, 
        ciclo_agricola, 
        Number(monto_objetivo_mxn) || 0.0, 
        Number(bolsas_objetivo) || 0,
        Number(meta_faena) || 0.0,
        Number(meta_clavis) || 0.0,
        Number(meta_cropprotection) || 0.0,
        Number(meta_cosecha) || 0.0
      ]);
      res.status(201).json({ message: 'Meta created successfully' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save meta' });
  }
});

// -------------------------------------------------------------
// WEEKLY PLANNING & FORECASTING ENDPOINTS
// -------------------------------------------------------------

function getLocalISODate() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().slice(0, 10);
}

async function getPlanProspectEligibility(plan) {
  const stageRows = await db.all('SELECT clave, fecha_inicio, fecha_fin FROM crm_etapas_programacion ORDER BY fecha_inicio ASC');
  const activeStageCodes = getActiveStageCodesForDate(stageRows, plan.fecha_programada);
  const reports = activeStageCodes.length
    ? await db.all(
      `SELECT etapa_clave FROM crm_reportes_etapa
       WHERE planificacion_id = ? AND etapa_clave IN (${activeStageCodes.map(() => '?').join(', ')})`,
      [plan.id, ...activeStageCodes]
    )
    : [];
  const answeredStageCodes = [...new Set(reports.map(report => String(report.etapa_clave || '').trim().toUpperCase()))];
  return {
    activeStageCodes,
    answeredStageCodes,
    eligible: answeredStageCodes.length > 0
  };
}

app.get('/api/planificacion', authenticateToken, async (req, res) => {
  const { fecha_inicio, fecha_fin, asesor_id } = req.query;
  try {
    const localToday = getLocalISODate();
    // A visit remains available for seven calendar days, including its scheduled date.
    // Restore visits that the previous next-day rule marked as expired too early.
    await db.run(
      "UPDATE planificacion_semanal SET realizada = 0 WHERE realizada = 3 AND fecha_programada + 7 > ?",
      [localToday]
    );
    // It expires on the seventh day after its scheduled date.
    await db.run(
      "UPDATE planificacion_semanal SET realizada = 3 WHERE realizada = 0 AND fecha_programada + 7 <= ?",
      [localToday]
    );

    let query = `
      SELECT p.*, c.nombre as cliente_nombre, a.nombre as asesor_nombre
      FROM planificacion_semanal p
      JOIN clientes c ON p.cliente_id = c.id
      JOIN asesores a ON p.asesor_id = a.id
      WHERE 1=1
    `;
    const params = [];
    
    if (req.user.nivel_rol === 'Asesor') {
      query += ` AND p.asesor_id = ?`;
      params.push(req.user.id);
    } else if (asesor_id && asesor_id !== 'ALL') {
      query += ` AND p.asesor_id = ?`;
      params.push(Number(asesor_id));
    }
    
    if (fecha_inicio && fecha_fin) {
      query += ` AND p.fecha_programada BETWEEN ? AND ?`;
      params.push(fecha_inicio, fecha_fin);
    }
    
    query += ` ORDER BY p.fecha_programada ASC, c.nombre ASC`;
    const rows = await db.all(query, params);

    const stageRows = await db.all('SELECT id, clave, nombre, fecha_inicio, fecha_fin, color FROM crm_etapas_programacion ORDER BY fecha_inicio ASC');
    const enrichedRows = rows.map(plan => {
      const planDate = plan.fecha_programada;
      const activeStageCodes = getActiveStageCodesForDate(stageRows, planDate);
      const activeStageDetails = stageRows
        .filter(stage => activeStageCodes.includes(String(stage.clave || '').trim().toUpperCase()))
        .map(stage => ({
          code: String(stage.clave || '').trim().toUpperCase(),
          nombre: stage.nombre,
          color: stage.color
        }));

      return {
        ...plan,
        activeStageCodes,
        activeStageDetails
      };
    });

    res.json(enrichedRows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch planning' });
  }
});

app.post('/api/planificacion', authenticateToken, async (req, res) => {
  const { cliente_id, fecha_programada, objetivo_visita, pronostico_bolsas, pronostico_monto_mxn, asesor_id } = req.body;
  if (!cliente_id || !fecha_programada) {
    return res.status(400).json({ error: 'cliente_id and fecha_programada are required' });
  }
  try {
    let assignedAdvisorId = req.user.id;
    if (req.user.nivel_rol === 'Administrador' && asesor_id !== undefined) {
      assignedAdvisorId = Number(asesor_id);
    } else if (asesor_id !== undefined && Number(asesor_id) !== req.user.id) {
      return res.status(403).json({ error: 'Solo un administrador puede asignar actividades a otro asesor.' });
    }

    if (!Number.isInteger(assignedAdvisorId) || assignedAdvisorId <= 0) {
      return res.status(400).json({ error: 'Selecciona un asesor responsable.' });
    }

    const assignedAdvisor = await db.get('SELECT id FROM asesores WHERE id = ? AND activo = 1', [assignedAdvisorId]);
    if (!assignedAdvisor) {
      return res.status(400).json({ error: 'El asesor seleccionado no está activo.' });
    }

    const client = await db.get('SELECT id, asesor_id FROM clientes WHERE id = ? AND activo = 1', [cliente_id]);
    if (!client) {
      return res.status(404).json({ error: 'El agricultor seleccionado no existe o está inactivo.' });
    }
    if (req.user.nivel_rol === 'Asesor' && client.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Solo puedes programar actividades para tus propios agricultores.' });
    }

    const result = await db.run(`
      INSERT INTO planificacion_semanal (asesor_id, cliente_id, fecha_programada, objetivo_visita, pronostico_bolsas, pronostico_monto_mxn, realizada)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `, [
      assignedAdvisorId,
      cliente_id,
      fecha_programada,
      objetivo_visita || null,
      Number(pronostico_bolsas) || 0,
      Number(pronostico_monto_mxn) || 0.0
    ]);
    res.status(201).json({ id: result.id, message: 'Plan scheduled successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

app.put('/api/planificacion/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { realizada, comentarios_resultado, fecha_programada, objetivo_visita, pronostico_bolsas, pronostico_monto_mxn, bitacora, cliente_id, asesor_id } = req.body;
  
  try {
    const plan = await db.get('SELECT * FROM planificacion_semanal WHERE id = ?', [id]);
    if (!plan) return res.status(404).json({ error: 'Planning not found' });
    
    if (req.user.nivel_rol === 'Asesor' && plan.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to modify this plan' });
    }
    
    if (plan.realizada === 3) {
      return res.status(400).json({ error: 'No se puede modificar una planificación vencida.' });
    }

    const selectedClientId = cliente_id !== undefined ? Number(cliente_id) : plan.cliente_id;
    const selectedClient = await db.get('SELECT id, asesor_id FROM clientes WHERE id = ? AND activo = 1', [selectedClientId]);
    if (!selectedClient) {
      return res.status(404).json({ error: 'El agricultor seleccionado no existe o está inactivo.' });
    }
    if (req.user.nivel_rol === 'Asesor' && selectedClient.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Solo puedes usar agricultores asignados a tu cuenta.' });
    }

    let assignedAdvisorId = plan.asesor_id;
    if (asesor_id !== undefined && Number(asesor_id) !== plan.asesor_id) {
      if (req.user.nivel_rol !== 'Administrador') {
        return res.status(403).json({ error: 'Solo un administrador puede reasignar actividades.' });
      }
      assignedAdvisorId = Number(asesor_id);
      if (!Number.isInteger(assignedAdvisorId) || assignedAdvisorId <= 0) {
        return res.status(400).json({ error: 'Selecciona un asesor responsable.' });
      }
      const assignedAdvisor = await db.get('SELECT id FROM asesores WHERE id = ? AND activo = 1', [assignedAdvisorId]);
      if (!assignedAdvisor) {
        return res.status(400).json({ error: 'El asesor seleccionado no está activo.' });
      }
    }
    
    let visitId = plan.visita_id;
    // Auto log CRM visit note if visit completed and bitacora note is provided
    if (Number(realizada) === 1 && bitacora && bitacora.trim().length > 0 && !plan.visita_id) {
      const now = new Date().toISOString().slice(0, 10);
      const vResult = await db.run(`
        INSERT INTO crm_visitas (fecha_visita, cliente_id, asesor_id, comentarios_bitacora)
        VALUES (?, ?, ?, ?)
      `, [now, plan.cliente_id, plan.asesor_id, bitacora.trim()]);
      visitId = vResult.id;
    }
    
    await db.run(`
      UPDATE planificacion_semanal
      SET realizada = ?,
          fecha_programada = ?,
          objetivo_visita = ?,
          pronostico_bolsas = ?,
          pronostico_monto_mxn = ?,
          visita_id = ?,
          cliente_id = ?,
          asesor_id = ?
      WHERE id = ?
    `, [
      realizada !== undefined ? Number(realizada) : plan.realizada,
      fecha_programada || plan.fecha_programada,
      objetivo_visita !== undefined ? objetivo_visita : plan.objetivo_visita,
      pronostico_bolsas !== undefined ? Number(pronostico_bolsas) : plan.pronostico_bolsas,
      pronostico_monto_mxn !== undefined ? Number(pronostico_monto_mxn) : plan.pronostico_monto_mxn,
      visitId,
      cliente_id !== undefined ? Number(cliente_id) : plan.cliente_id,
      assignedAdvisorId,
      id
    ]);
    
    res.json({ message: 'Plan updated successfully', visita_id: visitId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

app.post('/api/planificacion/:id/convertir-cotizacion', authenticateToken, async (req, res) => {
  const { id } = req.params;
  return res.status(410).json({ error: 'Las visitas ahora deben convertirse primero en prospectos y cotizarse desde el Cotizador.' });
  /* Legacy automatic quotation flow retained below only for migration reference.
  try {
    const plan = await db.get('SELECT * FROM planificacion_semanal WHERE id = ?', [id]);
    if (!plan) return res.status(404).json({ error: 'Planning not found' });
    
    if (req.user.nivel_rol === 'Asesor' && plan.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to convert this plan' });
    }
    
    const date = new Date();
    const prefix = `CG-${date.getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const mesShort = date.toLocaleString('es-MX', { month: 'short' }).toUpperCase().slice(0, 3);
    const now = date.toISOString().slice(0, 10);
    
    const cicloAgricola = 'O-I 2026';
    const condicionesPago = 'CONTADO';
    const estatus = 'Borrador';
    const totalMxn = plan.pronostico_monto_mxn || 0.0;
    
    const result = await db.run(`
      INSERT INTO cotizaciones (fecha_creacion, cliente_id, asesor_id, ciclo_agricola, condiciones_pago, folio_cotizacion, mes, estatus, total_mxn, anticipo_apartado, notas, financiera)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, 'Creado automáticamente desde planificación semanal', NULL)
    `, [now, plan.cliente_id, plan.asesor_id, cicloAgricola, condicionesPago, prefix, mesShort, estatus, totalMxn]);
    
    const cotId = result.id;
    
    // Automatically insert default product details if forecast has bags
    if (plan.pronostico_bolsas > 0) {
      const defaultProduct = await db.get("SELECT * FROM productos WHERE tipo_categoria = 'Híbrido' AND activo = 1 ORDER BY id ASC LIMIT 1");
      if (defaultProduct) {
        const monthlyPricing = await getMonthlyProductPricing(defaultProduct, new Date().getMonth() + 1);
        const precioLista = monthlyPricing.listPrice;
        const precioNeto = plan.pronostico_monto_mxn
          ? Math.round((plan.pronostico_monto_mxn / plan.pronostico_bolsas) * 100) / 100
          : precioLista;
        const subtotal = plan.pronostico_monto_mxn || (precioNeto * plan.pronostico_bolsas);
        await db.run(`
          INSERT INTO cotizacion_detalles (cotizacion_id, producto_id, temporada_id, cantidad_ordenada, cantidad_entregada, precio_lista_unitario, precio_neto_unitario, subtotal_mxn)
          VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        `, [cotId, defaultProduct.id, 1, plan.pronostico_bolsas, precioLista, precioNeto, subtotal]);
      }
    }
    
    await db.run('UPDATE planificacion_semanal SET realizada = 1 WHERE id = ?', [id]);
    
    res.status(201).json({ id: cotId, folio: prefix, message: 'Plan successfully converted to Prospecto' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to convert plan' });
  }
  */
});

app.get('/api/planificacion/:id/prospecto-elegibilidad', authenticateToken, async (req, res) => {
  try {
    const plan = await db.get('SELECT * FROM planificacion_semanal WHERE id = ?', [Number(req.params.id)]);
    if (!plan) return res.status(404).json({ error: 'Planning not found' });
    if (req.user.nivel_rol === 'Asesor' && plan.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to view this planning activity' });
    }
    const eligibility = await getPlanProspectEligibility(plan);
    const prospect = await db.get('SELECT id, estado FROM crm_prospectos WHERE planificacion_id = ?', [plan.id]);
    res.json({ ...eligibility, prospect });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to validate prospect eligibility' });
  }
});

app.post('/api/planificacion/:id/convertir-prospecto', authenticateToken, async (req, res) => {
  try {
    const plan = await db.get('SELECT * FROM planificacion_semanal WHERE id = ?', [Number(req.params.id)]);
    if (!plan) return res.status(404).json({ error: 'Planning not found' });
    if (req.user.nivel_rol === 'Asesor' && plan.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to convert this planning activity' });
    }

    const existing = await db.get('SELECT id, estado FROM crm_prospectos WHERE planificacion_id = ?', [plan.id]);
    if (existing) return res.json({ id: existing.id, estado: existing.estado, message: 'Prospect already exists' });

    const eligibility = await getPlanProspectEligibility(plan);
    if (!eligibility.eligible) {
      return res.status(400).json({ error: 'Responde al menos una encuesta de las etapas activas antes de pasar la visita a prospecto.' });
    }

    const result = await db.run(`
      INSERT INTO crm_prospectos (planificacion_id, cliente_id, asesor_id, estado)
      VALUES (?, ?, ?, 'Prospecto')
    `, [plan.id, plan.cliente_id, plan.asesor_id]);
    await db.run('UPDATE planificacion_semanal SET realizada = 1 WHERE id = ?', [plan.id]);
    res.status(201).json({ id: result.id, message: 'Plan converted to prospect successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to convert plan to prospect' });
  }
});

app.get('/api/prospectos', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT p.*, c.nombre AS cliente_nombre, a.nombre AS asesor_nombre
      FROM crm_prospectos p
      JOIN clientes c ON c.id = p.cliente_id
      JOIN asesores a ON a.id = p.asesor_id
      WHERE p.estado = 'Prospecto'
    `;
    const params = [];
    if (req.user.nivel_rol === 'Asesor') {
      query += ' AND p.asesor_id = ?';
      params.push(req.user.id);
    }
    query += ' ORDER BY p.creado_en DESC';
    res.json(await db.all(query, params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch prospects' });
  }
});

app.delete('/api/planificacion/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Solo un administrador puede eliminar actividades programadas.' });
  }
  try {
    const plan = await db.get('SELECT * FROM planificacion_semanal WHERE id = ?', [id]);
    if (!plan) return res.status(404).json({ error: 'Planning not found' });
    
    await db.run('DELETE FROM planificacion_semanal WHERE id = ?', [id]);
    res.json({ message: 'Plan deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

app.post('/api/planificacion/bulk-delete', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Solo un administrador puede eliminar actividades programadas.' });
  }

  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : [])
    .map(Number)
    .filter(id => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) {
    return res.status(400).json({ error: 'Selecciona al menos una actividad.' });
  }

  try {
    const placeholders = ids.map(() => '?').join(', ');
    const result = await db.run(`DELETE FROM planificacion_semanal WHERE id IN (${placeholders})`, ids);
    res.json({ message: 'Plans deleted successfully', deleted: result.changes || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete plans' });
  }
});

// -------------------------------------------------------------
// PRODUCTION DATA RESET (ADMIN ONLY)
// -------------------------------------------------------------
app.post('/api/admin/limpiar-operacion', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  if (req.body?.confirmacion !== 'LIMPIAR PRODUCCION') {
    return res.status(400).json({ error: 'La confirmación exacta es requerida.' });
  }

  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');

    const backupResult = await client.query(`
      SELECT jsonb_build_object(
        'cotizaciones', COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id) FROM cotizaciones q), '[]'::jsonb),
        'cotizacion_detalles', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM cotizacion_detalles d), '[]'::jsonb),
        'movimientos_ventas', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM almacen_movimientos m WHERE m.cotizacion_id IS NOT NULL), '[]'::jsonb),
        'planificacion', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM planificacion_semanal p), '[]'::jsonb)
      ) AS datos,
      jsonb_build_object(
        'cotizaciones', (SELECT count(*) FROM cotizaciones),
        'cotizacion_detalles', (SELECT count(*) FROM cotizacion_detalles),
        'movimientos_ventas', (SELECT count(*) FROM almacen_movimientos WHERE cotizacion_id IS NOT NULL),
        'planificacion', (SELECT count(*) FROM planificacion_semanal),
        'bitacora_crm_conservada', (SELECT count(*) FROM crm_visitas)
      ) AS resumen
    `);
    const { datos, resumen } = backupResult.rows[0];

    const backupInsert = await client.query(
      `INSERT INTO crm_respaldos_limpieza_operacion (creado_por_id, alcance, resumen, datos)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [req.user.id, 'ventas_y_planificacion_sin_bitacora_crm', resumen, datos]
    );

    // Sales movements must be removed before their quotation headers due to the foreign key.
    const movementsDeleted = await client.query('DELETE FROM almacen_movimientos WHERE cotizacion_id IS NOT NULL');
    const quotesDeleted = await client.query('DELETE FROM cotizaciones');
    const plansDeleted = await client.query('DELETE FROM planificacion_semanal');

    // Keep manual inventory movements and recalculate their running stock after removing test sales.
    await client.query(`
      WITH recalculated AS (
        SELECT id,
          SUM(COALESCE(cantidad_entrante, 0) - COALESCE(cantidad_saliente, 0))
          OVER (PARTITION BY producto_id ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS existencias
        FROM almacen_movimientos
      )
      UPDATE almacen_movimientos m
      SET existencias_resultantes = recalculated.existencias
      FROM recalculated
      WHERE m.id = recalculated.id
    `);

    await client.query('COMMIT');
    res.json({
      message: 'Ventas y planificación limpiadas. La bitácora CRM fue conservada.',
      respaldo_id: backupInsert.rows[0].id,
      eliminado: {
        cotizaciones: quotesDeleted.rowCount,
        movimientos_ventas: movementsDeleted.rowCount,
        planificacion: plansDeleted.rowCount
      },
      conservado: { bitacora_crm: resumen.bitacora_crm_conservada }
    });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Failed to roll back production cleanup:', rollbackErr);
      }
    }
    console.error('Failed to clean production operation data:', err);
    res.status(500).json({ error: 'No fue posible limpiar los datos. No se aplicaron cambios.' });
  } finally {
    client?.release();
  }
});

app.post('/api/admin/limpiar-almacen', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  if (req.body?.confirmacion !== 'LIMPIAR ALMACEN') {
    return res.status(400).json({ error: 'La confirmación exacta es requerida.' });
  }

  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    const backupResult = await client.query(`
      SELECT jsonb_build_object(
        'movimientos_almacen', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM almacen_movimientos m), '[]'::jsonb)
      ) AS datos,
      jsonb_build_object(
        'movimientos_almacen', (SELECT count(*) FROM almacen_movimientos),
        'productos_existencia_cero', (SELECT count(*) FROM productos WHERE activo = 1)
      ) AS resumen
    `);
    const { datos, resumen } = backupResult.rows[0];
    const backupInsert = await client.query(
      `INSERT INTO crm_respaldos_limpieza_operacion (creado_por_id, alcance, resumen, datos)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [req.user.id, 'movimientos_almacen_y_existencias_fisicas_cero', resumen, datos]
    );

    const deleted = await client.query('DELETE FROM almacen_movimientos');
    await client.query('COMMIT');
    res.json({
      message: 'Movimientos de almacén eliminados. Todas las existencias físicas quedaron en cero.',
      respaldo_id: backupInsert.rows[0].id,
      eliminado: { movimientos_almacen: deleted.rowCount },
      existencias_fisicas: 0
    });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Failed to roll back warehouse cleanup:', rollbackErr);
      }
    }
    console.error('Failed to clean warehouse movements:', err);
    res.status(500).json({ error: 'No fue posible limpiar el almacén. No se aplicaron cambios.' });
  } finally {
    client?.release();
  }
});

app.post('/api/admin/restaurar-planificacion', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Se requieren privilegios de Administrador' });
  }
  try {
    const backupPlanRes = await db.query(`
      SELECT id, creado_en, datos->'planificacion' AS planificacion
      FROM crm_respaldos_limpieza_operacion
      WHERE datos->'planificacion' IS NOT NULL 
        AND jsonb_array_length(datos->'planificacion') > 0
      ORDER BY id DESC LIMIT 1
    `);

    if (!backupPlanRes.rows || !backupPlanRes.rows.length || !Array.isArray(backupPlanRes.rows[0].planificacion)) {
      return res.status(404).json({ error: 'No se encontraron respaldos de planificación semanal para restaurar.' });
    }

    const planItems = backupPlanRes.rows[0].planificacion;
    let restoredCount = 0;

    for (const item of planItems) {
      if (item && item.asesor_id && item.cliente_id) {
        await db.query(`
          INSERT INTO planificacion_semanal (id, asesor_id, cliente_id, fecha_programada, objetivo_visita, pronostico_bolsas, pronostico_monto_mxn, realizada, visita_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            asesor_id = EXCLUDED.asesor_id,
            cliente_id = EXCLUDED.cliente_id,
            fecha_programada = EXCLUDED.fecha_programada,
            objetivo_visita = EXCLUDED.objetivo_visita,
            pronostico_bolsas = EXCLUDED.pronostico_bolsas,
            pronostico_monto_mxn = EXCLUDED.pronostico_monto_mxn,
            realizada = EXCLUDED.realizada
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
        restoredCount++;
      }
    }

    await db.query("SELECT setval('planificacion_semanal_id_seq', (SELECT COALESCE(MAX(id), 1) FROM planificacion_semanal))");

    res.json({
      message: `Restauración exitosa: ${restoredCount} registros de planificación recuperados desde el respaldo #${backupPlanRes.rows[0].id}.`,
      restaurados: restoredCount,
      respaldo_id: backupPlanRes.rows[0].id,
      fecha_respaldo: backupPlanRes.rows[0].creado_en
    });
  } catch (err) {
    console.error('Error restaurando planificación:', err);
    res.status(500).json({ error: 'No fue posible restaurar la planificación.' });
  }
});

// -------------------------------------------------------------
// PROYECCIONES REPORT ENDPOINT
// -------------------------------------------------------------

app.get('/api/dashboard/proyecciones', authenticateToken, async (req, res) => {
  const ciclo = req.query.ciclo_agricola || 'O-I 2026';
  try {
    const params = [ciclo];
    let advisorScope = '';
    if (req.user.nivel_rol === 'Asesor') {
      advisorScope = ' AND a.id = ?';
      params.push(req.user.id);
    }

    const rows = await db.all(`
      SELECT
        a.id AS asesor_id,
        a.nombre AS asesor_nombre,
        COALESCE(m.meta_mxn, 0) AS meta_mxn,
        COALESCE(m.meta_bolsas, 0) AS meta_bolsas,
        COALESCE(s.total_real, 0) AS real_mxn,
        COALESCE(b.bolsas_real, 0) AS real_bolsas,
        COALESCE(f.forecast_mxn, 0) AS forecast_mxn,
        COALESCE(f.forecast_bolsas, 0) AS forecast_bolsas
      FROM asesores a
      LEFT JOIN (
        SELECT asesor_id, SUM(monto_objetivo_mxn) AS meta_mxn, SUM(bolsas_objetivo) AS meta_bolsas
        FROM metas_ventas
        WHERE ciclo_agricola = ? AND activo = 1
        GROUP BY asesor_id
      ) m ON m.asesor_id = a.id
      LEFT JOIN (
        SELECT asesor_id, SUM(total_mxn) AS total_real
        FROM cotizaciones
        WHERE ciclo_agricola = ? AND estatus IN ('Vendido', 'Entregado')
        GROUP BY asesor_id
      ) s ON s.asesor_id = a.id
      LEFT JOIN (
        SELECT q.asesor_id, SUM(d.cantidad_ordenada) AS bolsas_real
        FROM cotizaciones q
        JOIN cotizacion_detalles d ON d.cotizacion_id = q.id
        WHERE q.ciclo_agricola = ? AND q.estatus IN ('Vendido', 'Entregado')
        GROUP BY q.asesor_id
      ) b ON b.asesor_id = a.id
      LEFT JOIN (
        SELECT asesor_id, SUM(pronostico_monto_mxn) AS forecast_mxn, SUM(pronostico_bolsas) AS forecast_bolsas
        FROM planificacion_semanal
        WHERE realizada = 0
        GROUP BY asesor_id
      ) f ON f.asesor_id = a.id
      WHERE a.activo = 1${advisorScope}
      ORDER BY a.nombre ASC
    `, [ciclo, ciclo, ciclo, ...params.slice(1)]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch proyecciones' });
  }
});

// -------------------------------------------------------------
// NOTIFICATIONS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/notificaciones', authenticateToken, async (req, res) => {
  try {
    const query = 'SELECT * FROM crm_notificaciones WHERE asesor_id = ? ORDER BY creado_en DESC LIMIT 20';
    const rows = await db.all(query, [req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// =============================================================
// AI AGENTS MANAGEMENT ENDPOINTS
// =============================================================

// Middleware to authorize Admin or Coordinator
function authorizeAgentAdmin(req, res, next) {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Acceso denegado: Se requiere rol Administrador o Coordinador' });
  }
  next();
}

app.get('/api/agentes/config', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  try {
    const rows = await db.all('SELECT agente_id, nombre, activo, configuracion, ultima_ejecucion FROM crm_agentes_config');
    // Fetch global config if exists to check API key
    const globalRow = await db.get("SELECT configuracion FROM crm_agentes_config WHERE agente_id = 'global'");
    const globalConfig = JSON.parse(globalRow?.configuracion || '{}');
    
    const provider = globalConfig.provider || 'gemini';
    const hasGeminiKey = !!(globalConfig.gemini_api_key || process.env.GEMINI_API_KEY);
    const hasOpenRouterKey = !!(globalConfig.openrouter_api_key || process.env.OPENROUTER_API_KEY);
    const openrouterModel = globalConfig.openrouter_model || 'google/gemini-2.5-flash';
    
    // Mask API keys
    let maskedGeminiKey = '';
    if (globalConfig.gemini_api_key) {
      maskedGeminiKey = globalConfig.gemini_api_key.substring(0, 8) + '...';
    } else if (process.env.GEMINI_API_KEY) {
      maskedGeminiKey = process.env.GEMINI_API_KEY.substring(0, 8) + '...';
    }

    let maskedOpenRouterKey = '';
    if (globalConfig.openrouter_api_key) {
      maskedOpenRouterKey = globalConfig.openrouter_api_key.substring(0, 8) + '...';
    } else if (process.env.OPENROUTER_API_KEY) {
      maskedOpenRouterKey = process.env.OPENROUTER_API_KEY.substring(0, 8) + '...';
    }

    res.json({
      configs: rows.filter(r => r.agente_id !== 'global'),
      provider,
      hasGeminiKey,
      maskedGeminiKey,
      hasOpenRouterKey,
      maskedOpenRouterKey,
      openrouterModel
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener configuraciones' });
  }
});

app.post('/api/agentes/config', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  const { configs, provider, gemini_api_key, openrouter_api_key, openrouter_model } = req.body;
  try {
    // 1. Fetch current global config
    const globalRow = await db.get("SELECT configuracion FROM crm_agentes_config WHERE agente_id = 'global'");
    let globalConfig = JSON.parse(globalRow?.configuracion || '{}');
    
    if (provider) globalConfig.provider = provider;
    
    // Update keys if provided and not masked placeholder
    if (gemini_api_key !== undefined) {
      const val = gemini_api_key.trim();
      if (val && !val.includes('...')) {
        globalConfig.gemini_api_key = val;
        process.env.GEMINI_API_KEY = val;
      }
    }
    
    if (openrouter_api_key !== undefined) {
      const val = openrouter_api_key.trim();
      if (val && !val.includes('...')) {
        globalConfig.openrouter_api_key = val;
        process.env.OPENROUTER_API_KEY = val;
      }
    }
    
    if (openrouter_model !== undefined) {
      globalConfig.openrouter_model = openrouter_model.trim();
    }

    // Save global settings
    if (globalRow) {
      await db.run(
        "UPDATE crm_agentes_config SET configuracion = ? WHERE agente_id = 'global'",
        [JSON.stringify(globalConfig)]
      );
    } else {
      await db.run(
        "INSERT INTO crm_agentes_config (agente_id, nombre, activo, configuracion) VALUES ('global', 'Global Config', 1, ?)",
        [JSON.stringify(globalConfig)]
      );
    }

    // 2. Update agent active status and customized settings
    if (configs && Array.isArray(configs)) {
      for (const c of configs) {
        await db.run(
          'UPDATE crm_agentes_config SET activo = ?, configuracion = ? WHERE agente_id = ?',
          [c.activo ? 1 : 0, typeof c.configuracion === 'object' ? JSON.stringify(c.configuracion) : c.configuracion, c.agente_id]
        );
      }
    }

    res.json({ success: true, message: 'Configuraciones actualizadas' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar configuraciones' });
  }
});

app.post('/api/agentes/ejecutar', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  const { agente_id, ciclo_id } = req.body;
  try {
    const globalRow = await db.get("SELECT configuracion FROM crm_agentes_config WHERE agente_id = 'global'");
    const globalConfig = JSON.parse(globalRow?.configuracion || '{}');
    const provider = globalConfig.provider || 'gemini';
    let apiKey = '';

    if (provider === 'openrouter') {
      apiKey = globalConfig.openrouter_api_key || process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'OPENROUTER_API_KEY no configurada. Configure su API Key antes de ejecutar los agentes.' });
      }
    } else {
      apiKey = globalConfig.gemini_api_key || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'GEMINI_API_KEY no configurada. Configure su API Key antes de ejecutar los agentes.' });
      }
    }

    const result = await agentsService.executeAgent(agente_id, apiKey, ciclo_id);
    res.json({ success: true, result });
  } catch (err) {
    console.error(`Error executing agent manually: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/agentes/logs', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  try {
    const logs = await db.all('SELECT * FROM crm_agentes_logs ORDER BY creado_en DESC LIMIT 50');
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar logs' });
  }
});

app.get('/api/agentes/ceo/propuesta', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  try {
    const proposal = await db.get('SELECT * FROM crm_ceo_propuestas WHERE estatus = \'Pendiente\' ORDER BY creado_en DESC LIMIT 1');
    res.json(proposal || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar propuesta de metas' });
  }
});

app.post('/api/agentes/ceo/aplicar', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  const { propuesta_id } = req.body;
  try {
    const proposal = await db.get('SELECT * FROM crm_ceo_propuestas WHERE id = ?', [propuesta_id]);
    if (!proposal) {
      return res.status(404).json({ error: 'Propuesta no encontrada' });
    }

    const goals = JSON.parse(proposal.propuesta_json);
    const today = new Date();
    let ciclo = `PV ${today.getFullYear()}`;
    if (proposal.ciclo_id) {
      const dbCiclo = await db.get('SELECT nombre FROM ciclos WHERE id = ?', [proposal.ciclo_id]);
      if (dbCiclo) {
        ciclo = dbCiclo.nombre;
      }
    }

    for (const g of goals) {
      // Check if advisor has meta for this cycle
      const existing = await db.get('SELECT id FROM metas_ventas WHERE asesor_id = ? AND ciclo_agricola = ?', [g.asesor_id, ciclo]);
      
      if (existing) {
        await db.run(
          `UPDATE metas_ventas SET 
            monto_objetivo_mxn = ?, 
            bolsas_objetivo = ?, 
            meta_faena = ?, 
            meta_clavis = ?, 
            meta_cropprotection = ?, 
            meta_cosecha = ?,
            activo = 1
           WHERE id = ?`,
          [g.monto_objetivo_mxn, g.bolsas_objetivo, g.meta_faena, g.meta_clavis, g.meta_cropprotection, g.meta_cosecha, existing.id]
        );
      } else {
        await db.run(
          `INSERT INTO metas_ventas (
            asesor_id, ciclo_agricola, monto_objetivo_mxn, bolsas_objetivo,
            meta_faena, meta_clavis, meta_cropprotection, meta_cosecha, activo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [g.asesor_id, ciclo, g.monto_objetivo_mxn, g.bolsas_objetivo, g.meta_faena, g.meta_clavis, g.meta_cropprotection, g.meta_cosecha]
        );
      }
    }

    await db.run('UPDATE crm_ceo_propuestas SET estatus = \'Aplicada\' WHERE id = ?', [propuesta_id]);
    
    // Log success
    await db.run(
      'INSERT INTO crm_agentes_logs (agente_id, tipo_evento, mensaje) VALUES (?, ?, ?)',
      ['ceo', 'info', `Propuesta de metas (ID ${propuesta_id}) aprobada y aplicada con éxito para el ciclo ${ciclo}`]
    );

    res.json({ success: true, message: 'Metas propuestas aplicadas con éxito.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al aplicar las metas de ventas' });
  }
});

app.get('/api/agentes/coordinador/seguimientos', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  try {
    // Read last coordinator run logs that succeeded
    const log = await db.get("SELECT detalle, creado_en FROM crm_agentes_logs WHERE agente_id = 'coordinador' AND tipo_evento = 'success' ORDER BY creado_en DESC LIMIT 1");
    if (!log) {
      return res.json([]);
    }
    const followUps = JSON.parse(log.detalle || '[]');
    res.json({
      creado_en: log.creado_en,
      followUps
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los seguimientos' });
  }
});

// -------------------------------------------------------------
// PROGRAMACIÓN (ETAPAS & PRECIOS MENSUALES) ENDPOINTS
// -------------------------------------------------------------

app.get('/api/programacion/etapas', authenticateToken, requireProgramacionManager, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM crm_etapas_programacion ORDER BY fecha_inicio ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stages' });
  }
});

app.get('/api/programacion/etapas/activas', authenticateToken, async (req, res) => {
  const { fecha } = req.query;
  if (!fecha) {
    return res.status(400).json({ error: 'fecha is required' });
  }
  try {
    const rows = await db.all('SELECT * FROM crm_etapas_programacion ORDER BY fecha_inicio ASC');
    const active = rows.filter(stage => isStageActiveOnDate(stage, fecha));
    res.json(active);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch active stages' });
  }
});

app.post('/api/programacion/etapas', authenticateToken, requireProgramacionManager, async (req, res) => {
  const { id, clave, nombre, fecha_inicio, fecha_fin, color } = req.body;
  if (!clave || !nombre || !fecha_inicio || !fecha_fin || !color) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    if (id) {
      await db.run(
        'UPDATE crm_etapas_programacion SET clave = ?, nombre = ?, fecha_inicio = ?, fecha_fin = ?, color = ? WHERE id = ?',
        [clave.trim(), nombre.trim(), fecha_inicio, fecha_fin, color, id]
      );
      res.json({ success: true, message: 'Stage updated successfully' });
    } else {
      const existing = await db.get('SELECT id FROM crm_etapas_programacion WHERE clave = ?', [clave.trim()]);
      if (existing) {
        return res.status(400).json({ error: 'A stage with this key already exists' });
      }
      await db.run(
        'INSERT INTO crm_etapas_programacion (clave, nombre, fecha_inicio, fecha_fin, color) VALUES (?, ?, ?, ?, ?)',
        [clave.trim(), nombre.trim(), fecha_inicio, fecha_fin, color]
      );
      res.status(201).json({ success: true, message: 'Stage created successfully' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save stage' });
  }
});

app.delete('/api/programacion/etapas/:id', authenticateToken, requireProgramacionManager, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM crm_etapas_programacion WHERE id = ?', [id]);
    res.json({ success: true, message: 'Stage deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete stage' });
  }
});

app.get('/api/programacion/etapas/:id/analisis', authenticateToken, requireProgramacionManager, async (req, res) => {
  const { id } = req.params;
  try {
    const etapa = await db.get('SELECT * FROM crm_etapas_programacion WHERE id = ?', [id]);
    if (!etapa) return res.status(404).json({ error: 'Stage not found' });

    const reportes = await db.all(`
      SELECT r.id, r.etapa_clave, r.fecha_reporte, r.respuestas, r.creado_en, r.actualizado_en,
             c.nombre AS cliente_nombre, a.nombre AS asesor_nombre
      FROM crm_reportes_etapa r
      LEFT JOIN clientes c ON c.id = r.cliente_id
      LEFT JOIN asesores a ON a.id = r.asesor_id
      WHERE r.etapa_clave = ?
        AND r.fecha_reporte BETWEEN ? AND ?
      ORDER BY r.fecha_reporte DESC, r.actualizado_en DESC
    `, [etapa.clave, etapa.fecha_inicio, etapa.fecha_fin]);

    const planificacion = await db.get(`
      SELECT COUNT(*) AS total
      FROM planificacion_semanal
      WHERE fecha_programada BETWEEN ? AND ?
        AND realizada <> 2
    `, [etapa.fecha_inicio, etapa.fecha_fin]);

    const respuestas = reportes.map(reporte => {
      if (typeof reporte.respuestas === 'string') {
        try {
          return JSON.parse(reporte.respuestas || '{}');
        } catch {
          return {};
        }
      }
      return reporte.respuestas || {};
    });
    const agricultores = new Set(reportes.map(reporte => reporte.cliente_nombre).filter(Boolean));
    const asesores = new Set(reportes.map(reporte => reporte.asesor_nombre).filter(Boolean));
    const anomalias = respuestas.filter(respuesta => respuesta.anomalia === 'Sí').length;

    res.json({
      etapa,
      resumen: {
        visitas_programadas: Number(planificacion?.total || 0),
        reportes_recibidos: reportes.length,
        agricultores_reportaron: agricultores.size,
        asesores_reportaron: asesores.size,
        anomalias_reportadas: anomalias
      },
      reportes: reportes.map((reporte, index) => ({ ...reporte, respuestas: respuestas[index] }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build stage analysis' });
  }
});

app.get('/api/reportes-etapa', authenticateToken, async (req, res) => {
  const { planificacion_id, etapa_clave, cliente_id, asesor_id } = req.query;
  try {
    let query = `
      SELECT r.*, p.fecha_programada, c.nombre AS cliente_nombre, a.nombre AS asesor_nombre
      FROM crm_reportes_etapa r
      LEFT JOIN planificacion_semanal p ON p.id = r.planificacion_id
      LEFT JOIN clientes c ON c.id = r.cliente_id
      LEFT JOIN asesores a ON a.id = r.asesor_id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.nivel_rol === 'Asesor') {
      query += ' AND r.asesor_id = ?';
      params.push(req.user.id);
    }

    if (planificacion_id) {
      query += ' AND r.planificacion_id = ?';
      params.push(Number(planificacion_id));
    }
    if (etapa_clave) {
      query += ' AND r.etapa_clave = ?';
      params.push(etapa_clave.toUpperCase());
    }
    if (cliente_id) {
      query += ' AND r.cliente_id = ?';
      params.push(Number(cliente_id));
    }
    if (asesor_id) {
      query += ' AND r.asesor_id = ?';
      params.push(Number(asesor_id));
    }

    query += ' ORDER BY r.fecha_reporte DESC, r.actualizado_en DESC';
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stage reports' });
  }
});

app.post('/api/reportes-etapa', authenticateToken, async (req, res) => {
  const payload = req.body || {};
  const {
    planificacion_id,
    visita_id,
    cliente_id,
    asesor_id,
    etapa_clave,
    fecha_reporte,
    respuestas,
    tiene_cartera_pendiente,
    monto_cartera_pendiente,
    tiene_beneficio_contrato,
    fuente_integracion,
    actualizado_integracion_en
  } = payload;

  const normalizedStage = String(etapa_clave || '').trim().toUpperCase();
  const normalizedDate = String(fecha_reporte || '').trim();

  if (!cliente_id || !asesor_id || !normalizedStage || !normalizedDate) {
    return res.status(400).json({ error: 'cliente_id, asesor_id, etapa_clave and fecha_reporte are required' });
  }

  try {
    const plan = await db.get('SELECT * FROM planificacion_semanal WHERE id = ?', [Number(planificacion_id)]);
    if (!plan) {
      return res.status(404).json({ error: 'Planning not found' });
    }

    if (Number(cliente_id) !== plan.cliente_id || Number(asesor_id) !== plan.asesor_id) {
      return res.status(400).json({ error: 'The report does not belong to the selected planning visit' });
    }

    if (req.user.nivel_rol === 'Asesor' && plan.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to create a report for this visit' });
    }

    if (normalizedDate !== String(plan.fecha_programada || '').trim()) {
      return res.status(400).json({ error: 'The report date must match the scheduled visit date' });
    }

    const stageRows = await db.all('SELECT id, clave, nombre, fecha_inicio, fecha_fin, color FROM crm_etapas_programacion ORDER BY fecha_inicio ASC');
    const activeStageCodes = getActiveStageCodesForDate(stageRows, plan.fecha_programada);
    if (!activeStageCodes.includes(normalizedStage)) {
      return res.status(400).json({ error: 'The selected stage is not active on the report date' });
    }

    const validation = validateStageReportPayload({ etapa_clave: normalizedStage, respuestas: respuestas || {} });
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const existing = await db.get('SELECT * FROM crm_reportes_etapa WHERE planificacion_id = ? AND etapa_clave = ?', [planificacion_id || null, normalizedStage]);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const reportData = {
      planificacion_id: planificacion_id || null,
      visita_id: visita_id || null,
      cliente_id: Number(cliente_id),
      asesor_id: Number(asesor_id),
      etapa_clave: normalizedStage,
      fecha_reporte: normalizedDate,
      respuestas: JSON.stringify(respuestas || {}),
      actualizado_en: now,
      tiene_cartera_pendiente: Number(tiene_cartera_pendiente) || 0,
      monto_cartera_pendiente: Number(monto_cartera_pendiente) || 0.0,
      tiene_beneficio_contrato: Number(tiene_beneficio_contrato) || 0,
      fuente_integracion: fuente_integracion || null,
      actualizado_integracion_en: actualizado_integracion_en || null
    };

    if (existing) {
      if (req.user.nivel_rol === 'Asesor' && existing.asesor_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized to modify this report' });
      }
      await db.run(`
        UPDATE crm_reportes_etapa
        SET planificacion_id = ?, visita_id = ?, cliente_id = ?, asesor_id = ?, etapa_clave = ?, fecha_reporte = ?, respuestas = ?, actualizado_en = ?,
            tiene_cartera_pendiente = ?, monto_cartera_pendiente = ?, tiene_beneficio_contrato = ?, fuente_integracion = ?, actualizado_integracion_en = ?
        WHERE id = ?
      `, [
        reportData.planificacion_id,
        reportData.visita_id,
        reportData.cliente_id,
        reportData.asesor_id,
        reportData.etapa_clave,
        reportData.fecha_reporte,
        reportData.respuestas,
        reportData.actualizado_en,
        reportData.tiene_cartera_pendiente,
        reportData.monto_cartera_pendiente,
        reportData.tiene_beneficio_contrato,
        reportData.fuente_integracion,
        reportData.actualizado_integracion_en,
        existing.id
      ]);
      return res.json({ id: existing.id, message: 'Report updated successfully' });
    }

    const result = await db.run(`
      INSERT INTO crm_reportes_etapa (
        planificacion_id, visita_id, cliente_id, asesor_id, etapa_clave, fecha_reporte, respuestas,
        creado_en, actualizado_en, tiene_cartera_pendiente, monto_cartera_pendiente,
        tiene_beneficio_contrato, fuente_integracion, actualizado_integracion_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      reportData.planificacion_id,
      reportData.visita_id,
      reportData.cliente_id,
      reportData.asesor_id,
      reportData.etapa_clave,
      reportData.fecha_reporte,
      reportData.respuestas,
      reportData.actualizado_en,
      reportData.actualizado_en,
      reportData.tiene_cartera_pendiente,
      reportData.monto_cartera_pendiente,
      reportData.tiene_beneficio_contrato,
      reportData.fuente_integracion,
      reportData.actualizado_integracion_en
    ]);
    res.status(201).json({ id: result.id, message: 'Report created successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save stage report' });
  }
});

app.get('/api/reportes-etapa/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const row = await db.get(`
      SELECT r.*, p.fecha_programada, c.nombre AS cliente_nombre, a.nombre AS asesor_nombre
      FROM crm_reportes_etapa r
      LEFT JOIN planificacion_semanal p ON p.id = r.planificacion_id
      LEFT JOIN clientes c ON c.id = r.cliente_id
      LEFT JOIN asesores a ON a.id = r.asesor_id
      WHERE r.id = ?
    `, [id]);
    if (!row) return res.status(404).json({ error: 'Report not found' });
    if (req.user.nivel_rol === 'Asesor' && row.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to view this report' });
    }
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stage report' });
  }
});

app.get('/api/programacion/precios', authenticateToken, requireProgramacionManager, async (req, res) => {
  const { producto_id } = req.query;
  if (!producto_id) {
    return res.status(400).json({ error: 'producto_id is required' });
  }
  try {
    const prod = await db.get('SELECT list_price_mxn FROM productos WHERE id = ?', [producto_id]);
    if (!prod) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const listPrice = prod.list_price_mxn;

    const rows = await db.all(
      'SELECT * FROM crm_precios_mensuales WHERE producto_id = ? ORDER BY mes ASC',
      [producto_id]
    );

    const prices = [];
    for (let m = 1; m <= 12; m++) {
      const existing = rows.find(r => r.mes === m);
      if (existing) {
        prices.push(existing);
      } else {
        prices.push({
          producto_id: parseInt(producto_id),
          mes: m,
          precio: listPrice,
          promo_dinero: 0.0,
          promo_porcentaje: 0.0
        });
      }
    }
    res.json(prices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch monthly pricing' });
  }
});

app.post('/api/programacion/precios', authenticateToken, requireProgramacionManager, async (req, res) => {
  const { producto_id, precios, mes_inicio_propagacion } = req.body;
  if (!producto_id || !Array.isArray(precios) || precios.length !== 12) {
    return res.status(400).json({ error: 'producto_id and an array of 12 months of prices are required' });
  }
  const rowsByMonth = new Map();
  for (const row of precios) {
    const mes = Number(row.mes);
    const precio = Number(row.precio);
    const promoDinero = Number(row.promo_dinero || 0);
    const promoPorcentaje = Number(row.promo_porcentaje || 0);
    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || rowsByMonth.has(mes)) {
      return res.status(400).json({ error: 'Each month from 1 to 12 must appear exactly once' });
    }
    if (![precio, promoDinero, promoPorcentaje].every(Number.isFinite) || precio < 0 || promoDinero < 0 || promoPorcentaje < 0) {
      return res.status(400).json({ error: 'Prices and promotions must be non-negative numbers' });
    }
    if (promoDinero > precio || promoPorcentaje > 100) {
      return res.status(400).json({ error: 'Promotions cannot exceed the monthly price or 100 percent' });
    }
    if (promoDinero > 0 && promoPorcentaje > 0) {
      return res.status(400).json({ error: 'Use either a money promotion or a percentage promotion for each month, not both' });
    }
    rowsByMonth.set(mes, { mes, precio, promo_dinero: promoDinero, promo_porcentaje: promoPorcentaje });
  }
  if (rowsByMonth.size !== 12) {
    return res.status(400).json({ error: 'Each month from 1 to 12 must appear exactly once' });
  }
  const propagationMonth = mes_inicio_propagacion === undefined || mes_inicio_propagacion === null ? null : Number(mes_inicio_propagacion);
  if (propagationMonth !== null && (!Number.isInteger(propagationMonth) || propagationMonth < 1 || propagationMonth > 12)) {
    return res.status(400).json({ error: 'mes_inicio_propagacion must be between 1 and 12' });
  }
  if (propagationMonth !== null) {
    const propagatedPrice = rowsByMonth.get(propagationMonth).precio;
    for (let mes = propagationMonth; mes <= 12; mes += 1) rowsByMonth.get(mes).precio = propagatedPrice;
  }
  let pricingClient;
  try {
    const product = await db.get('SELECT id FROM productos WHERE id = ?', [producto_id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    pricingClient = await db.pool.connect();
    await pricingClient.query('BEGIN');
    for (let mes = 1; mes <= 12; mes += 1) {
      const row = rowsByMonth.get(mes);
      const { precio, promo_dinero, promo_porcentaje } = row;
      await pricingClient.query(
        `INSERT INTO crm_precios_mensuales (producto_id, mes, precio, promo_dinero, promo_porcentaje)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (producto_id, mes)
         DO UPDATE SET precio = EXCLUDED.precio, promo_dinero = EXCLUDED.promo_dinero, promo_porcentaje = EXCLUDED.promo_porcentaje`,
        [producto_id, mes, precio, promo_dinero, promo_porcentaje]
      );
    }
    await pricingClient.query('COMMIT');
    res.json({ success: true, message: 'Monthly pricing saved successfully' });
  } catch (err) {
    await pricingClient?.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to save monthly pricing' });
  } finally {
    pricingClient?.release();
  }
});

// -------------------------------------------------------------
// MODULO DE COMISIONES - HELPERS Y ENDPOINTS
// -------------------------------------------------------------

function resolverComisionPython(subtotal_mxn, cantidad_ordenada, reglaBase, reglaTemp) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      item_subtotal: subtotal_mxn,
      cantidad_ordenada: cantidad_ordenada,
      regla_base: reglaBase || null,
      regla_temporada: reglaTemp || null
    });
    execFile('python', [path.join(__dirname, 'comisiones.py'), '--calc-item', payload], (err, stdout) => {
      if (err || !stdout) {
        let comisionBase = 0;
        let comisionTemporada = 0;
        if (reglaBase) {
          comisionBase = (reglaBase.tipo_valor === 'porcentaje')
            ? subtotal_mxn * (reglaBase.valor / 100)
            : cantidad_ordenada * reglaBase.valor;
        }
        if (reglaTemp) {
          let valorTemp = (reglaTemp.tipo_valor === 'porcentaje')
            ? subtotal_mxn * (reglaTemp.valor / 100)
            : cantidad_ordenada * reglaTemp.valor;
          if (reglaTemp.comportamiento === 'sobrescribir') {
            comisionBase = 0;
            comisionTemporada = valorTemp;
          } else {
            comisionTemporada = valorTemp;
          }
        }
        return resolve({
          monto_base_aplicado: Math.round(comisionBase * 100) / 100,
          monto_temporada_aplicado: Math.round(comisionTemporada * 100) / 100,
          total_comision_mxn: Math.round((comisionBase + comisionTemporada) * 100) / 100
        });
      }
      try {
        const res = JSON.parse(stdout.trim());
        resolve(res);
      } catch (e) {
        resolve({ monto_base_aplicado: 0, monto_temporada_aplicado: 0, total_comision_mxn: 0 });
      }
    });
  });
}

function evaluarBonoPython(ventas_acumuladas, meta_ventas, reglas_bonos) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      ventas_acumuladas: ventas_acumuladas,
      meta_ventas: meta_ventas,
      reglas_bonos: reglas_bonos
    });
    execFile('python', [path.join(__dirname, 'comisiones.py'), '--eval-bonus', payload], (err, stdout) => {
      if (err || !stdout) {
        let pct = meta_ventas > 0 ? (ventas_acumuladas / meta_ventas) * 100 : 0;
        let maxBono = 0;
        for (const r of reglas_bonos) {
          if (r.activo !== 0 && pct >= (r.porcentaje_meta_requerido || 0)) {
            if (r.bono_mxn > maxBono) maxBono = r.bono_mxn;
          }
        }
        return resolve({
          porcentaje_meta_alcanzado: Math.round(pct * 100) / 100,
          bono_proyectado_mxn: Math.round(maxBono * 100) / 100
        });
      }
      try {
        const res = JSON.parse(stdout.trim());
        resolve(res);
      } catch (e) {
        resolve({ porcentaje_meta_alcanzado: 0, bono_proyectado_mxn: 0 });
      }
    });
  });
}

async function calcularComisionCotizacion(cotizacion_id) {
  const cotizacion = await db.get('SELECT * FROM cotizaciones WHERE id = ?', [cotizacion_id]);
  if (!cotizacion) return;

  const detalles = await db.all(`
    SELECT cd.*, p.tipo_categoria 
    FROM cotizacion_detalles cd 
    LEFT JOIN productos p ON cd.producto_id = p.id 
    WHERE cd.cotizacion_id = ?
  `, [cotizacion_id]);

  for (let item of detalles) {
    const exist = await db.get(`
      SELECT * FROM comisiones_generadas 
      WHERE cotizacion_id = ? AND cotizacion_detalle_id = ? AND estatus != 'Cancelada'
    `, [cotizacion_id, item.id]);

    if (exist) continue;

    let reglaBase = await db.get(`
      SELECT * FROM comision_reglas_base 
      WHERE producto_id = ? AND condicion_pago IN (?, 'Todos') AND activo = 1 
      ORDER BY (CASE WHEN condicion_pago = 'Todos' THEN 1 ELSE 2 END) DESC, id DESC LIMIT 1
    `, [item.producto_id, cotizacion.condiciones_pago || 'Contado']);

    if (!reglaBase && item.tipo_categoria) {
      reglaBase = await db.get(`
        SELECT * FROM comision_reglas_base 
        WHERE tipo_categoria = ? AND condicion_pago IN (?, 'Todos') AND activo = 1 
        ORDER BY (CASE WHEN condicion_pago = 'Todos' THEN 1 ELSE 2 END) DESC, id DESC LIMIT 1
      `, [item.tipo_categoria, cotizacion.condiciones_pago || 'Contado']);
    }

    let reglaTemp = null;
    if (item.temporada_id) {
      reglaTemp = await db.get(`
        SELECT * FROM comision_reglas_temporada 
        WHERE temporada_id = ? AND (producto_id = ? OR producto_id IS NULL) AND activo = 1 
        ORDER BY (CASE WHEN producto_id IS NOT NULL THEN 2 ELSE 1 END) DESC LIMIT 1
      `, [item.temporada_id, item.producto_id]);
    }

    const subtotal = item.subtotal_mxn || (item.precio_neto_mxn * item.cantidad_ordenada);
    const calc = await resolverComisionPython(
      subtotal,
      item.cantidad_ordenada,
      reglaBase,
      reglaTemp
    );

    await db.run(`
      INSERT INTO comisiones_generadas 
      (cotizacion_id, cotizacion_detalle_id, asesor_id, monto_base_aplicado, monto_temporada_aplicado, total_comision_mxn, estatus, notas) 
      VALUES (?, ?, ?, ?, ?, ?, 'Pendiente', ?)
    `, [
      cotizacion_id,
      item.id,
      cotizacion.asesor_id,
      calc.monto_base_aplicado,
      calc.monto_temporada_aplicado,
      calc.total_comision_mxn,
      `Comisión generada por venta ${cotizacion.folio_cotizacion || ('#' + cotizacion_id)}`
    ]);
  }
}

async function cancelarComisionCotizacion(cotizacion_id) {
  const cotizacion = await db.get('SELECT * FROM cotizaciones WHERE id = ?', [cotizacion_id]);
  if (!cotizacion) return;

  const comisiones = await db.all("SELECT * FROM comisiones_generadas WHERE cotizacion_id = ? AND estatus != 'Cancelada'", [cotizacion_id]);
  for (const c of comisiones) {
    if (c.estatus === 'Pendiente') {
      await db.run("UPDATE comisiones_generadas SET estatus = 'Cancelada' WHERE id = ?", [c.id]);
    } else if (c.estatus === 'Pagada') {
      await db.run("UPDATE comisiones_generadas SET estatus = 'Cancelada' WHERE id = ?", [c.id]);
      await db.run(`
        INSERT INTO comisiones_generadas 
        (cotizacion_id, cotizacion_detalle_id, asesor_id, monto_base_aplicado, monto_temporada_aplicado, total_comision_mxn, estatus, notas) 
        VALUES (?, ?, ?, ?, ?, ?, 'Pendiente', ?)
      `, [
        cotizacion_id,
        c.cotizacion_detalle_id,
        c.asesor_id,
        -Math.abs(c.monto_base_aplicado),
        -Math.abs(c.monto_temporada_aplicado),
        -Math.abs(c.total_comision_mxn),
        `Cargo a cuenta (Clawback) por cancelación de cotización pagada ${cotizacion.folio_cotizacion || ('#' + cotizacion_id)}`
      ]);
    }
  }
}
app.get('/api/comisiones/reglas', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  try {
    const base = await db.all(`
      SELECT r.*, p.producto AS producto_nombre 
      FROM comision_reglas_base r 
      LEFT JOIN productos p ON r.producto_id = p.id 
      ORDER BY r.id DESC
    `);
    const temporada = await db.all(`
      SELECT t.*, temp.actividad AS temporada_nombre, p.producto AS producto_nombre 
      FROM comision_reglas_temporada t 
      JOIN temporadas temp ON t.temporada_id = temp.id 
      LEFT JOIN productos p ON t.producto_id = p.id 
      ORDER BY t.id DESC
    `);
    const bonos = await db.all('SELECT * FROM comision_bonos_metas ORDER BY porcentaje_meta_requerido ASC');
    res.json({ base, temporada, bonos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// 2. POST /api/comisiones/reglas/base (Administrador o Coordinador)
app.post('/api/comisiones/reglas/base', authenticateToken, requireAdminOrCoordinador, async (req, res) => {
  const { producto_id, tipo_categoria, condicion_pago, tipo_valor, valor } = req.body;
  if ((!producto_id && !tipo_categoria) || !tipo_valor || valor === undefined) {
    return res.status(400).json({ error: 'Producto o Categoría, tipo_valor y valor son requeridos' });
  }
  try {
    const result = await db.run(`
      INSERT INTO comision_reglas_base (producto_id, tipo_categoria, condicion_pago, tipo_valor, valor, activo)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [producto_id || null, tipo_categoria || null, condicion_pago || 'Todos', tipo_valor, parseFloat(valor)]);
    res.json({ success: true, id: result.id, message: 'Regla base creada exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create base rule' });
  }
});

// 3. PUT /api/comisiones/reglas/base/:id (Administrador o Coordinador)
app.put('/api/comisiones/reglas/base/:id', authenticateToken, requireAdminOrCoordinador, async (req, res) => {
  const { id } = req.params;
  const { producto_id, tipo_categoria, condicion_pago, tipo_valor, valor, activo } = req.body;
  try {
    const rule = await db.get('SELECT * FROM comision_reglas_base WHERE id = ?', [id]);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    const newProductoId = producto_id !== undefined ? (producto_id || null) : rule.producto_id;
    const newTipoCategoria = tipo_categoria !== undefined ? (tipo_categoria || null) : rule.tipo_categoria;
    const newCondicion = condicion_pago !== undefined ? condicion_pago : rule.condicion_pago;
    const newTipoValor = tipo_valor !== undefined ? tipo_valor : rule.tipo_valor;
    const newValor = valor !== undefined ? parseFloat(valor) : rule.valor;
    const newActivo = activo !== undefined ? (activo ? 1 : 0) : rule.activo;

    await db.run(`
      UPDATE comision_reglas_base 
      SET producto_id = ?, tipo_categoria = ?, condicion_pago = ?, tipo_valor = ?, valor = ?, activo = ? 
      WHERE id = ?
    `, [newProductoId, newTipoCategoria, newCondicion, newTipoValor, newValor, newActivo, id]);
    res.json({ success: true, message: 'Regla base actualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update base rule' });
  }
});

// DELETE /api/comisiones/reglas/base/:id (Administrador o Coordinador)
app.delete('/api/comisiones/reglas/base/:id', authenticateToken, requireAdminOrCoordinador, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM comision_reglas_base WHERE id = ?', [id]);
    res.json({ success: true, message: 'Regla base eliminada exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete base rule' });
  }
});

// 4. POST /api/comisiones/reglas/temporada (Administrador o Coordinador)
app.post('/api/comisiones/reglas/temporada', authenticateToken, requireAdminOrCoordinador, async (req, res) => {
  const { temporada_id, producto_id, tipo_valor, valor, comportamiento } = req.body;
  if (!temporada_id || !tipo_valor || valor === undefined || !comportamiento) {
    return res.status(400).json({ error: 'temporada_id, tipo_valor, valor y comportamiento son requeridos' });
  }
  try {
    const result = await db.run(`
      INSERT INTO comision_reglas_temporada (temporada_id, producto_id, tipo_valor, valor, comportamiento, activo)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [temporada_id, producto_id || null, tipo_valor, parseFloat(valor), comportamiento]);
    res.json({ success: true, id: result.id, message: 'Regla de temporada creada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create season rule' });
  }
});

// PUT /api/comisiones/reglas/temporada/:id (Administrador o Coordinador)
app.put('/api/comisiones/reglas/temporada/:id', authenticateToken, requireAdminOrCoordinador, async (req, res) => {
  const { id } = req.params;
  const { temporada_id, producto_id, tipo_valor, valor, comportamiento, activo } = req.body;
  try {
    const rule = await db.get('SELECT * FROM comision_reglas_temporada WHERE id = ?', [id]);
    if (!rule) return res.status(404).json({ error: 'Season rule not found' });

    const newTempId = temporada_id !== undefined ? temporada_id : rule.temporada_id;
    const newProductoId = producto_id !== undefined ? (producto_id || null) : rule.producto_id;
    const newTipoValor = tipo_valor !== undefined ? tipo_valor : rule.tipo_valor;
    const newValor = valor !== undefined ? parseFloat(valor) : rule.valor;
    const newComp = comportamiento !== undefined ? comportamiento : rule.comportamiento;
    const newActivo = activo !== undefined ? (activo ? 1 : 0) : rule.activo;

    await db.run(`
      UPDATE comision_reglas_temporada 
      SET temporada_id = ?, producto_id = ?, tipo_valor = ?, valor = ?, comportamiento = ?, activo = ? 
      WHERE id = ?
    `, [newTempId, newProductoId, newTipoValor, newValor, newComp, newActivo, id]);
    res.json({ success: true, message: 'Regla de temporada actualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update season rule' });
  }
});

// DELETE /api/comisiones/reglas/temporada/:id (Administrador o Coordinador)
app.delete('/api/comisiones/reglas/temporada/:id', authenticateToken, requireAdminOrCoordinador, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM comision_reglas_temporada WHERE id = ?', [id]);
    res.json({ success: true, message: 'Regla de temporada eliminada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete season rule' });
  }
});

// 5. POST /api/comisiones/bonos (Administrador o Coordinador)
app.post('/api/comisiones/bonos', authenticateToken, requireAdminOrCoordinador, async (req, res) => {
  const { ciclo_agricola, porcentaje_meta_requerido, bono_mxn } = req.body;
  if (!ciclo_agricola || porcentaje_meta_requerido === undefined || bono_mxn === undefined) {
    return res.status(400).json({ error: 'ciclo_agricola, porcentaje_meta_requerido y bono_mxn son requeridos' });
  }
  try {
    const result = await db.run(`
      INSERT INTO comision_bonos_metas (ciclo_agricola, porcentaje_meta_requerido, bono_mxn, activo)
      VALUES (?, ?, ?, 1)
    `, [ciclo_agricola, parseFloat(porcentaje_meta_requerido), parseFloat(bono_mxn)]);
    res.json({ success: true, id: result.id, message: 'Regla de bono por meta creada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create bonus rule' });
  }
});

// PUT /api/comisiones/bonos/:id (Administrador o Coordinador)
app.put('/api/comisiones/bonos/:id', authenticateToken, requireAdminOrCoordinador, async (req, res) => {
  const { id } = req.params;
  const { ciclo_agricola, porcentaje_meta_requerido, bono_mxn, activo } = req.body;
  try {
    const bonus = await db.get('SELECT * FROM comision_bonos_metas WHERE id = ?', [id]);
    if (!bonus) return res.status(404).json({ error: 'Bonus rule not found' });

    const newCiclo = ciclo_agricola !== undefined ? ciclo_agricola : bonus.ciclo_agricola;
    const newPct = porcentaje_meta_requerido !== undefined ? parseFloat(porcentaje_meta_requerido) : bonus.porcentaje_meta_requerido;
    const newBono = bono_mxn !== undefined ? parseFloat(bono_mxn) : bonus.bono_mxn;
    const newActivo = activo !== undefined ? (activo ? 1 : 0) : bonus.activo;

    await db.run(`
      UPDATE comision_bonos_metas 
      SET ciclo_agricola = ?, porcentaje_meta_requerido = ?, bono_mxn = ?, activo = ? 
      WHERE id = ?
    `, [newCiclo, newPct, newBono, newActivo, id]);
    res.json({ success: true, message: 'Regla de bono por meta actualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update bonus rule' });
  }
});

// DELETE /api/comisiones/bonos/:id (Administrador o Coordinador)
app.delete('/api/comisiones/bonos/:id', authenticateToken, requireAdminOrCoordinador, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM comision_bonos_metas WHERE id = ?', [id]);
    res.json({ success: true, message: 'Regla de bono eliminada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete bonus rule' });
  }
});

// 6. GET /api/comisiones/kpis (Admin + Asesor)
app.get('/api/comisiones/kpis', authenticateToken, async (req, res) => {
  try {
    const mes = req.query.mes || new Date().toISOString().slice(5, 7);
    const anio = req.query.anio || new Date().getFullYear().toString();
    const ciclo = req.query.ciclo || 'O-I 2026';

    let targetAsesorId = null;
    if (req.user.nivel_rol === 'Asesor') {
      targetAsesorId = req.user.id;
    } else if (req.query.asesor_id) {
      targetAsesorId = parseInt(req.query.asesor_id);
    }

    let kpiSql = `
      SELECT COALESCE(SUM(total_comision_mxn), 0.0) AS total_mes
      FROM comisiones_generadas
      WHERE estatus != 'Cancelada'
        AND TO_CHAR(fecha_calculo, 'YYYY-MM') = ?
    `;
    let kpiParams = [`${anio}-${mes}`];

    if (targetAsesorId) {
      kpiSql += ' AND asesor_id = ?';
      kpiParams.push(targetAsesorId);
    }

    const rowMes = await db.get(kpiSql, kpiParams);
    const totalMes = rowMes ? parseFloat(rowMes.total_mes) : 0.0;

    let salesSql = `
      SELECT COALESCE(SUM(c.total_mxn), 0.0) AS total_ventas
      FROM cotizaciones c
      WHERE c.estatus IN ('Vendido', 'Entregado') AND c.ciclo_agricola = ?
    `;
    let salesParams = [ciclo];
    if (targetAsesorId) {
      salesSql += ' AND c.asesor_id = ?';
      salesParams.push(targetAsesorId);
    }
    const salesRow = await db.get(salesSql, salesParams);
    const acumuladoVentas = salesRow ? parseFloat(salesRow.total_ventas) : 0.0;

    let metaSql = `SELECT COALESCE(SUM(monto_objetivo_mxn), 0.0) AS meta_total FROM metas_ventas WHERE ciclo_agricola = ?`;
    let metaParams = [ciclo];
    if (targetAsesorId) {
      metaSql += ' AND asesor_id = ?';
      metaParams.push(targetAsesorId);
    }
    const metaRow = await db.get(metaSql, metaParams);
    let metaVentas = metaRow ? parseFloat(metaRow.meta_total) : 0.0;
    if (!metaVentas || metaVentas === 0) metaVentas = 1000000.0;

    const reglasBonos = await db.all('SELECT * FROM comision_bonos_metas WHERE ciclo_agricola = ? AND activo = 1', [ciclo]);

    const bonusEval = await evaluarBonoPython(acumuladoVentas, metaVentas, reglasBonos);

    res.json({
      mes,
      anio,
      ciclo,
      total_generado_mes_mxn: Math.round(totalMes * 100) / 100,
      progreso_meta_porcentaje: bonusEval.porcentaje_meta_alcanzado,
      bono_proyectado_mxn: bonusEval.bono_proyectado_mxn,
      acumulado_ventas_mxn: Math.round(acumuladoVentas * 100) / 100,
      meta_ventas_mxn: metaVentas
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

// 7. GET /api/comisiones/reporte (Admin + Asesor)
app.get('/api/comisiones/reporte', authenticateToken, async (req, res) => {
  try {
    let targetAsesorId = null;
    if (req.user.nivel_rol === 'Asesor') {
      targetAsesorId = req.user.id;
    } else if (req.query.asesor_id) {
      targetAsesorId = parseInt(req.query.asesor_id);
    }

    const { fecha_ini, fecha_fin, estatus } = req.query;

    let sql = `
      SELECT cg.*, 
             a.nombre AS asesor_nombre, 
             c.folio_cotizacion, c.fecha_cotizacion, c.condiciones_pago,
             p.producto AS producto_nombre
      FROM comisiones_generadas cg
      JOIN asesores a ON cg.asesor_id = a.id
      LEFT JOIN cotizaciones c ON cg.cotizacion_id = c.id
      LEFT JOIN cotizacion_detalles cd ON cg.cotizacion_detalle_id = cd.id
      LEFT JOIN productos p ON cd.producto_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (targetAsesorId) {
      sql += ' AND cg.asesor_id = ?';
      params.push(targetAsesorId);
    }
    if (estatus) {
      sql += ' AND cg.estatus = ?';
      params.push(estatus);
    }
    if (fecha_ini) {
      sql += ' AND cg.fecha_calculo >= ?';
      params.push(fecha_ini);
    }
    if (fecha_fin) {
      sql += ' AND cg.fecha_calculo <= ?';
      params.push(fecha_fin);
    }

    sql += ' ORDER BY cg.id DESC';

    const reporte = await db.all(sql, params);
    res.json(reporte);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// 8. PUT /api/comisiones/pagar (Solo Administrador)
app.put('/api/comisiones/pagar', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { ids_comisiones } = req.body;
  if (!Array.isArray(ids_comisiones) || ids_comisiones.length === 0) {
    return res.status(400).json({ error: 'ids_comisiones array required' });
  }
  try {
    let updatedCount = 0;
    for (const id of ids_comisiones) {
      const resCount = await db.run(`
        UPDATE comisiones_generadas 
        SET estatus = 'Pagada' 
        WHERE id = ? AND estatus = 'Pendiente'
      `, [id]);
      if (resCount.changes > 0) updatedCount += resCount.changes;
    }
    res.json({ success: true, updated_count: updatedCount, message: `${updatedCount} comisiones marcadas como Pagadas` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process payments' });
  }
});

// 9. POST /api/comisiones/cierre-ciclo (Solo Administrador)
app.post('/api/comisiones/cierre-ciclo', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { ciclo_agricola } = req.body;
  const ciclo = ciclo_agricola || 'O-I 2026';
  try {
    const asesores = await db.all("SELECT id, nombre FROM asesores WHERE activo = 1 AND nivel_rol = 'Asesor'");
    const reglasBonos = await db.all('SELECT * FROM comision_bonos_metas WHERE ciclo_agricola = ? AND activo = 1', [ciclo]);

    let bonosMaterializados = 0;

    for (const a of asesores) {
      const salesRow = await db.get(`
        SELECT COALESCE(SUM(total_mxn), 0.0) AS total_ventas 
        FROM cotizaciones 
        WHERE asesor_id = ? AND estatus IN ('Vendido', 'Entregado') AND ciclo_agricola = ?
      `, [a.id, ciclo]);

      const totalVentas = salesRow ? parseFloat(salesRow.total_ventas) : 0.0;

      const metaRow = await db.get(`
        SELECT COALESCE(SUM(monto_objetivo_mxn), 0.0) AS meta_total 
        FROM metas_ventas 
        WHERE asesor_id = ? AND ciclo_agricola = ?
      `, [a.id, ciclo]);

      let metaVentas = metaRow ? parseFloat(metaRow.meta_total) : 0.0;
      if (!metaVentas || metaVentas === 0) metaVentas = 1000000.0;

      const bonusEval = await evaluarBonoPython(totalVentas, metaVentas, reglasBonos);
      const bonoMxn = bonusEval.bono_proyectado_mxn;

      if (bonoMxn > 0) {
        const existBono = await db.get(`
          SELECT * FROM comisiones_generadas 
          WHERE asesor_id = ? AND notas LIKE ? AND estatus != 'Cancelada'
        `, [a.id, `%Bono por Meta Cierre de Ciclo ${ciclo}%`]);

        if (!existBono) {
          const firstQuote = await db.get('SELECT id FROM cotizaciones WHERE asesor_id = ? ORDER BY id DESC LIMIT 1', [a.id]);
          const quoteId = firstQuote ? firstQuote.id : 1;
          await db.run(`
            INSERT INTO comisiones_generadas 
            (cotizacion_id, asesor_id, monto_base_aplicado, monto_temporada_aplicado, total_comision_mxn, estatus, notas) 
            VALUES (?, ?, 0, ?, ?, 'Pendiente', ?)
          `, [
            quoteId,
            a.id,
            bonoMxn,
            bonoMxn,
            `Bono por Meta Cierre de Ciclo ${ciclo} (${bonusEval.porcentaje_meta_alcanzado}% de la meta)`
          ]);
          bonosMaterializados++;
        }
      }
    }
    res.json({ success: true, bonos_materializados: bonosMaterializados, message: `Cierre de ciclo ${ciclo} procesado con éxito` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to execute cycle closing' });
  }
});

// Start only after the schema is ready, avoiding requests against a partially migrated database.
async function startServer() {
  await db.initSchema();
  app.listen(PORT, () => {
    console.log(`Casas Grandes Sales Management Server running on port ${PORT}`);
    agentsService.startBackgroundScheduler();
  });
}

startServer().catch(err => {
  console.error('Unable to initialize database schema:', err.message);
  process.exit(1);
});
