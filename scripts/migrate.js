// Crea la base de datos si falta y aplica las migraciones pendientes.
//   npm run db:migrate
import { ensureDatabase, explainLoginError, migrate } from '../src/db/migrate.js';
import { closePool } from '../src/db/pool.js';

let access = { masterOk: false };
try {
  access = await ensureDatabase();
  await migrate();
  console.log('Base de datos al día.');
} catch (err) {
  console.error(err.message);
  const hint = explainLoginError(err, access);
  if (hint) console.error(hint);
  process.exitCode = 1;
} finally {
  await closePool();
}
