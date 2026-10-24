// Crea la base de datos si falta y aplica las migraciones pendientes.
//   npm run db:migrate
import { ensureDatabase, migrate } from '../src/db/migrate.js';
import { closePool } from '../src/db/pool.js';

try {
  await ensureDatabase();
  await migrate();
  console.log('Base de datos al día.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
