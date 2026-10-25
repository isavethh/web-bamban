import { Router } from 'express';
import { z } from 'zod';
import { one, rows, query } from '../../db/pool.js';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { newId, searchWords } from '../../lib/text.js';
import * as users from '../users/users.repo.js';
import * as stores from '../stores/stores.repo.js';
import { OFFERING_KINDS, SECTORS, isValidType, sectorById } from './catalog.js';
import * as repo from './business.repo.js';

const text = (max) => z.string().trim().max(max);
const optional = (max) => text(max).nullish();
const list = (max = 40, len = 120) => z.array(text(len).min(1)).max(max);
const image = z.string().max(2_000_000, 'La imagen es demasiado grande.').nullish();
const idParam = z.object({ id: z.string().min(1).max(64) });

const place = {
  department: optional(60),
  province: optional(120),
  city: optional(120),
};

// Lo que cambia según el rubro. Todo es opcional: cada presentación usa lo suyo.
const attributes = z
  .object({
    stars: z.number().int().min(1).max(5).nullish(),
    amenities: list(),
    checkIn: optional(20),
    checkOut: optional(20),
    languages: list(15, 40),
    destinations: list(),
    cuisine: optional(120),
    priceRange: z.enum(['$', '$$', '$$$', '$$$$']).nullish(),
    services: list(),
    certifications: list(20),
    license: optional(80),
    branches: z
      .array(
        z.object({
          name: text(150).min(1),
          ...place,
          address: optional(250),
          phone: optional(30),
        }),
      )
      .max(50),
  })
  .partial();

const businessBody = z
  .object({
    sector: z.enum(SECTORS.map((s) => s.id)),
    businessType: text(40),
    tagline: optional(200),
    description: optional(3000),
    ...place,
    address: optional(250),
    phone: optional(30),
    email: z.string().trim().toLowerCase().email().max(254).nullish(),
    website: optional(300),
    hours: optional(150),
    coverImage: image,
    attributes,
  })
  .partial();

const offeringFields = {
  kind: z.enum(['room', 'package', 'dish', 'service', 'workshop', 'tour']),
  title: text(200).min(2, 'Ponle un nombre.'),
  description: optional(3000),
  price: optional(80),
  priceAmount: z.number().min(0).max(10_000_000).nullish(),
  unit: optional(60),
  duration: optional(80),
  capacity: z.number().int().min(1).max(10_000).nullish(),
  ...place,
  image,
  details: z
    .object({
      includes: list(30, 200),
      itinerary: list(30, 400),
      amenities: list(),
      beds: optional(120),
      category: optional(80),
      languages: list(15, 40),
      meetingPoint: optional(200),
      schedule: optional(200),
    })
    .partial(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
};
const offeringBody = z.object({
  ...offeringFields,
  details: offeringFields.details.default({}),
  isActive: offeringFields.isActive.default(true),
  sortOrder: offeringFields.sortOrder.default(0),
});
const offeringUpdate = z.object(offeringFields).partial();

const promotionFields = {
  storeId: z.string().max(64).nullish(),
  title: text(200).min(2, 'Ponle un título.'),
  description: optional(2000),
  discount: optional(60),
  validUntil: z.iso.date().nullish(),
  ...place,
  image,
};
const promotionBody = z.object(promotionFields);
const promotionUpdate = promotionBody.partial();

const inquiryBody = z.object({
  toUserId: z.string().min(1).max(64),
  offeringId: z.string().max(64).nullish(),
  message: text(2000).min(5, 'Cuéntales qué necesitas.'),
  travelDate: z.iso.date().nullish(),
  people: z.number().int().min(1).max(500).nullish(),
  contactPhone: optional(30),
});
const inquiryUpdate = z.object({
  reply: optional(2000),
  status: z.enum(['nueva', 'respondida', 'cerrada']).optional(),
});

// Rol con sesión, para decidir qué puede publicar.
async function me(req) {
  const row = await users.findById(req.auth.id);
  if (!row) throw forbidden('Tu cuenta ya no existe.');
  return row;
}

/** Qué tipos de oferta puede publicar esta cuenta. */
async function allowedKinds(user) {
  if (user.role === 'seeker') return OFFERING_KINDS.professional;
  if (user.role !== 'employer') return [];
  const business = await repo.findBusiness(user.id);
  if (!business) return OFFERING_KINDS.general;
  return OFFERING_KINDS[sectorById(business.sector)?.layout ?? 'general'];
}

const canPublish = (user) => user.role === 'employer' || user.role === 'seeker';

// --- Catálogo ---------------------------------------------------------------

export const catalogRouter = Router();
catalogRouter.get('/business-sectors', (_req, res) => res.json(SECTORS));

// --- Negocios públicos -------------------------------------------------------

const businessQuery = z.object({
  sector: z.string().max(40).optional(),
  businessType: z.string().max(40).optional(),
  department: z.string().max(60).optional(),
  province: z.string().max(120).optional(),
  q: z.string().max(200).default(''),
});

export const businessesRouter = Router();

/** Negocios filtrados por rubro, lugar (incluye sedes de cadenas) y texto. */
export async function findBusinesses(filters) {
  const words = searchWords(filters.q ?? '').slice(0, 8);
  const list = (await repo.listBusinesses(filters)).map(repo.toBusiness);
  return list.filter(
    (b) =>
      repo.inPlace(repo.businessPlaces(b), filters) &&
      repo.matchesWords(
        [
          b.name,
          b.tagline,
          b.description,
          b.city,
          b.province,
          b.department,
          b.attributes.cuisine,
          ...(b.attributes.destinations ?? []),
          ...(b.attributes.amenities ?? []),
          ...(b.attributes.services ?? []),
        ].join(' '),
        words,
      ),
  );
}

businessesRouter.get('/', validate({ query: businessQuery }), async (req, res) => {
  res.json(await findBusinesses(req.valid.query));
});

businessesRouter.get('/:id', validate({ params: idParam }), async (req, res) => {
  const row = await repo.findBusiness(req.valid.params.id);
  if (!row) throw notFound('Este negocio no existe.');
  const [offerings, promotions] = await Promise.all([
    repo.listOfferings({ ownerId: row.user_id }),
    repo.listPromotions({ ownerId: row.user_id }),
  ]);
  res.json({
    business: repo.toBusiness(row),
    offerings: offerings.map(repo.toOffering),
    promotions: promotions.map(repo.toPromotion),
  });
});

// --- Mi negocio (empresa con sesión) ----------------------------------------

export const myBusinessRouter = Router();
myBusinessRouter.use(requireAuth('user'));

myBusinessRouter.get('/business', async (req, res) => {
  const user = await me(req);
  if (user.role !== 'employer') throw forbidden('Solo las empresas tienen perfil de negocio.');
  const row = await repo.findBusiness(user.id);
  res.json(row ? repo.toBusiness(row) : null);
});

myBusinessRouter.put('/business', validate({ body: businessBody }), async (req, res) => {
  const user = await me(req);
  if (user.role !== 'employer') throw forbidden('Solo las empresas tienen perfil de negocio.');
  const current = await repo.findBusiness(user.id);
  const data = req.valid.body;
  const sector = data.sector ?? current?.sector;
  const type = data.businessType ?? current?.business_type;
  if (!sector || !type) throw badRequest('Elige el rubro y el tipo de empresa.');
  if (!isValidType(sector, type)) throw badRequest('El tipo de empresa no corresponde al rubro.');
  await repo.upsertBusiness(user.id, { ...data, sector, businessType: type });
  res.json(repo.toBusiness(await repo.findBusiness(user.id)));
});

// --- Mis ofertas ------------------------------------------------------------

myBusinessRouter.get('/offerings', async (req, res) => {
  const list = await repo.listOfferings({ ownerId: req.auth.id, activeOnly: false });
  res.json(list.map(repo.toOffering));
});

async function ownedOffering(req) {
  const row = await repo.findOffering(req.valid.params.id);
  if (!row) throw notFound('No existe.');
  if (row.owner_user_id !== req.auth.id) throw forbidden('No es tuyo.');
  return row;
}

async function checkKind(user, kind) {
  const kinds = await allowedKinds(user);
  if (!kinds.includes(kind)) {
    throw badRequest(
      kinds.length
        ? `Tu cuenta puede publicar: ${kinds.join(', ')}.`
        : 'Tu tipo de cuenta no publica servicios.',
    );
  }
}

myBusinessRouter.post('/offerings', validate({ body: offeringBody }), async (req, res) => {
  const user = await me(req);
  await checkKind(user, req.valid.body.kind);
  const business = user.role === 'employer' ? await repo.findBusiness(user.id) : null;
  // Si no dice dónde, es donde está el negocio o la persona.
  const data = {
    department: business?.department ?? user.department,
    province: business?.province ?? user.province,
    city: business?.city ?? user.city,
    ...req.valid.body,
  };
  const id = newId();
  await repo.insertOffering(id, user.id, data);
  res.status(201).json(repo.toOffering(await repo.findOffering(id)));
});

myBusinessRouter.put(
  '/offerings/:id',
  validate({ params: idParam, body: offeringUpdate }),
  async (req, res) => {
    const row = await ownedOffering(req);
    if (req.valid.body.kind) await checkKind(await me(req), req.valid.body.kind);
    await repo.updateOffering(row.id, req.valid.body);
    res.json(repo.toOffering(await repo.findOffering(row.id)));
  },
);

myBusinessRouter.delete('/offerings/:id', validate({ params: idParam }), async (req, res) => {
  const row = await ownedOffering(req);
  await query('DELETE FROM offerings WHERE id = @id', { id: row.id });
  res.status(204).end();
});

// --- Mis promociones ----------------------------------------------------------

myBusinessRouter.get('/promotions', async (req, res) => {
  const list = await repo.listPromotions({ ownerId: req.auth.id, activeOnly: false });
  res.json(list.map(repo.toPromotion));
});

async function checkPromotionStore(userId, storeId) {
  if (!storeId) return;
  const store = await stores.findById(storeId);
  if (!store || store.owner_user_id !== userId) {
    throw forbidden('Este emprendimiento pertenece a otra cuenta.');
  }
}

myBusinessRouter.post('/promotions', validate({ body: promotionBody }), async (req, res) => {
  const user = await me(req);
  if (!canPublish(user)) throw forbidden('Tu tipo de cuenta no publica promociones.');
  await checkPromotionStore(user.id, req.valid.body.storeId);
  const business = user.role === 'employer' ? await repo.findBusiness(user.id) : null;
  const data = {
    department: business?.department ?? user.department,
    province: business?.province ?? user.province,
    city: business?.city ?? user.city,
    ...req.valid.body,
  };
  const id = newId();
  await repo.insertPromotion(id, user.id, data);
  res.status(201).json(repo.toPromotion(await repo.findPromotion(id)));
});

async function ownedPromotion(req) {
  const row = await repo.findPromotion(req.valid.params.id);
  if (!row) throw notFound('No existe.');
  if (row.owner_user_id !== req.auth.id) throw forbidden('No es tuya.');
  return row;
}

myBusinessRouter.put(
  '/promotions/:id',
  validate({ params: idParam, body: promotionUpdate }),
  async (req, res) => {
    const row = await ownedPromotion(req);
    await checkPromotionStore(req.auth.id, req.valid.body.storeId);
    await repo.updatePromotion(row.id, req.valid.body);
    res.json(repo.toPromotion(await repo.findPromotion(row.id)));
  },
);

myBusinessRouter.delete('/promotions/:id', validate({ params: idParam }), async (req, res) => {
  const row = await ownedPromotion(req);
  await query('DELETE FROM promotions WHERE id = @id', { id: row.id });
  res.status(204).end();
});

// --- Consultas ------------------------------------------------------------

myBusinessRouter.get(
  '/inquiries',
  validate({ query: z.object({ box: z.enum(['sent', 'received']).default('received') }) }),
  async (req, res) => {
    const column = req.valid.query.box === 'sent' ? 'from_user_id' : 'to_user_id';
    const list = await rows(
      `${repo.INQUIRY_SELECT} WHERE i.${column} = @u ORDER BY i.created_at DESC`,
      { u: req.auth.id },
    );
    res.json(list.map(repo.toInquiry));
  },
);

myBusinessRouter.patch(
  '/inquiries/:id',
  validate({ params: idParam, body: inquiryUpdate }),
  async (req, res) => {
    const row = await one('SELECT * FROM inquiries WHERE id = @id', { id: req.valid.params.id });
    if (!row) throw notFound('La consulta no existe.');
    if (row.to_user_id !== req.auth.id) throw forbidden('Solo quien la recibió puede responder.');
    const { reply, status } = req.valid.body;
    await query(
      `UPDATE inquiries SET
         reply = COALESCE(@reply, reply),
         replied_at = CASE WHEN @reply IS NULL THEN replied_at ELSE SYSUTCDATETIME() END,
         status = COALESCE(@status, CASE WHEN @reply IS NULL THEN status ELSE 'respondida' END)
       WHERE id = @id`,
      { id: row.id, reply: reply ?? null, status: status ?? null },
    );
    const updated = await one(`${repo.INQUIRY_SELECT} WHERE i.id = @id`, { id: row.id });
    res.json(repo.toInquiry(updated));
  },
);

export const inquiriesRouter = Router();

inquiriesRouter.post(
  '/',
  requireAuth('user'),
  validate({ body: inquiryBody }),
  async (req, res) => {
    const data = req.valid.body;
    if (data.toUserId === req.auth.id) throw badRequest('No puedes escribirte a ti mismo.');
    const to = await users.findById(data.toUserId);
    if (!to || !canPublish(to)) throw notFound('No encontramos a quién escribir.');
    if (data.offeringId) {
      const offering = await repo.findOffering(data.offeringId);
      if (!offering || offering.owner_user_id !== to.id) {
        throw badRequest('Esa oferta no es de este negocio.');
      }
    }
    const id = newId();
    await repo.insertInquiry({ ...data, id, fromUserId: req.auth.id });
    const row = await one(`${repo.INQUIRY_SELECT} WHERE i.id = @id`, { id });
    res.status(201).json(repo.toInquiry(row));
  },
);

// --- Ofertas y promociones públicas -----------------------------------------

const placeQuery = z.object({
  department: z.string().max(60).optional(),
  province: z.string().max(120).optional(),
  q: z.string().max(200).default(''),
});

export const offeringsRouter = Router();

offeringsRouter.get(
  '/',
  validate({
    query: placeQuery.extend({
      ownerId: z.string().max(64).optional(),
      kind: z.enum(['room', 'package', 'dish', 'service', 'workshop', 'tour']).optional(),
    }),
  }),
  async (req, res) => {
    const { ownerId, kind, q, ...where } = req.valid.query;
    const words = searchWords(q).slice(0, 8);
    const list = (await repo.listOfferings({ ownerId, kinds: kind ? [kind] : undefined }))
      .map(repo.toOffering)
      .filter(
        (o) =>
          repo.inPlace([o], where) &&
          repo.matchesWords(`${o.title} ${o.description ?? ''} ${o.ownerName ?? ''}`, words),
      );
    res.json(list);
  },
);

export const promotionsRouter = Router();

promotionsRouter.get('/', validate({ query: placeQuery }), async (req, res) => {
  const { q, ...where } = req.valid.query;
  const words = searchWords(q).slice(0, 8);
  const list = (await repo.listPromotions())
    .map(repo.toPromotion)
    .filter(
      (p) =>
        repo.inPlace([p], where) &&
        repo.matchesWords(`${p.title} ${p.description ?? ''} ${p.ownerName ?? ''}`, words),
    );
  res.json(list);
});

// --- Explorar (lo que busca un turista) ----------------------------------------

export const EXPLORE_CATEGORIES = [
  'hospedaje',
  'gastronomia',
  'agencias',
  'guias',
  'talleres',
  'promociones',
  'emprendimientos',
];

// Profesionales que interesan a un turista, por lo que ofrecen.
export const GUIDE_CATEGORY = 'Guía de turismo';
export const CRAFT_CATEGORY = 'Artesanía y talleres';

const exploreQuery = placeQuery.extend({
  category: z.enum(EXPLORE_CATEGORIES).optional(),
});

export const exploreRouter = Router();

exploreRouter.get('/', optionalAuth, validate({ query: exploreQuery }), async (req, res) => {
  const { category, q, department, province } = req.valid.query;
  const where = { department, province };
  const words = searchWords(q).slice(0, 8);
  const wants = (c) => !category || category === c;
  const LIMIT = 60;

  const businesses = (await findBusinesses({ ...where, q })).filter(
    (b) =>
      (wants('hospedaje') && b.sector === 'hospedaje') ||
      (wants('gastronomia') && b.sector === 'gastronomia') ||
      (wants('agencias') && b.sector === 'turismo' && b.businessType !== 'guias_turisticos') ||
      (wants('guias') && b.businessType === 'guias_turisticos') ||
      // Sin categoría también aparecen las demás empresas del lugar.
      (!category && !['hospedaje', 'gastronomia', 'turismo'].includes(b.sector)),
  );

  const offeringKinds = [
    ...(wants('hospedaje') ? ['room'] : []),
    ...(wants('agencias') ? ['package'] : []),
    ...(wants('gastronomia') ? ['dish'] : []),
    ...(wants('guias') ? ['tour'] : []),
    ...(wants('talleres') ? ['workshop'] : []),
  ];
  // Lo que ofrece una cadena vale en todas sus sedes.
  const ownerPlaces = new Map(
    (await findBusinesses({})).map((b) => [b.id, repo.businessPlaces(b)]),
  );
  const offerings = offeringKinds.length
    ? (await repo.listOfferings({ kinds: offeringKinds }))
        .map(repo.toOffering)
        .filter(
          (o) =>
            repo.inPlace([o, ...(ownerPlaces.get(o.ownerId) ?? [])], where) &&
            repo.matchesWords(`${o.title} ${o.description ?? ''} ${o.ownerName ?? ''}`, words),
        )
    : [];

  const wantedCategories = [
    ...(wants('guias') ? [GUIDE_CATEGORY] : []),
    ...(wants('talleres') ? [CRAFT_CATEGORY] : []),
  ];
  const professionals = wantedCategories.length
    ? (await users.listPublic('seeker'))
        .map((r) => users.toProfile(r, { includePrivate: false }))
        .filter(
          (p) =>
            (p.serviceCategories ?? []).some((c) => wantedCategories.includes(c)) &&
            repo.inPlace([p], where) &&
            repo.matchesWords(
              [p.name, p.specialty, p.summary, p.city, ...(p.serviceCategories ?? [])].join(' '),
              words,
            ),
        )
    : [];

  const promotions = wants('promociones')
    ? (await repo.listPromotions())
        .map(repo.toPromotion)
        .filter(
          (p) =>
            repo.inPlace([p], where) &&
            repo.matchesWords(`${p.title} ${p.description ?? ''} ${p.ownerName ?? ''}`, words),
        )
    : [];

  const storeList = wants('emprendimientos')
    ? (await stores.listStores())
        .map((s) => stores.toStore(s))
        .filter(
          (s) =>
            repo.inPlace([s], where) &&
            repo.matchesWords(
              `${s.name} ${s.description ?? ''} ${s.category} ${s.city ?? ''} ${s.tags.join(' ')}`,
              words,
            ),
        )
    : [];

  res.json({
    businesses: businesses.slice(0, LIMIT),
    offerings: offerings.slice(0, LIMIT),
    professionals: professionals.slice(0, LIMIT),
    promotions: promotions.slice(0, LIMIT),
    stores: storeList.slice(0, LIMIT),
  });
});
