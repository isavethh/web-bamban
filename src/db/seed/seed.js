import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { one, query, sql, transaction } from '../pool.js';
import { hashPassword } from '../../lib/security.js';
import { newId } from '../../lib/text.js';
import * as users from '../../modules/users/users.repo.js';
import * as opps from '../../modules/opportunities/opportunities.repo.js';
import * as stores from '../../modules/stores/stores.repo.js';
import * as business from '../../modules/business/business.repo.js';
import { insertPost } from '../../modules/community/community.routes.js';

const DAY = 24 * 60 * 60 * 1000;
const fromNow = (days) => (days === undefined ? null : new Date(Date.now() + days * DAY));

// Quién publicó cada oportunidad que lleva nombre de persona.
const PUBLISHERS = {
  'María Fernanda Quispe': 'demo_professional',
  'Patricia Suárez': 'sample_provider_2',
  'Carlos Mamani Rojas': 'sample_seeker_2',
  'Andrea Flores Vargas': 'sample_seeker_3',
};

const exists = async (table, id, tx) =>
  Boolean(await one(`SELECT 1 AS ok FROM ${table} WHERE id = @id`, { id }, tx));

/**
 * Carga los datos de demostración. Es idempotente: lo que ya existe (por id)
 * no se vuelve a insertar, así que se puede ejecutar en cada despliegue.
 *
 * Las cuentas demo reciben una contraseña aleatoria que nadie conoce: solo se
 * entra a ellas con el ingreso de demostración (DEMO_LOGIN_ENABLED).
 */
export async function seedDemo({ log = console.log } = {}) {
  const data = JSON.parse(await readFile(new URL('./demo-data.json', import.meta.url), 'utf8'));
  const unusablePassword = await hashPassword(randomBytes(24).toString('hex'));
  const counts = {};
  const count = (k) => (counts[k] = (counts[k] ?? 0) + 1);

  await transaction(async (tx) => {
    const emails = new Set();
    for (const p of [...data.demoProfiles, ...data.sampleProfiles]) {
      // María aparece como demo y como ejemplo con el mismo correo: gana la demo.
      if (emails.has(p.email)) continue;
      emails.add(p.email);
      if (await exists('users', p.id, tx)) continue;
      await users.insertUser({ ...p, passwordHash: unusablePassword, isDemo: true }, tx);
      count('users');
    }

    const employerOpps = data.employerOpportunities.map((o) => ({ ...o, owner: 'demo_employer' }));
    for (const o of [...data.opportunities, ...employerOpps]) {
      if (await exists('opportunities', o.id, tx)) continue;
      await opps.insertOpportunity(
        {
          ...o,
          ownerId: o.owner ?? PUBLISHERS[o.publishedBy] ?? null,
          deadline: fromNow(o.deadlineInDays),
          startDate: fromNow(o.startInDays),
          publishedAt: fromNow(o.publishedInDays),
        },
        tx,
      );
      count('opportunities');
    }

    // Postulaciones de la profesional demo (lo que ve en «Mis postulaciones»).
    const maria = data.demoProfiles.find((p) => p.id === 'demo_professional');
    for (const a of data.applications) {
      const id = `demo_app_${a.opportunityId}`;
      if (await exists('applications', id, tx)) continue;
      await opps.insertApplication(
        {
          id,
          opportunityId: a.opportunityId,
          applicantId: maria.id,
          status: a.status,
          message: a.note,
          cv: {
            fullName: maria.name,
            email: maria.email,
            phone: maria.phoneIntl,
            city: maria.city,
          },
          name: maria.name,
          headline: maria.specialty,
          city: maria.city,
          phone: maria.phoneIntl,
          email: maria.email,
          appliedAt: fromNow(a.appliedInDays),
        },
        tx,
      );
      count('applications');
    }

    // Postulantes que recibe la empresa demo.
    for (const a of data.applicants) {
      const id = `demo_applicant_${a.id}`;
      if (await exists('applications', id, tx)) continue;
      await opps.insertApplication({ ...a, id, appliedAt: fromNow(a.appliedInDays) }, tx);
      for (const [i, n] of a.notes.entries()) {
        await opps.insertNote(
          { id: `${id}_note_${i}`, applicationId: id, ...n, at: fromNow(n.atInDays) },
          tx,
        );
      }
      count('applications');
    }

    for (const [i, w] of data.completedWorks.entries()) {
      const id = `demo_work_${i + 1}`;
      if (await exists('completed_works', id, tx)) continue;
      await query(
        `INSERT INTO completed_works (id, user_id, title, organization, period, description,
           rating, review, rubro, skills)
         VALUES (@id, @userId, @title, @organization, @period, @description, @rating, @review,
           @rubro, @skills)`,
        {
          id,
          userId: maria.id,
          ...w,
          rating: [sql.Decimal(3, 2), w.rating],
          skills: [sql.NVarChar(sql.MAX), JSON.stringify(w.skills ?? [])],
        },
        tx,
      );
      count('completedWorks');
    }

    for (const opportunityId of data.savedOpportunityIds) {
      await query(
        `IF NOT EXISTS (SELECT 1 FROM saved_opportunities WHERE user_id = @u AND opportunity_id = @o)
           INSERT INTO saved_opportunities (user_id, opportunity_id) VALUES (@u, @o)`,
        { u: maria.id, o: opportunityId },
        tx,
      );
    }

    // Cada tienda es de un profesional: se crea su cuenta si falta.
    const ownerId = (username) => `demo_owner_${username}`;
    for (const s of data.stores) {
      if (await exists('stores', s.id, tx)) continue;
      if (!(await exists('users', ownerId(s.ownerId), tx))) {
        await users.insertUser(
          {
            id: ownerId(s.ownerId),
            email: `${s.ownerId}@emprendedores.tucan.bo`,
            passwordHash: unusablePassword,
            role: 'seeker',
            name: s.ownerName,
            phoneIntl: s.phone,
            city: s.city,
            department: s.department,
            province: s.province,
            specialty: s.category,
            serviceCategories: data.storeOwnerCategories[s.ownerId] ?? null,
            isDemo: true,
          },
          tx,
        );
      }
      await stores.insertStore(
        {
          ...s,
          ownerId: ownerId(s.ownerId),
          slug: s.publicSlug ?? (await stores.freeSlug(s.name, tx)),
          createdAt: fromNow(s.createdInDays),
        },
        tx,
      );
      count('stores');
    }

    // Empresa demo (AndinaTech): rubro y perfil de negocio.
    const { userId: demoEmployerId, ...demoBusiness } = data.demoBusiness;
    if (!(await business.findBusiness(demoEmployerId, tx))) {
      await business.upsertBusiness(demoEmployerId, demoBusiness, tx);
    }

    const addOfferings = async (owner, list) => {
      for (const [i, o] of list.entries()) {
        const id = `${owner.id}_offering_${i + 1}`;
        if (await exists('offerings', id, tx)) continue;
        await business.insertOffering(
          id,
          owner.id,
          {
            department: owner.department,
            province: owner.province,
            city: owner.city,
            sortOrder: i,
            ...o,
          },
          tx,
        );
        count('offerings');
      }
    };
    const addPromotions = async (owner, list) => {
      for (const [i, p] of list.entries()) {
        const id = `${owner.id}_promotion_${i + 1}`;
        if (await exists('promotions', id, tx)) continue;
        const { validInDays, ...promo } = p;
        await business.insertPromotion(
          id,
          owner.id,
          {
            department: owner.department,
            province: owner.province,
            city: owner.city,
            validUntil: fromNow(validInDays)?.toISOString().slice(0, 10),
            ...promo,
          },
          tx,
        );
        count('promotions');
      }
    };

    // Negocios de turismo, hospedaje y gastronomía.
    for (const b of data.businesses) {
      const { offerings, promotions, rating, ...profile } = b;
      if (!(await exists('users', b.id, tx))) {
        await users.insertUser(
          {
            id: b.id,
            email: b.email,
            passwordHash: unusablePassword,
            role: 'employer',
            name: b.name,
            companyName: b.companyName,
            phoneIntl: b.phone,
            city: b.city,
            department: b.department,
            province: b.province,
            summary: b.description,
            rating,
            isEmployerVerified: true,
            isDemo: true,
          },
          tx,
        );
        count('users');
      }
      if (!(await business.findBusiness(b.id, tx)))
        await business.upsertBusiness(b.id, profile, tx);
      await addOfferings(b, offerings);
      await addPromotions(b, promotions);
    }

    // Profesionales que ofrecen tours y talleres.
    for (const { profile, offerings } of data.tourismProfessionals) {
      if (!(await exists('users', profile.id, tx))) {
        await users.insertUser({ ...profile, passwordHash: unusablePassword, isDemo: true }, tx);
        count('users');
      }
      await addOfferings(profile, offerings);
    }
    for (const [username, list] of Object.entries(data.storeOwnerOfferings)) {
      const owner = await users.findById(ownerId(username), tx);
      if (owner) await addOfferings(owner, list);
    }
    for (const [i, p] of data.storePromotions.entries()) {
      const store = await stores.findById(p.storeId, tx);
      if (!store) continue;
      const id = `demo_store_promotion_${i + 1}`;
      if (await exists('promotions', id, tx)) continue;
      const { validInDays, ...promo } = p;
      await business.insertPromotion(
        id,
        store.owner_user_id,
        {
          department: store.department,
          province: store.province,
          city: store.city,
          validUntil: fromNow(validInDays)?.toISOString().slice(0, 10),
          ...promo,
        },
        tx,
      );
      count('promotions');
    }

    // Consultas de la turista demo.
    for (const q of data.inquiries) {
      if (await exists('inquiries', q.id, tx)) continue;
      await business.insertInquiry(
        {
          id: q.id,
          fromUserId: q.from,
          toUserId: q.to,
          offeringId: `${q.to}_offering_${q.offering + 1}`,
          message: q.message,
          travelDate: fromNow(q.travelInDays)?.toISOString().slice(0, 10),
          people: q.people,
          status: q.reply ? 'respondida' : 'nueva',
          reply: q.reply,
          repliedAt: fromNow(q.repliedInDays),
          createdAt: fromNow(q.createdInDays),
        },
        tx,
      );
      count('inquiries');
    }

    for (const p of data.posts) {
      if (await exists('posts', p.id, tx)) continue;
      await insertPost(
        { ...p, createdAt: new Date(Date.now() + p.createdInHours * 3_600_000) },
        tx,
      );
      for (const c of p.comments ?? []) {
        await query(
          `INSERT INTO post_comments (id, post_id, author_id, author, body)
           VALUES (@id, @postId, @authorId, @author, @body)`,
          {
            id: c.id ?? newId(),
            postId: p.id,
            authorId: c.author.id,
            author: [sql.NVarChar(sql.MAX), JSON.stringify(c.author)],
            body: c.body,
          },
          tx,
        );
      }
      count('posts');
    }
  });

  log(`seed demo: ${JSON.stringify(counts)}`);
  return counts;
}
