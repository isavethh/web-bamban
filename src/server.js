import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { closePool } from './db/pool.js';

const server = createApp().listen(env.PORT, () => {
  logger.info(`tucan-api escuchando en el puerto ${env.PORT} (${env.NODE_ENV})`);
});

// Apagado ordenado: deja terminar las peticiones en curso y cierra el pool.
function shutdown(signal) {
  logger.info(`${signal} recibido, cerrando...`);
  server.close(async () => {
    await closePool().catch((err) => logger.error({ err }, 'error al cerrar la base de datos'));
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
