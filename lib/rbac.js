import { verifyToken } from './auth.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.mnemos_auth;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      console.log(JSON.stringify({ event: 'auth.forbidden', userId: req.user?.userId, role: req.user?.role, requiredRole: roles, path: req.path }));
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
