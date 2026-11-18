// Prepara una base de datos de pruebas real (PostgreSQL) y la app Express.
//
// Usa TEST_DATABASE_URL (del entorno o de .env.test): una base aparte que se
// vacía al empezar cada archivo de pruebas. Nunca se usa DATABASE_URL, para
// no borrar por accidente la base de desarrollo.
process.env.NODE_ENV = 'test';
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Define TEST_DATABASE_URL (por ejemplo en .env.test) para correr las pruebas.');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DB_SSL ??= 'false';
process.env.JWT_SECRET ??= 'test-secret-que-solo-sirve-para-las-pruebas-0123456789';
process.env.DEMO_LOGIN_ENABLED ??= 'true';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';
delete process.env.OPENAI_API_KEY;

const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const { migrate } = await import('../src/db/migrate.js');
const { closePool, query } = await import('../src/db/pool.js');
const { seedDemo } = await import('../src/db/seed/seed.js');
const { loadDirectory } = await import('../src/modules/directory/load-directory.js');

const TABLES = [
  'inquiries',
  'promotions',
  'offerings',
  'business_profiles',
  'labor_favorites',
  'labor_companies',
  'post_comments',
  'post_likes',
  'posts',
  'stores',
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
  await migrate({ log: () => {} });
  await query(`TRUNCATE ${TABLES.join(', ')}`);
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
      ...(overrides.role === 'employer' && { businessSector: 'empresarial', businessType: 'pyme' }),
      ...overrides,
    })
    .expect(201);
  return { ...res.body, auth: { Authorization: `Bearer ${res.body.token}` } };
}

export async function demoLogin(role) {
  const res = await api().post('/api/auth/demo').send({ role }).expect(200);
  return { ...res.body, auth: { Authorization: `Bearer ${res.body.token}` } };
}

/** Profesional con un emprendimiento recién creado. */
export async function registerOwner(storeName = 'Mi Tienda de Prueba') {
  const pro = await registerUser({ name: 'Emprendedora de prueba' });
  const store = await api()
    .post('/api/me/stores')
    .set(pro.auth)
    .send({ name: storeName })
    .expect(201);
  return { ...pro, stores: [store.body] };
}
