import { sql, one, rows, query } from '../../db/pool.js';
import { parseJson, slugify } from '../../lib/text.js';

/** Fila de `stores` → `Emprendimiento` del frontend. */
export function toStore(r, { ownerUsername } = {}) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    products: parseJson(r.products, []),
    phone: r.phone,
    // En la app, `ownerId` es el usuario con el que entra el emprendedor.
    // Solo se devuelve a su dueño, nunca en el listado público.
    ownerId: ownerUsername ?? null,
    image1Url: r.image1,
    image2Url: r.image2,
    category: r.category,
    city: r.city,
    address: r.address,
    hours: r.hours,
    rating: r.rating === null ? null : Number(r.rating),
    reviewsCount: r.reviews_count,
    tags: parseJson(r.tags, []),
    delivery: Boolean(r.delivery),
    ownerName: r.owner_name,
    instagram: r.instagram,
    publicSlug: r.slug,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

const COLUMNS = {
  name: ['name'],
  description: ['description', () => sql.NVarChar(3000)],
  phone: ['phone'],
  city: ['city'],
  address: ['address'],
  hours: ['hours'],
  category: ['category'],
  delivery: ['delivery', () => sql.Bit],
  ownerName: ['owner_name'],
  instagram: ['instagram'],
  image1Url: ['image1', () => sql.NVarChar(sql.MAX)],
  image2Url: ['image2', () => sql.NVarChar(sql.MAX)],
  tags: ['tags', () => sql.NVarChar(sql.MAX), JSON.stringify],
  products: ['products', () => sql.NVarChar(sql.MAX), JSON.stringify],
};

function params(store) {
  const out = {};
  for (const [field, [, type, encode]] of Object.entries(COLUMNS)) {
    if (store[field] === undefined) continue;
    const value = encode ? encode(store[field]) : store[field];
    out[field] = type ? [type(), value] : value;
  }
  return out;
}

export const listStores = () => rows('SELECT * FROM stores ORDER BY created_at DESC');
export const findBySlug = (slug) => one('SELECT * FROM stores WHERE slug = @slug', { slug });
export const findById = (id, executor) =>
  one('SELECT * FROM stores WHERE id = @id', { id }, executor);
export const listByOwner = (ownerId) =>
  rows('SELECT * FROM stores WHERE owner_id = @ownerId ORDER BY created_at', { ownerId });

/** «mi-tienda», «mi-tienda-2»... el primero que no esté usado. */
export async function freeSlug(name, executor) {
  const base = slugify(name, 'mi-tienda');
  const taken = new Set(
    (
      await rows(
        'SELECT slug FROM stores WHERE slug = @base OR slug LIKE @pattern',
        { base, pattern: `${base}-%` },
        executor,
      )
    ).map((r) => r.slug),
  );
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export async function insertStore(store, executor) {
  const p = params({ tags: [], products: [], ...store });
  const fields = Object.keys(p);
  await query(
    `INSERT INTO stores (id, owner_id, slug, rating, reviews_count, created_at,
       ${fields.map((f) => COLUMNS[f][0]).join(', ')})
     VALUES (@id, @ownerId, @slug, @rating, @reviewsCount, COALESCE(@createdAt, SYSUTCDATETIME()),
       ${fields.map((f) => `@${f}`).join(', ')})`,
    {
      ...p,
      id: store.id,
      ownerId: store.ownerId,
      slug: store.slug,
      rating: [sql.Decimal(3, 2), store.rating ?? null],
      reviewsCount: [sql.Int, store.reviewsCount ?? 0],
      createdAt: [sql.DateTime2(3), store.createdAt ? new Date(store.createdAt) : null],
    },
    executor,
  );
}

export async function updateStore(id, changes) {
  const p = params(changes);
  const fields = Object.keys(p);
  if (!fields.length) return;
  await query(
    `UPDATE stores SET ${fields.map((f) => `${COLUMNS[f][0]} = @${f}`).join(', ')},
       updated_at = SYSUTCDATETIME() WHERE id = @id`,
    { ...p, id },
  );
}

export const findOwnerByUsername = (username, executor) =>
  one('SELECT * FROM store_owners WHERE username = @username', { username }, executor);

export const findOwnerById = (id) => one('SELECT * FROM store_owners WHERE id = @id', { id });

export async function insertOwner(owner, executor) {
  await query(
    `INSERT INTO store_owners (id, username, password_hash, display_name, is_demo)
     VALUES (@id, @username, @passwordHash, @displayName, @isDemo)`,
    {
      id: owner.id,
      username: owner.username,
      passwordHash: owner.passwordHash,
      displayName: owner.displayName ?? null,
      isDemo: [sql.Bit, Boolean(owner.isDemo)],
    },
    executor,
  );
}
