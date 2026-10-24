import { verifyToken } from '../lib/security.js';
import { forbidden, unauthorized } from '../lib/errors.js';

function readToken(req) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * Lee el token si viene y deja la identidad en `req.auth`. No exige sesión:
 * las rutas públicas lo usan para personalizar la respuesta.
 */
export function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    next(unauthorized('Tu sesión expiró. Vuelve a ingresar.'));
  }
}

/** Exige sesión de alguno de los tipos indicados (`user`, `owner`). */
export const requireAuth =
  (...kinds) =>
  (req, res, next) =>
    optionalAuth(req, res, (err) => {
      if (err) return next(err);
      if (!req.auth) return next(unauthorized());
      if (kinds.length && !kinds.includes(req.auth.kind)) return next(forbidden());
      next();
    });
