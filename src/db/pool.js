import sql from 'mssql';
import { env } from '../config/env.js';

export { sql };

export function connectionConfig(database = env.DB_NAME) {
  return {
    server: env.DB_SERVER,
    port: env.DB_PORT,
    database,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: {
      encrypt: env.DB_ENCRYPT,
      trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
  };
}

let poolPromise;

/** Pool compartido por toda la aplicación. Se crea en el primer uso. */
export function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(connectionConfig()).connect().catch((err) => {
      poolPromise = undefined;
      throw err;
    });
  }
  return poolPromise;
}

export async function closePool() {
  if (!poolPromise) return;
  const pool = await poolPromise;
  poolPromise = undefined;
  await pool.close();
}

/**
 * Ejecuta una consulta parametrizada.
 *
 * `params` es `{ nombre: valor }` o `{ nombre: [tipo, valor] }` cuando hace
 * falta fijar el tipo (por ejemplo `NVarChar(sql.MAX)`). Dentro del SQL se
 * referencian como `@nombre`. Nunca se concatenan valores en el texto.
 */
export async function query(text, params = {}, executor) {
  const target = executor ?? (await getPool());
  const request = target.request();
  for (const [name, value] of Object.entries(params)) {
    if (Array.isArray(value)) request.input(name, value[0], value[1]);
    else request.input(name, value);
  }
  return request.query(text);
}

/** Devuelve las filas de la primera tabla de resultados. */
export async function rows(text, params, executor) {
  return (await query(text, params, executor)).recordset ?? [];
}

export async function one(text, params, executor) {
  return (await rows(text, params, executor))[0] ?? null;
}

/** Ejecuta `fn` dentro de una transacción; si lanza, se deshace todo. */
export async function transaction(fn) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
