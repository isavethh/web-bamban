import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DB_SERVER: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_NAME: z.string().min(1).default('tucan'),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_ENCRYPT: bool.default(true),
  DB_TRUST_SERVER_CERTIFICATE: bool.default(false),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Lista separada por comas. Vacía = sin CORS (solo mismo origen).
  CORS_ORIGINS: z.string().default(''),

  // Permite el ingreso directo con las cuentas de demostración.
  DEMO_LOGIN_ENABLED: bool.default(false),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5-mini'),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuración inválida:\n${detail.join('\n')}`);
  }
  const env = parsed.data;
  return {
    ...env,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
  };
}

export const env = load();
