import { sql, one, rows, query } from '../../db/pool.js';
import { parseJson, slugify } from '../../lib/text.js';

/** Fila de `stores` → `Emprendimiento` del frontend. */
export function toStore(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    products: parseJson(r.products, []),
    phone: r.phone,
    // El profesional dueño de la tienda.
    ownerId: r.owner_user_id,
    image1Url: r.image1,
    image2Url: r.image2,
    category: r.category,
    department: r.department,
    province: r.province,
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
  department: ['department'],
  province: ['province'],
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
  rows('SELECT * FROM stores WHERE owner_user_id = @ownerId ORDER BY created_at', { ownerId });

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
    `INSERT INTO stores (id, owner_user_id, slug, rating, reviews_count, created_at,
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
