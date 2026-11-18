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

/** La primera línea con código de un lote, para ubicar el error. */
function firstStatement(batch) {
  const line = batch.split('\n').find((l) => l.trim() && !l.trim().startsWith('--')) ?? '';
  return line.trim().slice(0, 120);
}

/**
 * Crea la base de datos si no existe (conectándose a `master`).
 *
 * En hostings compartidos (Somee, Azure SQL) el usuario no puede entrar a
 * `master`, pero la base ya la crea el proveedor: entonces se sigue con ella.
 */
export async function ensureDatabase(name = env.DB_NAME, { log = console.log } = {}) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Nombre de base de datos inválido: ${name}`);
  let master;
  let masterOk = false;
  try {
    master = await new sql.ConnectionPool(connectionConfig('master')).connect();
    masterOk = true;
    await master.request().query(`IF DB_ID(N'${name}') IS NULL CREATE DATABASE [${name}]`);
  } catch (err) {
    log(`No se pudo crear la base desde master (${err.message}); se usa la existente: ${name}`);
  } finally {
    await master?.close();
  }
  // Sirve para explicar un «Login failed» posterior: si se pudo entrar a
  // master, el usuario y la contraseña son válidos.
  return { masterOk };
}

/**
 * Explica un fallo de ingreso a la base. SQL Server responde «Login failed
 * for user» tanto si la contraseña está mal como si el usuario no puede
 * abrir esa base, así que el mensaje solo no dice qué variable revisar.
 */
export function explainLoginError(err, { masterOk }) {
  if (err?.code !== 'ELOGIN') return null;
  const where = `la base «${env.DB_NAME}» en ${env.DB_SERVER} con el usuario ${env.DB_USER}`;
  return masterOk
    ? `No se pudo abrir ${where}. El usuario y la contraseña son válidos (se pudo entrar a master), ` +
        'así que revisa DB_NAME: debe ser el nombre exacto de la base y ese usuario debe tener acceso a ella.'
    : `No se pudo entrar a ${where}. Revisa DB_USER y DB_PASSWORD; si son correctos, revisa DB_NAME.`;
}

/**
 * Aplica, en orden, las migraciones que aún no estén registradas.
 * `until` se detiene después de esa migración (para probar actualizaciones).
 */
export async function migrate({ log = console.log, pool: target, until } = {}) {
  const pool = target ?? (await getPool());
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
    if (applied.has(file)) {
      if (file === until) break;
      continue;
    }
    const script = await readFile(path.join(migrationsDir, file), 'utf8');
    const tx = new sql.Transaction(pool);
    await tx.begin();
    let current = '';
    try {
      for (const batch of splitBatches(script)) {
        current = batch;
        await new sql.Request(tx).query(batch);
      }
      current = '';
      await new sql.Request(tx)
        .input('name', file)
        .query('INSERT INTO schema_migrations (name) VALUES (@name)');
      await tx.commit();
      log(`migración aplicada: ${file}`);
    } catch (err) {
      // Si SQL Server ya anuló la transacción, rollback() también falla
      // («Transaction has been aborted») y taparía el error que importa.
      await tx.rollback().catch(() => {});
      const where = current ? `\n  en: ${firstStatement(current)}` : '';
      throw new Error(`Falló la migración ${file}: ${err.message}${where}`, { cause: err });
    }
    if (file === until) break;
  }
}
