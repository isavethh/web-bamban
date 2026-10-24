import { sql, one, rows, query } from '../../db/pool.js';
import { parseJson } from '../../lib/text.js';

export const OPPORTUNITY_TYPES = ['trabajo', 'pasantia', 'beca', 'curso', 'evento', 'competencia'];
export const PUBLISHER_TYPES = ['empresa', 'universidad', 'profesional', 'organizacion'];
export const APPLICATION_STATUSES = [
  'enviada',
  'enRevision',
  'entrevista',
  'aceptada',
  'rechazada',
];

const iso = (d) => (d ? new Date(d).toISOString() : null);

export function toOpportunity(r) {
  return {
    id: r.id,
    ownerId: r.owner_user_id,
    type: r.type,
    title: r.title,
    organization: r.organization,
    publisherType: r.publisher_type,
    rubro: r.rubro,
    city: r.city,
    modality: r.modality,
    description: r.description,
    deadline: iso(r.deadline),
    requirements: parseJson(r.requirements, []),
    benefits: parseJson(r.benefits, []),
    tags: parseJson(r.tags, []),
    compensation: r.compensation,
    duration: r.duration,
    startDate: iso(r.start_date),
    spots: r.spots,
    contact: r.contact,
    publishedBy: r.published_by,
    isFeatured: Boolean(r.is_featured),
    publishedAt: iso(r.published_at),
  };
}

export const listOpportunities = () =>
  rows('SELECT * FROM opportunities ORDER BY is_featured DESC, published_at DESC');

export const findOpportunity = (id, executor) =>
  one('SELECT * FROM opportunities WHERE id = @id', { id }, executor);

export async function insertOpportunity(o, executor) {
  const json = (v) => [sql.NVarChar(sql.MAX), JSON.stringify(v ?? [])];
  await query(
    `INSERT INTO opportunities (id, owner_user_id, type, title, organization, publisher_type,
       rubro, city, modality, description, deadline, requirements, benefits, tags, compensation,
       duration, start_date, spots, contact, published_by, is_featured, published_at)
     VALUES (@id, @ownerId, @type, @title, @organization, @publisherType, @rubro, @city,
       @modality, @description, @deadline, @requirements, @benefits, @tags, @compensation,
       @duration, @startDate, @spots, @contact, @publishedBy, @isFeatured,
       COALESCE(@publishedAt, SYSUTCDATETIME()))`,
    {
      id: o.id,
      ownerId: o.ownerId ?? null,
      type: o.type,
      title: o.title,
      organization: o.organization,
      publisherType: o.publisherType,
      rubro: o.rubro,
      city: o.city,
      modality: o.modality,
      description: [sql.NVarChar(4000), o.description],
      deadline: [sql.DateTime2(3), new Date(o.deadline)],
      requirements: json(o.requirements),
      benefits: json(o.benefits),
      tags: json(o.tags),
      compensation: o.compensation ?? null,
      duration: o.duration ?? null,
      startDate: [sql.DateTime2(3), o.startDate ? new Date(o.startDate) : null],
      spots: [sql.Int, o.spots ?? null],
      contact: o.contact ?? null,
      publishedBy: o.publishedBy ?? null,
      isFeatured: [sql.Bit, Boolean(o.isFeatured)],
      publishedAt: [sql.DateTime2(3), o.publishedAt ? new Date(o.publishedAt) : null],
    },
    executor,
  );
}

export function toApplicant(r, notes = []) {
  return {
    id: r.id,
    opportunityId: r.opportunity_id,
    applicantId: r.applicant_user_id,
    name: r.name,
    headline: r.headline,
    city: r.city,
    phone: r.phone,
    email: r.email,
    appliedAt: iso(r.applied_at),
    cv: parseJson(r.cv, {}),
    status: r.status,
    message: r.message,
    photoBase64: r.photo,
    sentCv: Boolean(r.sent_cv),
    cvFileName: r.cv_file_name,
    notes: notes.map((n) => ({ author: n.author, text: n.text, at: iso(n.created_at) })),
  };
}

export async function insertApplication(a, executor) {
  await query(
    `INSERT INTO applications (id, opportunity_id, applicant_user_id, status, message,
       cv_file_name, sent_cv, cv, name, headline, city, phone, email, photo, applied_at)
     VALUES (@id, @opportunityId, @applicantId, @status, @message, @cvFileName, @sentCv, @cv,
       @name, @headline, @city, @phone, @email, @photo, COALESCE(@appliedAt, SYSUTCDATETIME()))`,
    {
      id: a.id,
      opportunityId: a.opportunityId,
      applicantId: a.applicantId ?? null,
      status: a.status ?? 'enviada',
      message: [sql.NVarChar(2000), a.message ?? null],
      cvFileName: a.cvFileName ?? null,
      sentCv: [sql.Bit, Boolean(a.sentCv)],
      cv: [sql.NVarChar(sql.MAX), JSON.stringify(a.cv ?? {})],
      name: a.name,
      headline: a.headline ?? '',
      city: a.city ?? '',
      phone: a.phone ?? '',
      email: a.email ?? '',
      photo: [sql.NVarChar(sql.MAX), a.photoBase64 ?? null],
      appliedAt: [sql.DateTime2(3), a.appliedAt ? new Date(a.appliedAt) : null],
    },
    executor,
  );
}

export async function insertNote(n, executor) {
  await query(
    `INSERT INTO application_notes (id, application_id, author, text, created_at)
     VALUES (@id, @applicationId, @author, @text, COALESCE(@at, SYSUTCDATETIME()))`,
    {
      id: n.id,
      applicationId: n.applicationId,
      author: n.author,
      text: [sql.NVarChar(2000), n.text],
      at: [sql.DateTime2(3), n.at ? new Date(n.at) : null],
    },
    executor,
  );
}

/** Notas agrupadas por postulación. */
export async function notesFor(applicationIds) {
  const byApp = new Map(applicationIds.map((id) => [id, []]));
  if (!applicationIds.length) return byApp;
  const list = await rows(
    `SELECT n.* FROM application_notes n
     WHERE n.application_id IN (SELECT value FROM OPENJSON(@ids))
     ORDER BY n.created_at`,
    { ids: [sql.NVarChar(sql.MAX), JSON.stringify(applicationIds)] },
  );
  for (const n of list) byApp.get(n.application_id)?.push(n);
  return byApp;
}
