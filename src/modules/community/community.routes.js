import { Router } from 'express';
import { z } from 'zod';
import { sql, one, rows, query } from '../../db/pool.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { newId, parseJson } from '../../lib/text.js';
import * as users from '../users/users.repo.js';
import * as stores from '../stores/stores.repo.js';

const KINDS = ['seeking', 'achievement', 'offering', 'news'];
const body = (max) =>
  z
    .string()
    .trim()
    .min(1, 'Escribe un mensaje.')
    .max(max, `El mensaje supera los ${max} caracteres.`);
const asStore = z.string().max(64).optional();
const idParam = z.object({ id: z.string().min(1).max(64) });

/**
 * Quién actúa: la persona con sesión o, si es un emprendedor, una de sus
 * tiendas (`asStoreId`). Devuelve la identidad con la forma de `FeedIdentity`.
 */
async function actor(req, asStoreId) {
  if (req.auth.kind === 'user') {
    const u = await users.findById(req.auth.id);
    if (!u) throw forbidden('Tu cuenta ya no existe.');
    const employer = u.role === 'employer';
    return {
      id: u.id,
      name: employer ? (u.company_name ?? u.name) : u.name,
      role: employer ? 'Empresa' : 'Profesional / técnico',
      city: u.city ?? '',
      subtitle: u.specialty ?? u.career ?? '',
      photoBase64: u.photo,
    };
  }
  if (!asStoreId) throw badRequest('Indica con qué emprendimiento publicas.');
  const store = await stores.findById(asStoreId);
  if (!store || store.owner_id !== req.auth.id) {
    throw forbidden('Este emprendimiento pertenece a otra cuenta.');
  }
  return {
    id: `store:${store.id}`,
    name: store.name,
    role: 'Emprendimiento',
    city: store.city ?? '',
    subtitle: store.category,
    photoBase64: null,
  };
}

async function loadPosts(where = '', params = {}) {
  const posts = await rows(
    `SELECT TOP (200) * FROM posts ${where} ORDER BY created_at DESC`,
    params,
  );
  if (!posts.length) return [];
  const ids = { ids: [sql.NVarChar(sql.MAX), JSON.stringify(posts.map((p) => p.id))] };
  const inIds = 'IN (SELECT value FROM OPENJSON(@ids))';
  const [likes, comments] = await Promise.all([
    rows(`SELECT post_id, actor_id FROM post_likes WHERE post_id ${inIds}`, ids),
    rows(`SELECT * FROM post_comments WHERE post_id ${inIds} ORDER BY created_at`, ids),
  ]);
  return posts.map((p) => ({
    id: p.id,
    author: parseJson(p.author, {}),
    kind: p.kind,
    body: p.body,
    createdAt: new Date(p.created_at).toISOString(),
    likedBy: likes.filter((l) => l.post_id === p.id).map((l) => l.actor_id),
    comments: comments
      .filter((c) => c.post_id === p.id)
      .map((c) => ({
        id: c.id,
        author: parseJson(c.author, {}),
        body: c.body,
        createdAt: new Date(c.created_at).toISOString(),
      })),
  }));
}

async function loadPost(id) {
  const [post] = await loadPosts('WHERE id = @id', { id });
  if (!post) throw notFound('La publicación ya no está disponible.');
  return post;
}

export async function insertPost(p, executor) {
  await query(
    `INSERT INTO posts (id, author_id, author, kind, body, created_at)
     VALUES (@id, @authorId, @author, @kind, @body, COALESCE(@createdAt, SYSUTCDATETIME()))`,
    {
      id: p.id,
      authorId: p.author.id,
      author: [sql.NVarChar(sql.MAX), JSON.stringify(p.author)],
      kind: p.kind,
      body: [sql.NVarChar(3000), p.body],
      createdAt: [sql.DateTime2(3), p.createdAt ? new Date(p.createdAt) : null],
    },
    executor,
  );
}

async function ownPost(req, asStoreId) {
  const me = await actor(req, asStoreId);
  const post = await one('SELECT id, author_id FROM posts WHERE id = @id', {
    id: req.valid.params.id,
  });
  if (!post) throw notFound('La publicación ya no está disponible.');
  return { me, post };
}

export const postsRouter = Router();

postsRouter.get('/', async (_req, res) => {
  res.json(await loadPosts());
});

postsRouter.post(
  '/',
  requireAuth('user', 'owner'),
  validate({ body: z.object({ kind: z.enum(KINDS), body: body(3000), asStoreId: asStore }) }),
  async (req, res) => {
    const author = await actor(req, req.valid.body.asStoreId);
    const id = newId();
    await insertPost({ id, author, kind: req.valid.body.kind, body: req.valid.body.body });
    res.status(201).json(await loadPost(id));
  },
);

postsRouter.patch(
  '/:id',
  requireAuth('user', 'owner'),
  validate({ params: idParam, body: z.object({ body: body(3000), asStoreId: asStore }) }),
  async (req, res) => {
    const { me, post } = await ownPost(req, req.valid.body.asStoreId);
    if (post.author_id !== me.id) throw forbidden('Solo puedes editar tus publicaciones.');
    await query('UPDATE posts SET body = @body, updated_at = SYSUTCDATETIME() WHERE id = @id', {
      id: post.id,
      body: [sql.NVarChar(3000), req.valid.body.body],
    });
    res.json(await loadPost(post.id));
  },
);

postsRouter.delete(
  '/:id',
  requireAuth('user', 'owner'),
  validate({ params: idParam, query: z.object({ asStoreId: asStore }) }),
  async (req, res) => {
    const { me, post } = await ownPost(req, req.valid.query.asStoreId);
    if (post.author_id !== me.id) throw forbidden('Solo puedes eliminar tus publicaciones.');
    await query('DELETE FROM posts WHERE id = @id', { id: post.id });
    res.status(204).end();
  },
);

postsRouter.post(
  '/:id/likes',
  requireAuth('user', 'owner'),
  validate({ params: idParam, body: z.object({ asStoreId: asStore }) }),
  async (req, res) => {
    const { me, post } = await ownPost(req, req.valid.body.asStoreId);
    // Alterna: si ya reaccionó se quita, si no se agrega.
    await query(
      `IF EXISTS (SELECT 1 FROM post_likes WHERE post_id = @p AND actor_id = @a)
         DELETE FROM post_likes WHERE post_id = @p AND actor_id = @a
       ELSE
         INSERT INTO post_likes (post_id, actor_id) VALUES (@p, @a)`,
      { p: post.id, a: me.id },
    );
    res.json(await loadPost(post.id));
  },
);

postsRouter.post(
  '/:id/comments',
  requireAuth('user', 'owner'),
  validate({ params: idParam, body: z.object({ body: body(1000), asStoreId: asStore }) }),
  async (req, res) => {
    const { me, post } = await ownPost(req, req.valid.body.asStoreId);
    await query(
      `INSERT INTO post_comments (id, post_id, author_id, author, body)
       VALUES (@id, @postId, @authorId, @author, @body)`,
      {
        id: newId(),
        postId: post.id,
        authorId: me.id,
        author: [sql.NVarChar(sql.MAX), JSON.stringify(me)],
        body: [sql.NVarChar(1000), req.valid.body.body],
      },
    );
    res.status(201).json(await loadPost(post.id));
  },
);
