import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { closePool } from './helpers.js';
import { compile, getPool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';

before(async () => {
  await migrate({ log: () => {} });
});

after(closePool);

test('migrar dos veces no vuelve a aplicar nada', async () => {
  const applied = [];
  await migrate({ log: (line) => applied.push(line) });
  assert.deepEqual(applied, []);
  const { rows } = await getPool().query('SELECT name FROM schema_migrations ORDER BY name');
  assert.equal(rows[0].name, '001_initial_schema.sql');
});

test('el esquema rechaza JSON inválido y roles desconocidos', async () => {
  const insert = (role, details) =>
    getPool().query(
      `INSERT INTO users (id, email, password_hash, role, name, details)
       VALUES ('esquema_1', 'esquema@correo.bo', 'hash', $1, 'Prueba', $2)`,
      [role, details],
    );
  await assert.rejects(insert('seeker', '{no es json'));
  await assert.rejects(insert('admin', '{}'));
});

test('compile convierte @nombre en parámetros numerados y fija tipos', () => {
  const { text, values } = compile(
    "SELECT * FROM t WHERE a = @a AND (@b IS NULL OR b = @b) AND c = 'x@correo.bo' AND d = @a",
    { a: 1, b: ['text', null], sinUsar: 9 },
  );
  assert.equal(
    text,
    "SELECT * FROM t WHERE a = $1 AND ($2::text IS NULL OR b = $2::text) AND c = 'x@correo.bo' AND d = $1",
  );
  assert.deepEqual(values, [1, null]);
});
