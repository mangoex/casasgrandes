const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/clientes
router.get('/', authenticateToken, async (req, res) => {
  const { asesor_id, cuenta_clave_id, q, page, limit, all } = req.query;
  try {
    const isFetchAll = all === 'true';
    const usesPagination = !isFetchAll && (page !== undefined || limit !== undefined || q !== undefined);
    const requestedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const requestedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 10), 100);
    let whereSql = 'WHERE c.activo = 1';
    const params = [];

    if (req.user.nivel_rol === 'Asesor') {
      whereSql += ' AND c.asesor_id = ?';
      params.push(req.user.id);
    } else if (asesor_id) {
      whereSql += ' AND c.asesor_id = ?';
      params.push(asesor_id);
    }

    if (cuenta_clave_id && cuenta_clave_id !== 'ALL') {
      whereSql += ' AND c.cuenta_clave_id = ?';
      params.push(Number(cuenta_clave_id));
    }

    const search = String(q || '').trim();
    if (search) {
      whereSql += ' AND (c.nombre ILIKE ? OR c.ubicacion ILIKE ? OR c.contacto ILIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    let query = `
      SELECT c.id, c.nombre, c.asesor_id, c.cuenta_clave_id, c.cliente_principal_id, c.contacto, c.telefono,
             c.correo, c.cumpleanos, c.estado_status, c.ubicacion, c.superficie_text, c.disponible_para_puja,
             a.nombre as asesor_nombre, cc.tier_name as cuenta_clave_nombre, cc.descuento_mxn,
             principal.nombre as principal_nombre,
             (SELECT COUNT(*)::int FROM clientes sub WHERE sub.cliente_principal_id = c.id AND sub.activo = 1) as asociados_count
      FROM clientes c
      LEFT JOIN asesores a ON c.asesor_id = a.id
      LEFT JOIN cuentas_clave cc ON c.cuenta_clave_id = cc.id
      LEFT JOIN clientes principal ON c.cliente_principal_id = principal.id
      ${whereSql}
    `;
    
    query += ` ORDER BY c.nombre ASC`;
    if (!usesPagination) {
      const rows = await db.all(query, params);
      return res.json(rows);
    }

    const countQuery = `SELECT count(*)::int AS total FROM clientes c ${whereSql}`;
    const totalRow = await db.get(countQuery, params);
    query += ` LIMIT ? OFFSET ?`;
    const rows = await db.all(query, [...params, requestedLimit, (requestedPage - 1) * requestedLimit]);
    const total = totalRow?.total || 0;
    res.json({
      data: rows,
      page: requestedPage,
      limit: requestedLimit,
      total,
      totalPages: Math.max(Math.ceil(total / requestedLimit), 1)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// GET /api/clientes/seleccionados?ids=1,2,3
// Returns the current records for a catalog selection, independently of pagination.
router.get('/seleccionados', authenticateToken, async (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map(value => Number(value))
    .filter(id => Number.isInteger(id) && id > 0);
  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length === 0 || uniqueIds.length > 200) {
    return res.status(400).json({ error: 'Entre 1 y 200 ids de agricultores son requeridos.' });
  }

  try {
    let query = `
      SELECT c.id, c.nombre, c.asesor_id, c.cuenta_clave_id, c.cliente_principal_id, c.contacto, c.telefono,
             c.correo, c.cumpleanos, c.estado_status, c.ubicacion, c.superficie_text, c.disponible_para_puja,
             a.nombre as asesor_nombre, cc.tier_name as cuenta_clave_nombre, cc.descuento_mxn,
             principal.nombre as principal_nombre
      FROM clientes c
      LEFT JOIN asesores a ON c.asesor_id = a.id
      LEFT JOIN cuentas_clave cc ON c.cuenta_clave_id = cc.id
      LEFT JOIN clientes principal ON c.cliente_principal_id = principal.id
      WHERE c.activo = 1 AND c.id = ANY($1::int[])
    `;
    const params = [uniqueIds];
    if (req.user.nivel_rol === 'Asesor') {
      query += ' AND c.asesor_id = $2';
      params.push(req.user.id);
    }
    query += ' ORDER BY c.nombre ASC';

    const result = await db.pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No fue posible recuperar los agricultores seleccionados.' });
  }
});

// POST /api/clientes/bulk-puja-status (Admin only)
router.post('/bulk-puja-status', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Se requieren permisos de Administrador' });
  }
  const { ids, disponible_para_puja } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Se requiere un arreglo de IDs válido.' });
  }
  const uniqueIds = [...new Set(ids.map(Number).filter(id => Number.isInteger(id) && id > 0))];
  if (uniqueIds.length === 0) {
    return res.status(400).json({ error: 'No se enviaron IDs válidos.' });
  }

  try {
    const statusVal = disponible_para_puja ? 1 : 0;
    await db.pool.query(
      'UPDATE clientes SET disponible_para_puja = $1 WHERE id = ANY($2::int[]) AND activo = 1',
      [statusVal, uniqueIds]
    );

    if (!disponible_para_puja) {
      await db.pool.query(
        "UPDATE crm_pujas SET estatus = 'Rechazada' WHERE cliente_id = ANY($1::int[]) AND estatus = 'Pendiente'",
        [uniqueIds]
      );
    }

    res.json({
      message: `Se actualizaron ${uniqueIds.length} agricultor(es) para subasta exitosamente.`,
      count: uniqueIds.length,
      disponible_para_puja: statusVal
    });
  } catch (err) {
    console.error('Error in bulk-puja-status:', err);
    res.status(500).json({ error: 'Error al actualizar el estado de subasta masivo.' });
  }
});

// GET /api/clientes/:id
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const client = await db.get(`
      SELECT c.id, c.nombre, c.asesor_id, c.cuenta_clave_id, c.cliente_principal_id, c.contacto, c.telefono,
             c.correo, c.cumpleanos, c.estado_status, c.ubicacion, c.superficie_text, c.disponible_para_puja,
             a.nombre as asesor_nombre, cc.tier_name as cuenta_clave_nombre, cc.descuento_mxn,
             principal.nombre as principal_nombre,
             (SELECT COUNT(*)::int FROM clientes sub WHERE sub.cliente_principal_id = c.id AND sub.activo = 1) as asociados_count
      FROM clientes c
      LEFT JOIN asesores a ON c.asesor_id = a.id
      LEFT JOIN cuentas_clave cc ON c.cuenta_clave_id = cc.id
      LEFT JOIN clientes principal ON c.cliente_principal_id = principal.id
      WHERE c.id = ? AND c.activo = 1
    `, [id]);

    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (req.user.nivel_rol === 'Asesor' && Number(client.asesor_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'No tienes autorización para consultar este cliente.' });
    }
    res.json(client);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// GET /api/clientes/:id/asociados
router.get('/:id/asociados', authenticateToken, async (req, res) => {
  const principalId = Number(req.params.id);
  if (!Number.isInteger(principalId) || principalId <= 0) {
    return res.status(400).json({ error: 'Valid principal client id is required' });
  }

  try {
    const principal = await db.get(
      'SELECT id, asesor_id FROM clientes WHERE id = ? AND activo = 1',
      [principalId]
    );
    if (!principal) return res.status(404).json({ error: 'Principal client not found' });
    if (req.user.nivel_rol === 'Asesor' && Number(principal.asesor_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'No puedes consultar asociaciones de otra cartera.' });
    }

    let query = `
      SELECT c.id, c.nombre, c.asesor_id, c.cuenta_clave_id, c.cliente_principal_id, c.contacto, c.telefono,
             c.correo, c.cumpleanos, c.estado_status, c.ubicacion, c.superficie_text,
             a.nombre as asesor_nombre, cc.tier_name as cuenta_clave_nombre, cc.descuento_mxn,
             principal.nombre as principal_nombre,
             0::int as asociados_count
      FROM clientes c
      LEFT JOIN asesores a ON c.asesor_id = a.id
      LEFT JOIN cuentas_clave cc ON c.cuenta_clave_id = cc.id
      LEFT JOIN clientes principal ON c.cliente_principal_id = principal.id
      WHERE c.activo = 1 AND c.cliente_principal_id = $1
    `;
    const params = [principalId];
    if (req.user.nivel_rol === 'Asesor') {
      query += ' AND c.asesor_id = $2';
      params.push(req.user.id);
    }
    query += ' ORDER BY c.nombre ASC';

    const result = await db.pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch associated farmers' });
  }
});

// POST /api/clientes
router.post('/', authenticateToken, async (req, res) => {
  const { nombre, asesor_id, cuenta_clave_id, contacto, telefono, correo, cumpleanos, ubicacion, superficie_text } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Client name is required' });
  
  try {
    const trimmedName = nombre.trim();
    const existing = await db.get('SELECT id, activo FROM clientes WHERE LOWER(nombre) = LOWER(?)', [trimmedName]);
    
    if (existing) {
      if (Number(existing.activo) === 1) {
        return res.status(400).json({ error: 'Un agricultor activo con este nombre ya existe en el sistema.' });
      }
      
      // Reactivate previously soft-deleted farmer (activo = 0)
      const assignedAsesor = req.user.nivel_rol === 'Asesor'
        ? req.user.id
        : ((asesor_id === null || asesor_id === '') ? null : (asesor_id || req.user.id));
      const ccId = cuenta_clave_id || 1;

      await db.run(`
        UPDATE clientes
        SET activo = 1,
            disponible_para_puja = 0,
            asesor_id = ?,
            cuenta_clave_id = ?,
            contacto = ?,
            telefono = ?,
            correo = ?,
            cumpleanos = ?,
            estado_status = 'Nuevo',
            ubicacion = ?,
            superficie_text = ?
        WHERE id = ?
      `, [assignedAsesor, ccId, contacto || null, telefono || null, correo || null, cumpleanos || null, ubicacion || null, superficie_text || null, existing.id]);

      return res.status(200).json({ id: existing.id, message: 'Agricultor reactivado y registrado exitosamente' });
    }
    
    const assignedAsesor = req.user.nivel_rol === 'Asesor'
      ? req.user.id
      : ((asesor_id === null || asesor_id === '') ? null : (asesor_id || req.user.id));
    const ccId = cuenta_clave_id || 1;
    
    const result = await db.run(`
      INSERT INTO clientes (nombre, asesor_id, cuenta_clave_id, contacto, telefono, correo, cumpleanos, estado_status, ubicacion, superficie_text, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Nuevo', ?, ?, 1)
    `, [trimmedName, assignedAsesor, ccId, contacto, telefono, correo, cumpleanos, ubicacion, superficie_text]);
    
    res.status(201).json({ id: result.id, message: 'Client registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// PUT /api/clientes/:id
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { nombre, asesor_id, cuenta_clave_id, contacto, telefono, correo, cumpleanos, estado_status, ubicacion, superficie_text } = req.body;
  
  try {
    const client = await db.get('SELECT * FROM clientes WHERE id = ? AND activo = 1', [id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    if (req.user.nivel_rol === 'Asesor' && Number(client.asesor_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized to edit this client' });
    }
    
    await db.run(`
      UPDATE clientes
      SET nombre = ?, asesor_id = ?, cuenta_clave_id = ?, contacto = ?, telefono = ?, correo = ?, cumpleanos = ?, estado_status = ?, ubicacion = ?, superficie_text = ?
      WHERE id = ?
    `, [
      nombre || client.nombre,
      req.user.nivel_rol === 'Asesor' ? req.user.id : (asesor_id !== undefined ? (asesor_id === '' ? null : asesor_id) : client.asesor_id),
      cuenta_clave_id || client.cuenta_clave_id,
      contacto !== undefined ? contacto : client.contacto,
      telefono !== undefined ? telefono : client.telefono,
      correo !== undefined ? correo : client.correo,
      cumpleanos !== undefined ? cumpleanos : client.cumpleanos,
      estado_status || client.estado_status,
      ubicacion !== undefined ? ubicacion : client.ubicacion,
      superficie_text !== undefined ? superficie_text : client.superficie_text,
      id
    ]);
    
    res.json({ message: 'Client updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/clientes/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }

  const { id } = req.params;
  try {
    const client = await db.get('SELECT * FROM clientes WHERE id = ? AND activo = 1', [id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    await db.run('UPDATE clientes SET activo = 0, disponible_para_puja = 0 WHERE id = ?', [id]);
    await db.run("UPDATE crm_pujas SET estatus = 'Rechazada' WHERE cliente_id = ? AND estatus = 'Pendiente'", [id]);
    res.json({ message: 'Client deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// POST /api/clientes/bulk-delete
router.post('/bulk-delete', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }

  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map(Number).filter(id => Number.isInteger(id) && id > 0)
    : [];

  if (ids.length === 0) {
    return res.status(400).json({ error: 'Client ids are required' });
  }

  try {
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
    const deleted = await db.pool.query(
      `UPDATE clientes
       SET activo = 0, disponible_para_puja = 0
       WHERE activo = 1 AND id IN (${placeholders})`,
      ids
    );
    await db.pool.query(
      `UPDATE crm_pujas
       SET estatus = 'Rechazada'
       WHERE estatus = 'Pendiente' AND cliente_id IN (${placeholders})`,
      ids
    );
    res.json({ message: 'Clients deleted successfully', deleted: deleted.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete clients' });
  }
});

// GET /api/clientes/:id/visitas
router.get('/:id/visitas', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const client = await db.get('SELECT id, asesor_id FROM clientes WHERE id = ? AND activo = 1', [id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (req.user.nivel_rol === 'Asesor' && Number(client.asesor_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized to view this client history' });
    }

    const visits = await db.all(`
      SELECT v.*, a.nombre as asesor_nombre
      FROM crm_visitas v
      JOIN asesores a ON v.asesor_id = a.id
      WHERE v.cliente_id = ?
      ORDER BY v.fecha_visita DESC
    `, [id]);

    const stageReports = await db.all(`
      SELECT r.id, r.planificacion_id, r.etapa_clave, r.fecha_reporte, r.respuestas, r.creado_en, r.actualizado_en,
             a.nombre AS asesor_nombre
      FROM crm_reportes_etapa r
      JOIN asesores a ON a.id = r.asesor_id
      WHERE r.cliente_id = ?
      ORDER BY r.fecha_reporte DESC, r.actualizado_en DESC
    `, [id]);

    const combined = [
      ...visits.map(item => ({ ...item, tipo: 'visita', source: 'crm_visitas' })),
      ...stageReports.map(item => ({ ...item, tipo: 'reporte_etapa', source: 'crm_reportes_etapa' }))
    ].sort((left, right) => {
      const leftDate = left.fecha_reporte || left.fecha_visita || '';
      const rightDate = right.fecha_reporte || right.fecha_visita || '';
      return String(rightDate).localeCompare(String(leftDate));
    });

    res.json(combined);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch visit logs' });
  }
});

// POST /api/clientes/:id/visitas
router.post('/:id/visitas', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { comentarios_bitacora, proxima_cita } = req.body;
  if (!comentarios_bitacora) return res.status(400).json({ error: 'Comentarios are required' });
  
  try {
    const client = await db.get('SELECT id, asesor_id FROM clientes WHERE id = ? AND activo = 1', [id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (req.user.nivel_rol === 'Asesor' && client.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to register a visit for this client' });
    }
    
    const now = new Date().toISOString().slice(0, 10);
    await db.run(`
      INSERT INTO crm_visitas (fecha_visita, cliente_id, asesor_id, comentarios_bitacora, proxima_cita)
      VALUES (?, ?, ?, ?, ?)
    `, [now, id, req.user.id, comentarios_bitacora, proxima_cita || null]);
    
    res.status(201).json({ message: 'Visit logged successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log visit' });
  }
});

// POST /api/clientes/asociar
router.post('/asociar', authenticateToken, async (req, res) => {
  const { principal_id, asociados_ids } = req.body;
  if (!principal_id || !Array.isArray(asociados_ids) || asociados_ids.length === 0) {
    return res.status(400).json({ error: 'principal_id and asociados_ids array are required' });
  }

  const pId = Number(principal_id);
  const targetIds = [...new Set(asociados_ids.map(Number).filter(id => Number.isInteger(id) && id > 0 && id !== pId))];

  if (targetIds.length === 0) {
    return res.status(400).json({ error: 'At least one secondary client id is required' });
  }

  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');

    const selectedIds = [pId, ...targetIds];
    const selected = await client.query(
      'SELECT id, asesor_id FROM clientes WHERE activo = 1 AND id = ANY($1::int[]) FOR UPDATE',
      [selectedIds]
    );
    if (selected.rows.length !== selectedIds.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Uno o más agricultores seleccionados ya no están disponibles. Actualiza el catálogo e inténtalo de nuevo.' });
    }
    if (req.user.nivel_rol === 'Asesor' && selected.rows.some(row => Number(row.asesor_id) !== Number(req.user.id))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Solo puedes asociar agricultores asignados a tu propia cuenta.' });
    }

    // The selected representative must remain a root, and every selected farmer
    // is updated in the same transaction, even when it came from another page.
    await client.query('UPDATE clientes SET cliente_principal_id = NULL WHERE id = $1', [pId]);
    await client.query(
      'UPDATE clientes SET cliente_principal_id = $1 WHERE id = ANY($2::int[])',
      [pId, targetIds]
    );

    await client.query('COMMIT');
    res.json({ message: 'Farmers associated successfully', principal_id: pId, associated_ids: targetIds, count: targetIds.length });
  } catch (err) {
    await client?.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to associate farmers' });
  } finally {
    client?.release();
  }
});

// POST /api/clientes/desasociar
router.post('/desasociar', authenticateToken, async (req, res) => {
  const { cliente_id } = req.body;
  const cId = Number(cliente_id);
  if (!cId || !Number.isInteger(cId)) {
    return res.status(400).json({ error: 'Valid cliente_id is required' });
  }

  try {
    await db.run('UPDATE clientes SET cliente_principal_id = NULL WHERE id = ?', [cId]);
    res.json({ message: 'Farmer disassociated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to disassociate farmer' });
  }
});

// POST /api/clientes/disolver-grupo
router.post('/disolver-grupo', authenticateToken, async (req, res) => {
  const { principal_id } = req.body;
  const pId = Number(principal_id);
  if (!pId || !Number.isInteger(pId)) {
    return res.status(400).json({ error: 'Valid principal_id is required' });
  }

  try {
    await db.run('UPDATE clientes SET cliente_principal_id = NULL WHERE cliente_principal_id = ?', [pId]);
    res.json({ message: 'Association group disbanded successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to disband group' });
  }
});

module.exports = router;
