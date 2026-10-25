import { sql, one, rows, query } from '../../db/pool.js';
import { parseJson, searchText } from '../../lib/text.js';
import { sectorById } from './catalog.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
const dateOnly = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const json = (v, fallback) => [sql.NVarChar(sql.MAX), JSON.stringify(v ?? fallback)];

// --- Perfil de negocio -------------------------------------------------------

const BUSINESS_SELECT = `
  SELECT b.*, u.name AS owner_name, u.company_name, u.rating, u.is_employer_verified,
         u.photo AS logo,
         (SELECT COUNT(*) FROM offerings o WHERE o.owner_user_id = b.user_id AND o.is_active = 1)
           AS offerings_count,
         (SELECT MIN(o.price_amount) FROM offerings o
           WHERE o.owner_user_id = b.user_id AND o.is_active = 1) AS price_from
  FROM business_profiles b JOIN users u ON u.id = b.user_id`;

export function toBusiness(r) {
  const sector = sectorById(r.sector);
  return {
    id: r.user_id,
    name: r.company_name ?? r.owner_name,
    sector: r.sector,
    businessType: r.business_type,
    layout: sector?.layout ?? 'general',
    tagline: r.tagline,
    description: r.description,
    department: r.department,
    province: r.province,
    city: r.city,
    address: r.address,
    phone: r.phone,
    email: r.email,
    website: r.website,
    hours: r.hours,
    coverImage: r.cover_image,
    logo: r.logo,
    attributes: parseJson(r.attributes, {}),
    rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
    isVerified: Boolean(r.is_employer_verified),
    offeringsCount: r.offerings_count ?? 0,
    priceFrom: r.price_from === null || r.price_from === undefined ? null : Number(r.price_from),
  };
}

export const findBusiness = (userId, executor) =>
  one(`${BUSINESS_SELECT} WHERE b.user_id = @userId`, { userId }, executor);

export const listBusinesses = ({ sector, businessType } = {}) =>
  rows(
    `${BUSINESS_SELECT}
     WHERE (@sector IS NULL OR b.sector = @sector)
       AND (@type IS NULL OR b.business_type = @type)
     ORDER BY u.rating DESC, u.company_name`,
    { sector: sector ?? null, type: businessType ?? null },
  );

const BUSINESS_COLUMNS = {
  sector: 'sector',
  businessType: 'business_type',
  tagline: 'tagline',
  description: 'description',
  department: 'department',
  province: 'province',
  city: 'city',
  address: 'address',
  phone: 'phone',
  email: 'email',
  website: 'website',
  hours: 'hours',
  coverImage: 'cover_image',
  attributes: 'attributes',
};

/** Crea o actualiza el perfil de negocio con los campos presentes. */
export async function upsertBusiness(userId, data, executor) {
  const params = { userId };
  const present = Object.keys(BUSINESS_COLUMNS).filter((k) => data[k] !== undefined);
  for (const k of present) {
    params[k] =
      k === 'attributes'
        ? json(data[k], {})
        : k === 'coverImage'
          ? [sql.NVarChar(sql.MAX), data[k]]
          : k === 'description'
            ? [sql.NVarChar(3000), data[k]]
            : data[k];
  }
  const exists = await one(
    'SELECT 1 AS ok FROM business_profiles WHERE user_id = @userId',
    { userId },
    executor,
  );
  if (exists) {
    if (!present.length) return;
    await query(
      `UPDATE business_profiles
       SET ${present.map((k) => `${BUSINESS_COLUMNS[k]} = @${k}`).join(', ')},
           updated_at = SYSUTCDATETIME()
       WHERE user_id = @userId`,
      params,
      executor,
    );
  } else {
    await query(
      `INSERT INTO business_profiles (user_id, ${present.map((k) => BUSINESS_COLUMNS[k]).join(', ')})
       VALUES (@userId, ${present.map((k) => `@${k}`).join(', ')})`,
      params,
      executor,
    );
  }
}

/** Departamentos donde está el negocio: su sede principal y las de la cadena. */
export function businessPlaces(b) {
  const branches = Array.isArray(b.attributes?.branches) ? b.attributes.branches : [];
  return [
    { department: b.department, province: b.province, city: b.city },
    ...branches.map((s) => ({ department: s.department, province: s.province, city: s.city })),
  ];
}

// --- Ofertas -------------------------------------------------------------

export function toOffering(r) {
  return {
    id: r.id,
    ownerId: r.owner_user_id,
    ownerName: r.owner_company_name ?? r.owner_name ?? null,
    ownerRole: r.owner_role ?? null,
    kind: r.kind,
    title: r.title,
    description: r.description,
    price: r.price,
    priceAmount: r.price_amount === null ? null : Number(r.price_amount),
    unit: r.unit,
    duration: r.duration,
    capacity: r.capacity,
    department: r.department,
    province: r.province,
    city: r.city,
    image: r.image,
    details: parseJson(r.details, {}),
    isActive: Boolean(r.is_active),
    createdAt: iso(r.created_at),
  };
}

const OFFERING_SELECT = `
  SELECT o.*, u.name AS owner_name, u.company_name AS owner_company_name, u.role AS owner_role
  FROM offerings o JOIN users u ON u.id = o.owner_user_id`;

export const findOffering = (id) => one(`${OFFERING_SELECT} WHERE o.id = @id`, { id });

export const listOfferings = ({ ownerId, kinds, activeOnly = true } = {}) =>
  rows(
    `${OFFERING_SELECT}
     WHERE (@ownerId IS NULL OR o.owner_user_id = @ownerId)
       AND (@kinds IS NULL OR o.kind IN (SELECT value FROM OPENJSON(@kinds)))
       AND (@activeOnly = 0 OR o.is_active = 1)
     ORDER BY o.sort_order, o.created_at`,
    {
      ownerId: ownerId ?? null,
      kinds: [sql.NVarChar(sql.MAX), kinds ? JSON.stringify(kinds) : null],
      activeOnly: [sql.Bit, activeOnly],
    },
  );

const OFFERING_COLUMNS = {
  kind: 'kind',
  title: 'title',
  description: 'description',
  price: 'price',
  priceAmount: 'price_amount',
  unit: 'unit',
  duration: 'duration',
  capacity: 'capacity',
  department: 'department',
  province: 'province',
  city: 'city',
  image: 'image',
  details: 'details',
  isActive: 'is_active',
  sortOrder: 'sort_order',
};

function offeringParams(data) {
  const out = {};
  for (const k of Object.keys(OFFERING_COLUMNS)) {
    if (data[k] === undefined) continue;
    out[k] =
      k === 'details'
        ? json(data[k], {})
        : k === 'image'
          ? [sql.NVarChar(sql.MAX), data[k]]
          : k === 'description'
            ? [sql.NVarChar(3000), data[k]]
            : k === 'priceAmount'
              ? [sql.Decimal(12, 2), data[k]]
              : k === 'isActive'
                ? [sql.Bit, data[k]]
                : k === 'capacity' || k === 'sortOrder'
                  ? [sql.Int, data[k]]
                  : data[k];
  }
  return out;
}

export async function insertOffering(id, ownerId, data, executor) {
  const p = offeringParams(data);
  const fields = Object.keys(p);
  await query(
    `INSERT INTO offerings (id, owner_user_id, ${fields.map((f) => OFFERING_COLUMNS[f]).join(', ')})
     VALUES (@id, @ownerId, ${fields.map((f) => `@${f}`).join(', ')})`,
    { ...p, id, ownerId },
    executor,
  );
}

export async function updateOffering(id, data) {
  const p = offeringParams(data);
  const fields = Object.keys(p);
  if (!fields.length) return;
  await query(
    `UPDATE offerings SET ${fields.map((f) => `${OFFERING_COLUMNS[f]} = @${f}`).join(', ')}
     WHERE id = @id`,
    { ...p, id },
  );
}

// --- Promociones ---------------------------------------------------------

export function toPromotion(r) {
  return {
    id: r.id,
    ownerId: r.owner_user_id,
    ownerName: r.owner_company_name ?? r.owner_name ?? null,
    ownerRole: r.owner_role ?? null,
    storeId: r.store_id,
    storeName: r.store_name ?? null,
    title: r.title,
    description: r.description,
    discount: r.discount,
    validUntil: dateOnly(r.valid_until),
    department: r.department,
    province: r.province,
    city: r.city,
    image: r.image,
    createdAt: iso(r.created_at),
  };
}

const PROMOTION_SELECT = `
  SELECT p.*, u.name AS owner_name, u.company_name AS owner_company_name, u.role AS owner_role,
         s.name AS store_name
  FROM promotions p JOIN users u ON u.id = p.owner_user_id
  LEFT JOIN stores s ON s.id = p.store_id`;

export const findPromotion = (id) => one(`${PROMOTION_SELECT} WHERE p.id = @id`, { id });

export const listPromotions = ({ ownerId, activeOnly = true } = {}) =>
  rows(
    `${PROMOTION_SELECT}
     WHERE (@ownerId IS NULL OR p.owner_user_id = @ownerId)
       AND (@activeOnly = 0 OR p.valid_until IS NULL
            OR p.valid_until >= CAST(SYSUTCDATETIME() AS DATE))
     ORDER BY p.created_at DESC`,
    { ownerId: ownerId ?? null, activeOnly: [sql.Bit, activeOnly] },
  );

const PROMOTION_COLUMNS = {
  storeId: 'store_id',
  title: 'title',
  description: 'description',
  discount: 'discount',
  validUntil: 'valid_until',
  department: 'department',
  province: 'province',
  city: 'city',
  image: 'image',
};

function promotionParams(data) {
  const out = {};
  for (const k of Object.keys(PROMOTION_COLUMNS)) {
    if (data[k] === undefined) continue;
    out[k] =
      k === 'validUntil'
        ? [sql.Date, data[k] ? new Date(data[k]) : null]
        : k === 'image'
          ? [sql.NVarChar(sql.MAX), data[k]]
          : k === 'description'
            ? [sql.NVarChar(2000), data[k]]
            : data[k];
  }
  return out;
}

export async function insertPromotion(id, ownerId, data, executor) {
  const p = promotionParams(data);
  const fields = Object.keys(p);
  await query(
    `INSERT INTO promotions (id, owner_user_id${fields.map((f) => `, ${PROMOTION_COLUMNS[f]}`).join('')})
     VALUES (@id, @ownerId${fields.map((f) => `, @${f}`).join('')})`,
    { ...p, id, ownerId },
    executor,
  );
}

export async function updatePromotion(id, data) {
  const p = promotionParams(data);
  const fields = Object.keys(p);
  if (!fields.length) return;
  await query(
    `UPDATE promotions SET ${fields.map((f) => `${PROMOTION_COLUMNS[f]} = @${f}`).join(', ')}
     WHERE id = @id`,
    { ...p, id },
  );
}

// --- Consultas -----------------------------------------------------------

export function toInquiry(r) {
  return {
    id: r.id,
    fromUserId: r.from_user_id,
    fromName: r.from_name,
    fromEmail: r.from_email,
    toUserId: r.to_user_id,
    toName: r.to_company_name ?? r.to_name,
    offeringId: r.offering_id,
    offeringTitle: r.offering_title ?? null,
    message: r.message,
    travelDate: dateOnly(r.travel_date),
    people: r.people,
    contactPhone: r.contact_phone,
    status: r.status,
    reply: r.reply,
    repliedAt: iso(r.replied_at),
    createdAt: iso(r.created_at),
  };
}

export const INQUIRY_SELECT = `
  SELECT i.*, f.name AS from_name, f.email AS from_email,
         t.name AS to_name, t.company_name AS to_company_name, o.title AS offering_title
  FROM inquiries i
  JOIN users f ON f.id = i.from_user_id
  JOIN users t ON t.id = i.to_user_id
  LEFT JOIN offerings o ON o.id = i.offering_id`;

export async function insertInquiry(i, executor) {
  await query(
    `INSERT INTO inquiries (id, from_user_id, to_user_id, offering_id, message, travel_date,
       people, contact_phone, status, reply, replied_at, created_at)
     VALUES (@id, @fromUserId, @toUserId, @offeringId, @message, @travelDate, @people,
       @contactPhone, @status, @reply, @repliedAt, COALESCE(@createdAt, SYSUTCDATETIME()))`,
    {
      id: i.id,
      fromUserId: i.fromUserId,
      toUserId: i.toUserId,
      offeringId: i.offeringId ?? null,
      message: [sql.NVarChar(2000), i.message],
      travelDate: [sql.Date, i.travelDate ? new Date(i.travelDate) : null],
      people: [sql.Int, i.people ?? null],
      contactPhone: i.contactPhone ?? null,
      status: i.status ?? 'nueva',
      reply: [sql.NVarChar(2000), i.reply ?? null],
      repliedAt: [sql.DateTime2(3), i.repliedAt ? new Date(i.repliedAt) : null],
      createdAt: [sql.DateTime2(3), i.createdAt ? new Date(i.createdAt) : null],
    },
    executor,
  );
}

// --- Búsqueda por lugar ----------------------------------------------------

/** ¿Alguno de los lugares cae en el departamento / provincia pedidos? */
export function inPlace(places, { department, province }) {
  const d = department ? searchText(department) : null;
  const p = province ? searchText(province) : null;
  return places.some(
    (pl) =>
      (!d || searchText(pl.department ?? '') === d) && (!p || searchText(pl.province ?? '') === p),
  );
}

export const matchesWords = (text, words) => {
  const haystack = searchText(text);
  return words.every((w) => haystack.includes(w));
};
