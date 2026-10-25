import { badRequest } from '../lib/errors.js';

/**
 * Valida `req.body` / `req.query` / `req.params` con esquemas zod y deja el
 * resultado ya limpio en `req.valid`.
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const parsed = schemas[part].safeParse(req[part] ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue.path.join('.');
      return next(
        badRequest(
          field ? `Dato inválido en «${field}»: ${issue.message}` : issue.message,
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        ),
      );
    }
    req.valid[part] = parsed.data;
  }
  next();
};
