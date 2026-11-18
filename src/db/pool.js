import pg from 'pg';
import { env } from '../config/env.js';

// PostgreSQL devuelve como texto lo que no cabe en un número de JavaScript.
// Aquí los valores son pequeños (calificaciones, precios, conteos): números.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number.parseFloat(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number.parseInt(v, 10));
// Las fechas sin hora (DATE) se leen como medianoche UTC, no como hora local.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => new Date(`${v}T00:00:00Z`));

/**
 * Tipos para fijar el de un parámetro: `{ foto: [sql.Text, valor] }`.
 * Hace falta cuando PostgreSQL no puede deducirlo solo, por ejemplo en
 * `@x IS NULL OR columna = @x` con valor nulo.
 */
export const sql = Object.freeze({
  Text: 'text',
  Bool: 'boolean',
  Int: 'integer',
  Numeric: 'numeric',
  Timestamp: 'timestamptz',
  Date: 'date',
});

export function connectionConfig(connectionString = env.DATABASE_URL) {
  return {
    connectionString,
    // Los proveedores gestionados (Supabase, Neon, Render) exigen TLS y usan
    // certificados que Node no trae en su almacén.
    ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    // Una base gratuita puede estar despertando: se le da margen.
    connectionTimeoutMillis: 30_000,
  };
}

let pool;

/** Pool compartido por toda la aplicación. Se crea en el primer uso. */
export function getPool() {
  if (!pool) {
    pool = new pg.Pool(connectionConfig());
    // Un cliente inactivo que pierde la conexión no debe tumbar el proceso.
    pool.on('error', () => {});
  }
  return pool;
}

export async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}

/**
 * Convierte `@nombre` en los `$1, $2...` de PostgreSQL.
 * Un mismo nombre repetido reutiliza su número. `::tipo` y los correos dentro
 * de literales no se tocan: solo se reemplazan los nombres que están en `params`.
 */
export function compile(text, params = {}) {
  const values = [];
  const index = new Map();
  const sqlText = text.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => {
    if (!Object.hasOwn(params, name)) return match;
    if (!index.has(name)) {
      const raw = params[name];
      const [type, value] = Array.isArray(raw) ? raw : [null, raw];
      values.push(value === undefined ? null : value);
      index.set(name, { n: values.length, type });
    }
    const { n, type } = index.get(name);
    return type ? `$${n}::${type}` : `$${n}`;
  });
  return { text: sqlText, values };
}

/**
 * Ejecuta una consulta parametrizada.
 *
 * `params` es `{ nombre: valor }` o `{ nombre: [tipo, valor] }` cuando hace
 * falta fijar el tipo (ver `sql`). Dentro del SQL se referencian como
 * `@nombre`. Nunca se concatenan valores en el texto.
 */
export async function query(text, params = {}, executor) {
  const target = executor ?? getPool();
  return target.query(compile(text, params));
}

/** Devuelve las filas del resultado. */
export async function rows(text, params, executor) {
  return (await query(text, params, executor)).rows ?? [];
}

export async function one(text, params, executor) {
  return (await rows(text, params, executor))[0] ?? null;
}

/** Ejecuta `fn` dentro de una transacción; si lanza, se deshace todo. */
export async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
