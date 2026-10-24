import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { one, query, sql, transaction } from '../pool.js';
import { hashPassword } from '../../lib/security.js';
import { newId } from '../../lib/text.js';
import * as users from '../../modules/users/users.repo.js';
import * as opps from '../../modules/opportunities/opportunities.repo.js';
import * as stores from '../../modules/stores/stores.repo.js';
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

    for (const s of data.stores) {
      if (await exists('stores', s.id, tx)) continue;
      let owner = await stores.findOwnerByUsername(s.ownerId, tx);
      if (!owner) {
        owner = { id: `demo_owner_${s.ownerId}` };
        await stores.insertOwner(
          {
            id: owner.id,
            username: s.ownerId,
            passwordHash: unusablePassword,
            displayName: s.ownerName,
            isDemo: true,
          },
          tx,
        );
      }
      await stores.insertStore(
        {
          ...s,
          ownerId: owner.id,
          slug: s.publicSlug ?? (await stores.freeSlug(s.name, tx)),
          createdAt: fromNow(s.createdInDays),
        },
        tx,
      );
      count('stores');
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
