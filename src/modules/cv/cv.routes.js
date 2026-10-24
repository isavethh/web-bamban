import { Router } from 'express';
import { z } from 'zod';
import { sql, one, query } from '../../db/pool.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { notFound } from '../../lib/errors.js';
import { parseJson, slugify } from '../../lib/text.js';

const str = (max) => z.string().max(max).default('');
const strList = z.array(z.string().max(300)).max(60).default([]);

export const cvSchema = z.object({
  fullName: str(150),
  headline: str(200),
  summary: str(3000),
  email: str(254),
  phone: str(30),
  city: str(120),
  website: str(300),
  experiences: z
    .array(
      z.object({
        role: str(200),
        organization: str(200),
        period: str(100),
        description: str(2000),
        skills: strList,
        rating: z.number().min(0).max(5).nullish(),
        review: z.string().max(1000).nullish(),
      }),
    )
    .max(40)
    .default([]),
  education: z
    .array(
      z.object({ title: str(200), institution: str(200), period: str(100), detail: str(1000) }),
    )
    .max(30)
    .default([]),
  skills: strList,
  languages: strList,
  certificates: strList,
  accent: z.enum(['teal', 'grafito', 'naranja']).default('teal'),
});

/** Busca un slug libre: «maria-quispe», «maria-quispe-2»... */
async function freeSlug(base, userId) {
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await one('SELECT user_id FROM cvs WHERE slug = @slug', { slug });
    if (!taken || taken.user_id === userId) return slug;
  }
}

export const myCvRouter = Router();
myCvRouter.use(requireAuth('user'));

myCvRouter.get('/', async (req, res) => {
  const row = await one('SELECT slug, data FROM cvs WHERE user_id = @id', { id: req.auth.id });
  res.json(row ? { slug: row.slug, cv: parseJson(row.data, null) } : { slug: null, cv: null });
});

myCvRouter.put('/', validate({ body: z.object({ cv: cvSchema }) }), async (req, res) => {
  const { cv } = req.valid.body;
  const slug = await freeSlug(slugify(cv.fullName, 'mi-cv'), req.auth.id);
  await query(
    `MERGE cvs AS t
     USING (SELECT @userId AS user_id) AS s ON t.user_id = s.user_id
     WHEN MATCHED THEN UPDATE SET slug = @slug, data = @data, updated_at = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (user_id, slug, data) VALUES (@userId, @slug, @data);`,
    { userId: req.auth.id, slug, data: [sql.NVarChar(sql.MAX), JSON.stringify(cv)] },
  );
  res.json({ slug, cv });
});

export const publicCvRouter = Router();

publicCvRouter.get('/:slug', async (req, res) => {
  const row = await one(
    `SELECT c.slug, c.data FROM cvs c JOIN users u ON u.id = c.user_id
     WHERE c.slug = @slug AND u.is_profile_public = 1`,
    { slug: req.params.slug },
  );
  if (!row) throw notFound('Esta hoja de vida no existe o no es pública.');
  res.json({ slug: row.slug, cv: parseJson(row.data, null) });
});
