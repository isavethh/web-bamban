import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { getPool } from './db/pool.js';
import { apiLimiter } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authRouter, meRouter, profilesRouter } from './modules/users/users.routes.js';
import { myCvRouter, publicCvRouter } from './modules/cv/cv.routes.js';
import {
  employerRouter,
  myOpportunitiesRouter,
  opportunitiesRouter,
} from './modules/opportunities/opportunities.routes.js';
import { ownersRouter, storesRouter } from './modules/stores/stores.routes.js';
import { postsRouter } from './modules/community/community.routes.js';
import { directoryRouter } from './modules/directory/directory.routes.js';
import { aiRouter, legacyAiRouter } from './modules/ai/ai.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Detrás del proxy de Render/Azure: la IP real viene en X-Forwarded-For.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86_400,
    }),
  );
  if (!env.isTest) app.use(pinoHttp({ logger }));
  // Fotos e imágenes de productos viajan en base64 dentro del JSON.
  app.use(express.json({ limit: '8mb' }));

  // Sirve para «despertar» la instancia gratuita de Render y para monitoreo.
  app.get('/', (_req, res) => res.json({ name: 'tucan-api', status: 'ok' }));
  app.get('/health', async (_req, res) => {
    try {
      await (await getPool()).request().query('SELECT 1');
      res.json({ status: 'ok', database: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  const api = express.Router();
  api.use(apiLimiter);
  api.use('/auth', authRouter);
  api.use('/me', meRouter);
  api.use('/me/cv', myCvRouter);
  api.use('/me', myOpportunitiesRouter);
  api.use('/profiles', profilesRouter);
  api.use('/cvs', publicCvRouter);
  api.use('/opportunities', opportunitiesRouter);
  api.use('/employer', employerRouter);
  api.use('/stores', storesRouter);
  api.use('/owners', ownersRouter);
  api.use('/posts', postsRouter);
  api.use('/directory', directoryRouter);
  api.use('/ai', aiRouter);
  api.use('/openai', legacyAiRouter);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
