import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { aiLimiter } from '../../middleware/rate-limit.js';
import { logger } from '../../lib/logger.js';

export const FALLBACK = `🔍 Portales en Bolivia:
• CompuTrabajo: https://www.computrabajo.com.bo
• LinkedIn: https://www.linkedin.com/jobs/search/?location=Bolivia
• Indeed: https://bo.indeed.com

🏢 Empresas bolivianas:
• Bancos: BNB, Banco Mercantil
• Tech: Viva, Tigo, Entel
• Consultoras: Deloitte, EY, KPMG`;

const INSTRUCTIONS = `Eres un asistente de búsqueda de empleos en BOLIVIA.
SÉ BREVE Y CONCISO. Responde en máximo 10 líneas.

FORMATO DE RESPUESTA:
1. Lista 2-3 portales de empleo bolivianos con links
2. Lista 2-3 empresas que contratan para lo que busca la persona en Bolivia

EJEMPLO:
🔍 Portales:
• CompuTrabajo: https://www.computrabajo.com.bo
• LinkedIn: https://www.linkedin.com/jobs/search/?location=Bolivia

🏢 Empresas que contratan:
• Banco Mercantil
• Deloitte Bolivia
• Tigo`;

/** Texto de salida de la Responses API de OpenAI. */
export function outputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text;
  for (const item of data?.output ?? []) {
    if (item.type !== 'message') continue;
    const text = (item.content ?? [])
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text)
      .join('');
    if (text.trim()) return text;
  }
  return null;
}

async function askOpenAI(userQuery, fetchImpl = fetch) {
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      instructions: INSTRUCTIONS,
      // La consulta va como entrada del usuario, nunca pegada a las instrucciones.
      input: `Busco: ${userQuery} en Bolivia. Dame solo portales y empresas.`,
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
      max_output_tokens: 500,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(`OpenAI respondió ${response.status}: ${await response.text()}`);
  return outputText(await response.json());
}

const body = z.object({ userQuery: z.string().trim().min(2, 'Escribe qué buscas.').max(300) });

export const aiRouter = Router();

// La app espera siempre 200 con `result`, o `error` + `fallback` para
// mostrar sugerencias genéricas sin romper la conversación.
async function jobSearch(req, res) {
  if (!env.OPENAI_API_KEY) {
    return res.json({ error: 'La búsqueda con IA no está configurada.', fallback: FALLBACK });
  }
  try {
    const result = await askOpenAI(req.valid.body.userQuery);
    res.json({ result: result ?? FALLBACK });
  } catch (err) {
    (req.log ?? logger).error({ err }, 'falló la consulta a OpenAI');
    res.json({ error: 'La IA no está disponible en este momento.', fallback: FALLBACK });
  }
}

aiRouter.post('/job-search', aiLimiter, validate({ body }), jobSearch);

// Ruta anterior (`POST /api/openai`), para las versiones ya publicadas de la app.
export const legacyAiRouter = Router();
legacyAiRouter.post('/', aiLimiter, validate({ body }), jobSearch);
