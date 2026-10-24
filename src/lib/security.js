import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ROUNDS = env.isTest ? 4 : 10;

export const hashPassword = (plain) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

/**
 * Hay dos tipos de cuenta: `user` (profesional, empresa, quien busca
 * servicios) y `owner` (emprendedor dueño de tiendas). El token dice cuál es.
 */
export function signToken(kind, id) {
  return jwt.sign({ kind }, env.JWT_SECRET, {
    subject: id,
    expiresIn: env.JWT_EXPIRES_IN,
    algorithm: 'HS256',
  });
}

export function verifyToken(token) {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  return { kind: payload.kind, id: payload.sub };
}
