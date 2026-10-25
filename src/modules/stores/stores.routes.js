import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { forbidden, notFound, unauthorized } from '../../lib/errors.js';
import { newId } from '../../lib/text.js';
import * as users from '../users/users.repo.js';
import * as repo from './stores.repo.js';

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
  department: optional(60),
  province: optional(120),
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
const idParam = z.object({ id: z.string().min(1).max(64) });

// --- Público -------------------------------------------------------------

export const storesRouter = Router();

storesRouter.get('/', async (_req, res) => {
  res.json((await repo.listStores()).map(repo.toStore));
});

storesRouter.get('/:slug', async (req, res) => {
  const store = await repo.findBySlug(req.params.slug);
  if (!store) throw notFound('Esta tienda no existe.');
  res.json(repo.toStore(store));
});

// --- Emprendimientos del profesional con sesión --------------------------

export const myStoresRouter = Router();
myStoresRouter.use(requireAuth('user'));

/** Solo un profesional o técnico tiene emprendimientos. */
async function professional(req) {
  const user = await users.findById(req.auth.id);
  if (!user) throw unauthorized('Tu cuenta ya no existe.');
  if (user.role !== 'seeker') {
    throw forbidden('Los emprendimientos son de las cuentas de profesional o técnico.');
  }
  return user;
}

async function ownedStore(req) {
  const store = await repo.findById(req.valid.params.id);
  if (!store) throw notFound('La tienda no existe.');
  if (store.owner_user_id !== req.auth.id) {
    throw forbidden('Este emprendimiento pertenece a otra cuenta.');
  }
  return store;
}

myStoresRouter.get('/', async (req, res) => {
  res.json((await repo.listByOwner(req.auth.id)).map(repo.toStore));
});

myStoresRouter.post('/', validate({ body: storeBody }), async (req, res) => {
  const user = await professional(req);
  const id = newId();
  const store = req.valid.body;
  await repo.insertStore({
    department: user.department,
    province: user.province,
    city: user.city,
    ...store,
    ownerName: store.ownerName ?? user.name,
    id,
    ownerId: user.id,
    slug: await repo.freeSlug(store.name),
  });
  res.status(201).json(repo.toStore(await repo.findById(id)));
});

myStoresRouter.put(
  '/:id',
  validate({ params: idParam, body: storeUpdateBody }),
  async (req, res) => {
    const store = await ownedStore(req);
    await repo.updateStore(store.id, req.valid.body);
    res.json(repo.toStore(await repo.findById(store.id)));
  },
);

myStoresRouter.delete('/:id', validate({ params: idParam }), async (req, res) => {
  const store = await ownedStore(req);
  await query('DELETE FROM promotions WHERE store_id = @id', { id: store.id });
  await query('DELETE FROM stores WHERE id = @id', { id: store.id });
  res.status(204).end();
});
