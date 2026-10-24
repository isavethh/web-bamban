import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql, connectionConfig, getPool } from './pool.js';
import { env } from '../config/env.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Separa un script en lotes por las líneas `GO`, como hace sqlcmd. */
export function splitBatches(script) {
  return script
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter(Boolean);
}

/** Crea la base de datos si no existe (conectándose a `master`). */
export async function ensureDatabase(name = env.DB_NAME) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Nombre de base de datos inválido: ${name}`);
  const master = await new sql.ConnectionPool(connectionConfig('master')).connect();
  try {
    await master.request().query(`IF DB_ID(N'${name}') IS NULL CREATE DATABASE [${name}]`);
  } finally {
    await master.close();
  }
}

/** Aplica, en orden, las migraciones que aún no estén registradas. */
export async function migrate({ log = console.log } = {}) {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID(N'schema_migrations') IS NULL
      CREATE TABLE schema_migrations (
        name NVARCHAR(200) NOT NULL PRIMARY KEY,
        applied_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
      )`);
  const applied = new Set(
    (await pool.request().query('SELECT name FROM schema_migrations')).recordset.map((r) => r.name),
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const script = await readFile(path.join(migrationsDir, file), 'utf8');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      for (const batch of splitBatches(script)) await new sql.Request(tx).query(batch);
      await new sql.Request(tx)
        .input('name', file)
        .query('INSERT INTO schema_migrations (name) VALUES (@name)');
      await tx.commit();
      log(`migración aplicada: ${file}`);
    } catch (err) {
      await tx.rollback();
      throw new Error(`Falló la migración ${file}: ${err.message}`, { cause: err });
    }
  }
}
