// Carga los datos de demostración (idempotente).
//   npm run db:seed
import { seedDemo } from '../src/db/seed/seed.js';
import { closePool } from '../src/db/pool.js';

try {
  await seedDemo();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await closePool();
}
