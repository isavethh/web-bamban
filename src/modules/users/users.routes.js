import { Router } from 'express';
import { env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rate-limit.js';
import { hashPassword, signToken, verifyPassword } from '../../lib/security.js';
import { newId } from '../../lib/text.js';
import { conflict, notFound, unauthorized } from '../../lib/errors.js';
import * as repo from './users.repo.js';
import * as s from './users.schemas.js';

// Cuentas de demostración que crea el seed, una por rol.
export const DEMO_USER_IDS = {
  seeker: 'demo_professional',
  employer: 'demo_employer',
  serviceSeeker: 'demo_service_seeker',
};

const session = (row) => ({ token: signToken('user', row.id), user: repo.toProfile(row) });

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate({ body: s.registerBody }), async (req, res) => {
  const { password, ...data } = req.valid.body;
  if (await repo.findByEmail(data.email)) throw conflict('El correo ya está registrado.');
  const id = newId();
  await repo.insertUser({ ...data, id, passwordHash: await hashPassword(password) });
  res.status(201).json(session(await repo.findById(id)));
});

authRouter.post('/login', authLimiter, validate({ body: s.loginBody }), async (req, res) => {
  const { email, password } = req.valid.body;
  const row = await repo.findByEmail(email);
  // Mismo mensaje en ambos casos: no revelar qué correos están registrados.
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw unauthorized('Correo o contraseña incorrectos.');
  }
  res.json(session(row));
});

authRouter.post('/demo', authLimiter, validate({ body: s.demoBody }), async (req, res) => {
  if (!env.DEMO_LOGIN_ENABLED) throw notFound('El ingreso de demostración está desactivado.');
  const row = await repo.findById(DEMO_USER_IDS[req.valid.body.role]);
  if (!row) throw notFound('La cuenta de demostración no existe. Ejecuta el seed.');
  res.json(session(row));
});

export const meRouter = Router();
meRouter.use(requireAuth('user'));

meRouter.get('/', async (req, res) => {
  const row = await repo.findById(req.auth.id);
  if (!row) throw unauthorized('Tu cuenta ya no existe.');
  res.json(repo.toProfile(row));
});

meRouter.patch('/', validate({ body: s.updateProfileBody }), async (req, res) => {
  const changes = req.valid.body;
  if (changes.email) {
    const other = await repo.findByEmail(changes.email);
    if (other && other.id !== req.auth.id) throw conflict('El correo ya está registrado.');
  }
  const row = await repo.updateUser(req.auth.id, changes);
  if (!row) throw unauthorized('Tu cuenta ya no existe.');
  res.json(repo.toProfile(row));
});

meRouter.put('/password', validate({ body: s.changePasswordBody }), async (req, res) => {
  const row = await repo.findById(req.auth.id);
  if (!row || !(await verifyPassword(req.valid.body.oldPassword, row.password_hash))) {
    throw unauthorized('La contraseña actual no es correcta.');
  }
  await repo.updatePassword(row.id, await hashPassword(req.valid.body.newPassword));
  res.status(204).end();
});

export const profilesRouter = Router();

profilesRouter.get('/', validate({ query: s.listProfilesQuery }), async (req, res) => {
  const list = await repo.listPublic(req.valid.query.role);
  res.json(list.map((r) => repo.toProfile(r, { includePrivate: false })));
});

profilesRouter.get('/:id', async (req, res) => {
  const row = await repo.findById(req.params.id);
  if (!row || !row.is_profile_public) throw notFound('Perfil no encontrado.');
  res.json(repo.toProfile(row, { includePrivate: false }));
});
