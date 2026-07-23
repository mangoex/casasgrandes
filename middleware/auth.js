const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token required' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function requireProgramacionManager(req, res, next) {
  if (!['Administrador', 'Coordinador'].includes(req.user.nivel_rol)) {
    return res.status(403).json({ error: 'Programación requiere permisos de Administrador o Coordinador' });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireProgramacionManager,
  JWT_SECRET,
  JWT_EXPIRES_IN
};
