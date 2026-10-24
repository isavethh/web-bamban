// Prepara una base de datos de pruebas real (SQL Server) y la app Express.
//
// Usa las variables DB_* del entorno (o de .env.test) con una base aparte,
// `tucan_test` por defecto, que se vacía al empezar cada archivo de pruebas.
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'tucan_test';
process.env.JWT_SECRET ??= 'test-secret-que-solo-sirve-para-las-pruebas-0123456789';
process.env.DEMO_LOGIN_ENABLED ??= 'true';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';
delete process.env.OPENAI_API_KEY;

const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const { ensureDatabase, migrate } = await import('../src/db/migrate.js');
const { closePool, query } = await import('../src/db/pool.js');
const { seedDemo } = await import('../src/db/seed/seed.js');
const { loadDirectory } = await import('../src/modules/directory/load-directory.js');

const TABLES = [
  'labor_favorites',
  'labor_companies',
  'post_comments',
  'post_likes',
  'posts',
  'stores',
  'store_owners',
  'saved_opportunities',
  'application_notes',
  'applications',
  'opportunities',
  'completed_works',
  'cvs',
  'users',
];

export const SAMPLE_COMPANIES = [
  {
    id: 'labor_1',
    name: 'MINERA POTOSÍ S.A.',
    department: 'Potosí',
    sector: 'Minería',
    activity: 'Explotación de estaño',
    address: 'Calle Bolívar 10',
    phone: '2 6221234',
    email: 'info@minera.bo',
    sourceSheet: 'MINERIA POTOSI',
    sourceRow: 5,
  },
  {
    id: 'labor_2',
    name: 'CONSTRUCTORA ANDINA',
    department: 'La Paz',
    sector: 'Construcción',
    activity: 'Obras civiles',
    address: 'Av. Arce 100',
    phone: '',
    email: '',
    sourceSheet: 'CONSTRUCTORA LA PAZ',
    sourceRow: 8,
  },
];

/** Base vacía + migraciones + datos demo + un directorio pequeño. */
export async function resetDatabase() {
  await ensureDatabase(process.env.DB_NAME);
  await migrate({ log: () => {} });
  for (const t of TABLES) await query(`DELETE FROM ${t}`);
  await seedDemo({ log: () => {} });
  await loadDirectory(SAMPLE_COMPANIES);
}

export const app = createApp();
export const api = () => request(app);
export { closePool };

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Registra una cuenta nueva y devuelve `{ token, user, auth }`. */
export async function registerUser(overrides = {}) {
  const res = await api()
    .post('/api/auth/register')
    .send({
      name: 'Persona de prueba',
      email: `prueba-${unique()}@correo.bo`,
      password: 'secreto123',
      role: 'seeker',
      ...overrides,
    })
    .expect(201);
  return { ...res.body, auth: { Authorization: `Bearer ${res.body.token}` } };
}

export async function demoLogin(role) {
  const res = await api().post('/api/auth/demo').send({ role }).expect(200);
  return { ...res.body, auth: { Authorization: `Bearer ${res.body.token}` } };
}

export async function registerOwner(storeName = 'Mi Tienda de Prueba') {
  const res = await api()
    .post('/api/owners/register')
    .send({ username: `dueno${unique()}`, password: 'secreto123', store: { name: storeName } })
    .expect(201);
  return { ...res.body, auth: { Authorization: `Bearer ${res.body.token}` } };
}
