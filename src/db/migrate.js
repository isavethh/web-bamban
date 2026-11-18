import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPool } from './pool.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Explica un fallo de conexión con palabras que digan qué revisar. Los
 * mensajes de PostgreSQL y de la red son correctos pero escuetos.
 */
export function explainConnectionError(err) {
  const code = err?.code;
  if (code === '28P01' || code === '28000') {
    return 'La base rechazó el usuario o la contraseña. Revisa DATABASE_URL (si la contraseña tiene símbolos como @ o #, deben ir codificados).';
  }
  if (code === '3D000') {
    return 'El servidor responde pero esa base no existe. Revisa el nombre al final de DATABASE_URL.';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'No se encontró el servidor de la base. Revisa el host de DATABASE_URL.';
  }
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || /timeout/i.test(err?.message ?? '')) {
    return 'El servidor de la base no respondió. Puede estar pausado (los planes gratuitos se pausan por inactividad) o el puerto de DATABASE_URL es incorrecto.';
  }
  if (/SSL|TLS/i.test(err?.message ?? '')) {
    return 'Falló el cifrado de la conexión. Los proveedores gestionados necesitan DB_SSL=true; una base local, DB_SSL=false.';
  }
  return null;
}

/**
 * Aplica, en orden, las migraciones que aún no estén registradas. Cada
 * archivo corre en su propia transacción: o entra completo o no entra.
 */
export async function migrate({ log = console.log, pool: target } = {}) {
  const pool = target ?? getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(200) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
    )`);
  const applied = new Set(
    (await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const script = await readFile(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(script);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`migración aplicada: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      // `position` es el carácter del script donde PostgreSQL encontró el error.
      const line = err.position ? script.slice(0, Number(err.position)).split('\n').length : null;
      const where = line ? ` (línea ${line})` : '';
      throw new Error(`Falló la migración ${file}${where}: ${err.message}`, { cause: err });
    } finally {
      client.release();
    }
  }
}
