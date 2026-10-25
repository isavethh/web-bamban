import { logger } from '../lib/logger.js';
import { HttpError } from '../lib/errors.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Ruta no encontrada.' });
}

// Express reconoce el manejador de errores por sus cuatro argumentos.
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El contenido es demasiado grande.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.' });
  }
  (req.log ?? logger).error({ err }, 'error no controlado');
  res.status(500).json({ error: 'Ocurrió un error inesperado. Intenta de nuevo.' });
}
