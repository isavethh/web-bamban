import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const limiter = (limit, windowMs) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.isTest,
    message: { error: 'Demasiados intentos. Espera un momento y vuelve a intentar.' },
  });

/** Ingreso y registro: frena la prueba de contraseñas por fuerza bruta. */
export const authLimiter = limiter(20, 15 * 60 * 1000);

/** Cada consulta a la IA cuesta dinero: límite por IP. */
export const aiLimiter = limiter(15, 60 * 1000);

/** Límite general para toda la API. */
export const apiLimiter = limiter(300, 60 * 1000);
