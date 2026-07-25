/**
 * utils/associations.js
 * 
 * Lógica auxiliar para la gestión de Agricultores Asociados (Grupos de Clientes).
 */

/**
 * Calcula el total de clientes contándolos por entidades/grupos comerciales.
 * Cada grupo de asociados (principal + secundarios) se cuenta como 1 sola entidad.
 * 
 * @param {Array<{ id: number, cliente_principal_id: number|null }>} clients 
 * @returns {number} Conteo único de entidades de clientes
 */
function calculateConsolidatedClientCount(clients = []) {
  if (!Array.isArray(clients) || clients.length === 0) return 0;
  
  const uniqueEntities = new Set();
  for (const c of clients) {
    // Si tiene cliente_principal_id, la entidad es el ID del principal. Si no, es su propio ID.
    const entityId = c.cliente_principal_id ? c.cliente_principal_id : c.id;
    uniqueEntities.add(entityId);
  }
  return uniqueEntities.size;
}

/**
 * Devuelve el total real de asociados. El conteo del servidor sigue siendo
 * válido aunque la página actual todavía no haya cargado los registros hijos.
 *
 * @param {{ asociados?: Array, asociados_count?: number|string }} client
 * @returns {number}
 */
function getAssociatedCount(client = {}) {
  const loadedCount = Array.isArray(client.asociados) ? client.asociados.length : 0;
  const serverCount = Number(client.asociados_count) || 0;
  return Math.max(loadedCount, serverCount);
}

/**
 * Agrupa una lista plana de clientes en una estructura jerárquica (Principales con sus Secundarios).
 * 
 * @param {Array<Object>} clients 
 * @returns {Array<Object>} Lista de clientes principales enriquecida con la propiedad `asociados`
 */
function groupClientsHierarchy(clients = []) {
  if (!Array.isArray(clients)) return [];
  
  const clientMap = new Map();
  const principals = [];
  const secondaries = [];

  // Indexar clientes
  for (const c of clients) {
    const item = { ...c, asociados: [] };
    clientMap.set(c.id, item);
  }

  // Clasificar principales y secundarios
  for (const c of clients) {
    const item = clientMap.get(c.id);
    if (c.cliente_principal_id && clientMap.has(c.cliente_principal_id)) {
      secondaries.push(item);
    } else {
      principals.push(item);
    }
  }

  // Anidar secundarios dentro del principal correspondiente
  for (const sec of secondaries) {
    const parent = clientMap.get(sec.cliente_principal_id);
    if (parent) {
      parent.asociados.push(sec);
    }
  }

  return principals;
}

module.exports = {
  calculateConsolidatedClientCount,
  getAssociatedCount,
  groupClientsHierarchy
};
