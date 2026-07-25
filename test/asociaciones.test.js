const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateConsolidatedClientCount, getAssociatedCount, groupClientsHierarchy } = require('../utils/associations');

test('contabiliza 3 agricultores independientes como 3 entidades distintas', () => {
  const clients = [
    { id: 1, nombre: 'Cliente A', cliente_principal_id: null },
    { id: 2, nombre: 'Cliente B', cliente_principal_id: null },
    { id: 3, nombre: 'Cliente C', cliente_principal_id: null }
  ];
  assert.equal(calculateConsolidatedClientCount(clients), 3);
});

test('contabiliza 1 grupo de asociados (1 principal + 2 secundarios) como 1 sola entidad', () => {
  const clients = [
    { id: 10, nombre: 'Principal X', cliente_principal_id: null },
    { id: 11, nombre: 'Secundario Y', cliente_principal_id: 10 },
    { id: 12, nombre: 'Secundario Z', cliente_principal_id: 10 }
  ];
  assert.equal(calculateConsolidatedClientCount(clients), 1);
});

test('contabiliza una mezcla de independientes y grupos correctamente', () => {
  const clients = [
    { id: 1, nombre: 'Independiente 1', cliente_principal_id: null },
    { id: 10, nombre: 'Principal X', cliente_principal_id: null },
    { id: 11, nombre: 'Secundario Y', cliente_principal_id: 10 },
    { id: 12, nombre: 'Secundario Z', cliente_principal_id: 10 },
    { id: 2, nombre: 'Independiente 2', cliente_principal_id: null }
  ];
  // 1 (Independiente 1) + 1 (Grupo 10) + 1 (Independiente 2) = 3 entidades
  assert.equal(calculateConsolidatedClientCount(clients), 3);
});

test('agrupa la jerarquía de principales y secundarios en forma de árbol', () => {
  const clients = [
    { id: 1, nombre: 'Agro1', cliente_principal_id: null },
    { id: 2, nombre: 'Agro2', cliente_principal_id: 1 },
    { id: 3, nombre: 'Agro3', cliente_principal_id: 1 },
    { id: 4, nombre: 'Indep', cliente_principal_id: null }
  ];
  const hierarchy = groupClientsHierarchy(clients);
  assert.equal(hierarchy.length, 2); // 2 principales (Agro1 e Indep)
  
  const agro1 = hierarchy.find(c => c.id === 1);
  assert.ok(agro1);
  assert.equal(agro1.asociados.length, 2);
  assert.equal(agro1.asociados[0].id, 2);
  assert.equal(agro1.asociados[1].id, 3);
});

test('al disolver una asociación todos los miembros vuelven a ser independientes', () => {
  let clients = [
    { id: 10, nombre: 'Principal X', cliente_principal_id: null },
    { id: 11, nombre: 'Secundario Y', cliente_principal_id: 10 },
    { id: 12, nombre: 'Secundario Z', cliente_principal_id: 10 }
  ];
  assert.equal(calculateConsolidatedClientCount(clients), 1);

  // Simular disolución de grupo (cliente_principal_id = null)
  clients = clients.map(c => ({ ...c, cliente_principal_id: null }));
  assert.equal(calculateConsolidatedClientCount(clients), 3);
  const hierarchy = groupClientsHierarchy(clients);
  assert.equal(hierarchy.length, 3);
  assert.equal(hierarchy[0].asociados.length, 0);
});

test('muestra el conteo del servidor cuando los asociados están en otra página', () => {
  assert.equal(getAssociatedCount({ asociados: [], asociados_count: 2 }), 2);
});

test('conserva el conteo de asociados cargados en la misma página', () => {
  assert.equal(getAssociatedCount({ asociados: [{ id: 2 }], asociados_count: 1 }), 1);
});

test('usa el mayor conteo mientras termina la carga paginada', () => {
  assert.equal(getAssociatedCount({ asociados: [{ id: 2 }], asociados_count: 3 }), 3);
});
