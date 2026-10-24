import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { transaction, query } from '../../db/pool.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rate-limit.js';
import { hashPassword, signToken, verifyPassword } from '../../lib/security.js';
import { conflict, forbidden, notFound, unauthorized } from '../../lib/errors.js';
import { newId } from '../../lib/text.js';
import * as repo from './stores.repo.js';

export const DEMO_OWNER_USERNAME = 'marta';

const text = (max) => z.string().trim().max(max);
const optional = (max) => text(max).nullish();
const image = z.string().max(2_000_000, 'La imagen es demasiado grande.').nullish();

const product = z.object({
  name: text(150).min(1, 'Cada producto necesita un nombre.'),
  description: optional(500),
  price: optional(60),
  image,
});

// Sin valores por defecto: así la edición solo toca lo que llega.
const storeFields = {
  name: text(150).min(1, 'Escribe el nombre del emprendimiento.'),
  description: optional(3000),
  phone: optional(30),
  city: optional(120),
  address: optional(250),
  hours: optional(120),
  category: text(60),
  delivery: z.boolean(),
  ownerName: optional(150),
  instagram: optional(100),
  image1Url: image,
  image2Url: image,
  tags: z.array(text(60).min(1)).max(20),
  products: z.array(product).max(60),
};

const storeBody = z.object({
  ...storeFields,
  category: storeFields.category.default('Otro'),
  delivery: storeFields.delivery.default(false),
  tags: storeFields.tags.default([]),
  products: storeFields.products.default([]),
});
const storeUpdateBody = z.object(storeFields).partial();

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,60}$/, 'Usa de 3 a 60 letras, números, punto, guion o guion bajo.');

const registerBody = z.object({
  username,
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').max(128),
  store: storeBody,
});
const loginBody = z.object({ username, password: z.string().min(1).max(128) });
const idParam = z.object({ id: z.string().min(1).max(64) });

async function ownerSession(owner) {
  const stores = await repo.listByOwner(owner.id);
  return {
    token: signToken('owner', owner.id),
    owner: { id: owner.id, username: owner.username, displayName: owner.display_name },
    stores: stores.map((s) => repo.toStore(s, { ownerUsername: owner.username })),
  };
}

// --- Público -------------------------------------------------------------

export const storesRouter = Router();

storesRouter.get('/', async (_req, res) => {
  res.json((await repo.listStores()).map((s) => repo.toStore(s)));
});

storesRouter.get('/:slug', async (req, res) => {
  const store = await repo.findBySlug(req.params.slug);
  if (!store) throw notFound('Esta tienda no existe.');
  res.json(repo.toStore(store));
});

// --- Cuentas de emprendedor ----------------------------------------------

export const ownersRouter = Router();

ownersRouter.post('/register', authLimiter, validate({ body: registerBody }), async (req, res) => {
  const { username: user, password, store } = req.valid.body;
  if (await repo.findOwnerByUsername(user)) throw conflict('El nombre de usuario ya existe.');
  const ownerId = newId();
  const passwordHash = await hashPassword(password);
  await transaction(async (tx) => {
    await repo.insertOwner(
      { id: ownerId, username: user, passwordHash, displayName: store.ownerName },
      tx,
    );
    await repo.insertStore(
      { ...store, id: newId(), ownerId, slug: await repo.freeSlug(store.name, tx) },
      tx,
    );
  });
  res.status(201).json(await ownerSession(await repo.findOwnerById(ownerId)));
});

ownersRouter.post('/login', authLimiter, validate({ body: loginBody }), async (req, res) => {
  const owner = await repo.findOwnerByUsername(req.valid.body.username);
  if (!owner || !(await verifyPassword(req.valid.body.password, owner.password_hash))) {
    throw unauthorized('Usuario o contraseña incorrectos.');
  }
  res.json(await ownerSession(owner));
});

ownersRouter.post('/demo', authLimiter, async (_req, res) => {
  if (!env.DEMO_LOGIN_ENABLED) throw notFound('El ingreso de demostración está desactivado.');
  const owner = await repo.findOwnerByUsername(DEMO_OWNER_USERNAME);
  if (!owner) throw notFound('La cuenta de demostración no existe. Ejecuta el seed.');
  res.json(await ownerSession(owner));
});

const me = Router();
me.use(requireAuth('owner'));

async function currentOwner(req) {
  const owner = await repo.findOwnerById(req.auth.id);
  if (!owner) throw unauthorized('Tu cuenta ya no existe.');
  return owner;
}

async function ownedStore(req) {
  const owner = await currentOwner(req);
  const store = await repo.findById(req.valid.params.id);
  if (!store) throw notFound('La tienda no existe.');
  if (store.owner_id !== owner.id) throw forbidden('Este emprendimiento pertenece a otra cuenta.');
  return { owner, store };
}

me.get('/', async (req, res) => {
  const { token: _token, ...session } = await ownerSession(await currentOwner(req));
  res.json(session);
});

me.post('/stores', validate({ body: storeBody }), async (req, res) => {
  const owner = await currentOwner(req);
  const id = newId();
  const store = req.valid.body;
  await repo.insertStore({
    ...store,
    ownerName: store.ownerName ?? owner.display_name,
    id,
    ownerId: owner.id,
    slug: await repo.freeSlug(store.name),
  });
  res.status(201).json(repo.toStore(await repo.findById(id), { ownerUsername: owner.username }));
});

me.put('/stores/:id', validate({ params: idParam, body: storeUpdateBody }), async (req, res) => {
  const { owner, store } = await ownedStore(req);
  await repo.updateStore(store.id, req.valid.body);
  res.json(repo.toStore(await repo.findById(store.id), { ownerUsername: owner.username }));
});

me.delete('/stores/:id', validate({ params: idParam }), async (req, res) => {
  const { store } = await ownedStore(req);
  await query('DELETE FROM stores WHERE id = @id', { id: store.id });
  res.status(204).end();
});

ownersRouter.use('/me', me);
