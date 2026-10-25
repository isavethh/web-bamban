import { pino } from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  // Nunca escribir credenciales en los logs.
  redact: ['req.headers.authorization', '*.password', '*.passwordHash', '*.password_hash'],
});
