import { Router } from 'express';
import { z } from 'zod';
import { one, rows, query } from '../../db/pool.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { newId, parseJson } from '../../lib/text.js';
import { cvSchema } from '../cv/cv.routes.js';
import * as users from '../users/users.repo.js';
import * as repo from './opportunities.repo.js';

const text = (max) => z.string().trim().max(max);
const optional = (max) => text(max).nullish();
const lines = z.array(z.string().trim().min(1).max(300)).max(30).default([]);

const createBody = z.object({
  type: z.enum(repo.OPPORTUNITY_TYPES),
  title: text(200).min(3, 'El título es muy corto.'),
  organization: text(200).min(1, 'Indica la organización.'),
  publisherType: z.enum(repo.PUBLISHER_TYPES),
  rubro: text(100).min(1),
  city: text(120).min(1),
  modality: text(40).min(1),
  description: text(4000).min(10, 'Describe la oportunidad.'),
  deadline: z.coerce.date(),
  startDate: z.coerce.date().nullish(),
  requirements: lines,
  benefits: lines,
  tags: lines,
  compensation: optional(200),
  duration: optional(100),
  spots: z.number().int().min(1).max(100_000).nullish(),
  contact: optional(200),
  isFeatured: z.boolean().default(false),
});

const applyBody = z.object({
  message: optional(2000),
  cvFileName: optional(200),
  sentCv: z.boolean().default(false),
  cv: cvSchema.optional(),
});

const idParam = z.object({ id: z.string().min(1).max(64) });

export const opportunitiesRouter = Router();

opportunitiesRouter.get('/', async (_req, res) => {
  res.json((await repo.listOpportunities()).map(repo.toOpportunity));
});

opportunitiesRouter.get('/:id', validate({ params: idParam }), async (req, res) => {
  const row = await repo.findOpportunity(req.valid.params.id);
  if (!row) throw notFound('La oportunidad no existe.');
  res.json(repo.toOpportunity(row));
});

opportunitiesRouter.post(
  '/',
  requireAuth('user'),
  validate({ body: createBody }),
  async (req, res) => {
    const me = await users.findById(req.auth.id);
    const id = newId();
    await repo.insertOpportunity({
      ...req.valid.body,
      id,
      ownerId: me.id,
      publishedBy: req.valid.body.publisherType === 'profesional' ? me.name : null,
    });
    res.status(201).json(repo.toOpportunity(await repo.findOpportunity(id)));
  },
);

opportunitiesRouter.delete(
  '/:id',
  requireAuth('user'),
  validate({ params: idParam }),
  async (req, res) => {
    const row = await repo.findOpportunity(req.valid.params.id);
    if (!row) throw notFound('La oportunidad no existe.');
    if (row.owner_user_id !== req.auth.id) throw forbidden('Solo quien la publicó puede borrarla.');
    await query('DELETE FROM opportunities WHERE id = @id', { id: row.id });
    res.status(204).end();
  },
);

opportunitiesRouter.post(
  '/:id/applications',
  requireAuth('user'),
  validate({ params: idParam, body: applyBody }),
  async (req, res) => {
    const opp = await repo.findOpportunity(req.valid.params.id);
    if (!opp) throw notFound('La oportunidad no existe.');
    if (opp.owner_user_id === req.auth.id) {
      throw badRequest('No puedes postular a una oportunidad que publicaste.');
    }
    const existing = await one(
      'SELECT * FROM applications WHERE opportunity_id = @o AND applicant_user_id = @u',
      { o: opp.id, u: req.auth.id },
    );
    if (existing) return res.json(await myApplication(existing));

    const me = users.toProfile(await users.findById(req.auth.id));
    const stored = await one('SELECT data FROM cvs WHERE user_id = @id', { id: me.id });
    const cv = req.valid.body.cv ?? parseJson(stored?.data, {});
    const pick = (fromCv, fromProfile) => (fromCv?.trim() ? fromCv : (fromProfile ?? ''));
    const id = newId();
    await repo.insertApplication({
      id,
      opportunityId: opp.id,
      applicantId: me.id,
      message: req.valid.body.message,
      sentCv: req.valid.body.sentCv,
      cvFileName: req.valid.body.sentCv ? req.valid.body.cvFileName : null,
      cv,
      name: pick(cv.fullName, me.name) || 'Postulante',
      headline: pick(cv.headline, me.specialty),
      city: pick(cv.city, me.city),
      phone: pick(cv.phone, me.phoneIntl),
      email: pick(cv.email, me.email),
      photoBase64: me.photoBase64,
    });
    res
      .status(201)
      .json(await myApplication(await one('SELECT * FROM applications WHERE id = @id', { id })));
  },
);

opportunitiesRouter.delete(
  '/:id/applications/mine',
  requireAuth('user'),
  validate({ params: idParam }),
  async (req, res) => {
    await query('DELETE FROM applications WHERE opportunity_id = @o AND applicant_user_id = @u', {
      o: req.valid.params.id,
      u: req.auth.id,
    });
    res.status(204).end();
  },
);

/** La postulación vista por quien postuló. */
async function myApplication(row) {
  const opp = await repo.findOpportunity(row.opportunity_id);
  return {
    id: row.id,
    status: row.status,
    appliedAt: new Date(row.applied_at).toISOString(),
    note: row.message,
    cvFileName: row.cv_file_name,
    opportunity: repo.toOpportunity(opp),
  };
}

export const myOpportunitiesRouter = Router();
myOpportunitiesRouter.use(requireAuth('user'));

myOpportunitiesRouter.get('/applications', async (req, res) => {
  const list = await rows(
    `SELECT a.id AS application_id, a.status, a.applied_at, a.message, a.cv_file_name, o.*
     FROM applications a JOIN opportunities o ON o.id = a.opportunity_id
     WHERE a.applicant_user_id = @u ORDER BY a.applied_at DESC`,
    { u: req.auth.id },
  );
  res.json(
    list.map((r) => ({
      id: r.application_id,
      status: r.status,
      appliedAt: new Date(r.applied_at).toISOString(),
      note: r.message,
      cvFileName: r.cv_file_name,
      opportunity: repo.toOpportunity(r),
    })),
  );
});

myOpportunitiesRouter.get('/saved-opportunities', async (req, res) => {
  const list = await rows(
    'SELECT opportunity_id FROM saved_opportunities WHERE user_id = @u ORDER BY created_at',
    { u: req.auth.id },
  );
  res.json(list.map((r) => r.opportunity_id));
});

myOpportunitiesRouter.put(
  '/saved-opportunities/:id',
  validate({ params: idParam }),
  async (req, res) => {
    if (!(await repo.findOpportunity(req.valid.params.id)))
      throw notFound('La oportunidad no existe.');
    await query(
      `IF NOT EXISTS (SELECT 1 FROM saved_opportunities WHERE user_id = @u AND opportunity_id = @o)
         INSERT INTO saved_opportunities (user_id, opportunity_id) VALUES (@u, @o)`,
      { u: req.auth.id, o: req.valid.params.id },
    );
    res.status(204).end();
  },
);

myOpportunitiesRouter.delete(
  '/saved-opportunities/:id',
  validate({ params: idParam }),
  async (req, res) => {
    await query('DELETE FROM saved_opportunities WHERE user_id = @u AND opportunity_id = @o', {
      u: req.auth.id,
      o: req.valid.params.id,
    });
    res.status(204).end();
  },
);

myOpportunitiesRouter.get('/completed-works', async (req, res) => {
  const list = await rows('SELECT * FROM completed_works WHERE user_id = @u ORDER BY id', {
    u: req.auth.id,
  });
  res.json(
    list.map((w) => ({
      title: w.title,
      organization: w.organization,
      period: w.period,
      description: w.description,
      rating: Number(w.rating),
      review: w.review,
      rubro: w.rubro,
      skills: parseJson(w.skills, []),
    })),
  );
});

// Lado de la empresa: quién postuló a lo que publicó.
export const employerRouter = Router();
employerRouter.use(requireAuth('user'));

async function ownedApplication(id, userId) {
  const row = await one(
    `SELECT a.*, o.owner_user_id FROM applications a
     JOIN opportunities o ON o.id = a.opportunity_id WHERE a.id = @id`,
    { id },
  );
  if (!row) throw notFound('La postulación no existe.');
  if (row.owner_user_id !== userId) throw forbidden('Esta postulación no es de tus vacantes.');
  return row;
}

async function withNotes(list) {
  const notes = await repo.notesFor(list.map((a) => a.id));
  return list.map((a) => repo.toApplicant(a, notes.get(a.id)));
}

employerRouter.get('/applicants', async (req, res) => {
  const list = await rows(
    `SELECT a.* FROM applications a JOIN opportunities o ON o.id = a.opportunity_id
     WHERE o.owner_user_id = @u ORDER BY a.applied_at DESC`,
    { u: req.auth.id },
  );
  res.json(await withNotes(list));
});

employerRouter.patch(
  '/applicants/:id',
  validate({ params: idParam, body: z.object({ status: z.enum(repo.APPLICATION_STATUSES) }) }),
  async (req, res) => {
    const row = await ownedApplication(req.valid.params.id, req.auth.id);
    await query(
      'UPDATE applications SET status = @status, updated_at = SYSUTCDATETIME() WHERE id = @id',
      { id: row.id, status: req.valid.body.status },
    );
    const [applicant] = await withNotes([{ ...row, status: req.valid.body.status }]);
    res.json(applicant);
  },
);

employerRouter.post(
  '/applicants/:id/notes',
  validate({ params: idParam, body: z.object({ text: text(2000).min(1, 'Escribe la nota.') }) }),
  async (req, res) => {
    const row = await ownedApplication(req.valid.params.id, req.auth.id);
    const me = await users.findById(req.auth.id);
    await repo.insertNote({
      id: newId(),
      applicationId: row.id,
      author: me.name,
      text: req.valid.body.text,
    });
    const [applicant] = await withNotes([row]);
    res.status(201).json(applicant);
  },
);
