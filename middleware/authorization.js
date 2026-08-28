const ROLES = Object.freeze({
  ADMIN: 'Administrador',
  COORDINATOR: 'Coordinador',
  ADVISOR: 'Asesor',
  WAREHOUSE: 'Almacen',
  COLLECTION: 'Acopio'
});

const COMMERCIAL_ROLES = Object.freeze([
  ROLES.ADMIN,
  ROLES.COORDINATOR,
  ROLES.ADVISOR
]);

const INVENTORY_ROLES = Object.freeze([
  ROLES.ADMIN,
  ROLES.WAREHOUSE,
  ROLES.COLLECTION
]);

function requireRoles(...allowedRoles) {
  const allowed = new Set(allowedRoles.flat());
  return function authorizeRole(req, res, next) {
    if (!req.user || !allowed.has(req.user.nivel_rol)) {
      return res.status(403).json({ error: 'Access denied for this role' });
    }
    next();
  };
}

function canAccessOwnedResource(user, ownerId) {
  if (!user) return false;
  if ([ROLES.ADMIN, ROLES.COORDINATOR].includes(user.nivel_rol)) return true;
  return user.nivel_rol === ROLES.ADVISOR && Number(user.id) === Number(ownerId);
}

function requireOwnedResource(user, ownerId, res, message = 'Access denied for this resource') {
  if (canAccessOwnedResource(user, ownerId)) return true;
  res.status(403).json({ error: message });
  return false;
}

module.exports = {
  COMMERCIAL_ROLES,
  INVENTORY_ROLES,
  ROLES,
  canAccessOwnedResource,
  requireOwnedResource,
  requireRoles
};
