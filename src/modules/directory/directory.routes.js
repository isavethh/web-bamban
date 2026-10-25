import { Router } from 'express';
import { z } from 'zod';
import { one, rows, query } from '../../db/pool.js';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { notFound, unauthorized } from '../../lib/errors.js';
import { likeEscape, searchWords } from '../../lib/text.js';

const toCompany = (r) => ({
  id: r.id,
  name: r.name,
  department: r.department,
  sector: r.sector,
  activity: r.activity,
  address: r.address,
  phone: r.phone,
  email: r.email,
  sourceSheet: r.source_sheet,
  sourceRow: r.source_row,
});

const listQuery = z.object({
  q: z.string().max(200).default(''),
  department: z.string().max(40).optional(),
  sector: z.string().max(60).optional(),
  favorites: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const directoryRouter = Router();

directoryRouter.get('/facets', async (_req, res) => {
  const [departments, sectors, total] = await Promise.all([
    rows('SELECT DISTINCT department FROM labor_companies ORDER BY department'),
    rows('SELECT DISTINCT sector FROM labor_companies ORDER BY sector'),
    one('SELECT COUNT(*) AS n FROM labor_companies'),
  ]);
  res.json({
    count: total.n,
    departments: departments.map((r) => r.department),
    sectors: sectors.map((r) => r.sector),
  });
});

directoryRouter.get(
  '/companies',
  optionalAuth,
  validate({ query: listQuery }),
  async (req, res) => {
    const { q, department, sector, favorites, page, pageSize } = req.valid.query;
    if (favorites && req.auth?.kind !== 'user') throw unauthorized();

    const where = [];
    const params = {};
    if (department) {
      where.push('c.department = @department');
      params.department = department;
    }
    if (sector) {
      where.push('c.sector = @sector');
      params.sector = sector;
    }
    if (favorites) {
      where.push(
        'EXISTS (SELECT 1 FROM labor_favorites f WHERE f.company_id = c.id AND f.user_id = @userId)',
      );
      params.userId = req.auth.id;
    }
    searchWords(q)
      .slice(0, 8)
      .forEach((word, i) => {
        where.push(`c.search_text LIKE @w${i}`);
        params[`w${i}`] = `%${likeEscape(word)}%`;
      });
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [count, items] = await Promise.all([
      one(`SELECT COUNT(*) AS n FROM labor_companies c ${clause}`, params),
      rows(
        `SELECT c.* FROM labor_companies c ${clause}
         ORDER BY c.name, c.id OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
        { ...params, offset: (page - 1) * pageSize, pageSize },
      ),
    ]);
    res.json({ items: items.map(toCompany), total: count.n, page, pageSize });
  },
);

directoryRouter.get('/companies/:id', async (req, res) => {
  const row = await one('SELECT * FROM labor_companies WHERE id = @id', { id: req.params.id });
  if (!row) throw notFound('Empresa no encontrada.');
  res.json(toCompany(row));
});

const favorites = Router();
favorites.use(requireAuth('user'));
const idParam = z.object({ id: z.string().min(1).max(40) });

favorites.get('/', async (req, res) => {
  const list = await rows('SELECT company_id FROM labor_favorites WHERE user_id = @u', {
    u: req.auth.id,
  });
  res.json(list.map((r) => r.company_id));
});

favorites.put('/:id', validate({ params: idParam }), async (req, res) => {
  const exists = await one('SELECT 1 AS ok FROM labor_companies WHERE id = @id', {
    id: req.valid.params.id,
  });
  if (!exists) throw notFound('Empresa no encontrada.');
  await query(
    `IF NOT EXISTS (SELECT 1 FROM labor_favorites WHERE user_id = @u AND company_id = @c)
       INSERT INTO labor_favorites (user_id, company_id) VALUES (@u, @c)`,
    { u: req.auth.id, c: req.valid.params.id },
  );
  res.status(204).end();
});

favorites.delete('/:id', validate({ params: idParam }), async (req, res) => {
  await query('DELETE FROM labor_favorites WHERE user_id = @u AND company_id = @c', {
    u: req.auth.id,
    c: req.valid.params.id,
  });
  res.status(204).end();
});

directoryRouter.use('/favorites', favorites);
