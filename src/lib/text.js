import { randomUUID } from 'node:crypto';

export const newId = () => randomUUID();

/**
 * Igual que `searchText` del frontend: minúsculas y sin tildes, para que
 * «Potosí» y «potosi» encuentren lo mismo.
 */
export function searchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Palabras de una búsqueda, ya normalizadas. */
export const searchWords = (q) => searchText(q).split(/\s+/).filter(Boolean);

/** Escapa los comodines de LIKE para buscar el texto literal. */
export const likeEscape = (s) => s.replace(/[[\]%_]/g, (c) => `[${c}]`);

/** «Tortas y Empanadas Marta» → «tortas-y-empanadas-marta». */
export function slugify(value, fallback) {
  const slug = searchText(value)
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

/** Lee una columna JSON; si viene vacía o corrupta devuelve `fallback`. */
export function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
