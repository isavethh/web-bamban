import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { closePool } from './helpers.js';
import { connectionConfig, sql } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';

const NAME = 'tucan_migration_test';
let pool;

before(async () => {
  const master = await new sql.ConnectionPool(connectionConfig('master')).connect();
  await master.request().query(`
    IF DB_ID(N'${NAME}') IS NOT NULL
    BEGIN
      ALTER DATABASE [${NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
      DROP DATABASE [${NAME}];
    END
    CREATE DATABASE [${NAME}];`);
  await master.close();
  pool = await new sql.ConnectionPool(connectionConfig(NAME)).connect();
});

after(async () => {
  await pool?.close();
  await closePool();
});

test('la 002 convierte las cuentas de emprendedor en profesionales sin perder tiendas', async () => {
  await migrate({ pool, log: () => {}, until: '001_initial_schema.sql' });
  await pool.request().query(`
    INSERT INTO store_owners (id, username, password_hash, display_name)
      VALUES ('o1', 'marta', 'hash', 'Marta Rojas');
    INSERT INTO stores (id, owner_id, name, slug, category, city)
      VALUES ('s1', 'o1', 'Tortas Marta', 'tortas-marta', 'Repostería', 'Sucre');`);

  await migrate({ pool, log: () => {} });

  const user = (await pool.request().query("SELECT * FROM users WHERE id = 'o1'")).recordset[0];
  assert.equal(user.role, 'seeker');
  assert.equal(user.name, 'Marta Rojas');
  assert.equal(user.email, 'marta@emprendedores.tucan.bo');
  assert.equal(user.password_hash, 'hash', 'conserva la contraseña');
  assert.equal(user.city, 'Sucre');
  const store = (await pool.request().query("SELECT * FROM stores WHERE id = 's1'")).recordset[0];
  assert.equal(store.owner_user_id, 'o1');
  const owners = await pool.request().query("SELECT OBJECT_ID(N'store_owners') AS t");
  assert.equal(owners.recordset[0].t, null);
});
