// Aplica las migraciones pendientes. La base ya debe existir (el proveedor
// la crea; en local, `docker compose up -d db`).
//   npm run db:migrate
import { explainConnectionError, migrate } from '../src/db/migrate.js';
import { closePool } from '../src/db/pool.js';

try {
  await migrate();
  console.log('Base de datos al día.');
} catch (err) {
  console.error(err.message);
  const hint = explainConnectionError(err);
  if (hint) console.error(hint);
  process.exitCode = 1;
} finally {
  await closePool();
}
