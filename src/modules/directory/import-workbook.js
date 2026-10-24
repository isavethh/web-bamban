// Lee el Excel «BASE DE DATOS- INSERCION LABORAL» y devuelve las empresas.
//
// Port del importador original en Python (aplicaciondeempleo/scripts/
// import_labor_directory.py): mismas reglas, mismos ids. Lee el .xlsx como lo
// que es —un zip con XML— para no depender de librerías de hojas de cálculo.
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Equivalente a `html.unescape`: el Excel trae entidades HTML dentro del texto. */
function unescapeHtml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent) => {
    if (ent[0] === '#') {
      const code =
        ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : Number(ent.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? m;
  });
}

// `\s` de Python también cubre los separadores de control \x1c-\x1f.
// eslint-disable-next-line no-control-regex
const WHITESPACE = /[\s\x1c-\x1f]+/g;
const clean = (v) => unescapeHtml(v).replace(WHITESPACE, ' ').trim();

export const normalize = (v) =>
  v
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '');

const DEPARTMENTS = [
  [['LA PAZ', 'LAPAZ', ' LP'], 'La Paz'],
  [['ORURO'], 'Oruro'],
  [['STA.', 'STA. CRUZ', 'SANTA CRUZ'], 'Santa Cruz'],
  [['COCH.'], 'Cochabamba'],
  [['CHUQUISACA'], 'Chuquisaca'],
  [['BENI'], 'Beni'],
  [['PANDO'], 'Pando'],
  [['POTOSI'], 'Potosí'],
  [['TARIJA'], 'Tarija'],
];

const SECTORS = [
  ['CONSTRUCTORA', 'Construcción'],
  ['LOGISTICA', 'Logística'],
  ['TRANSPORTE', 'Transporte'],
  ['CONTABLE', 'Contabilidad'],
  ['MINER', 'Minería'],
  ['COMERCIO', 'Comercio'],
  ['SALUD', 'Salud'],
  ['TEXTILES', 'Textiles'],
  ['CONFECCION', 'Textiles'],
  ['ALIMENTO', 'Alimentos'],
  ['AGRO', 'Agropecuaria'],
  ['HIDROCARBURO', 'Hidrocarburos'],
  ['HIROCARBURO', 'Hidrocarburos'],
  ['FORESTAL', 'Forestal y madera'],
  ['GASTRONOMIA', 'Gastronomía'],
  ['HOSPEDAJE', 'Hospedaje'],
  ['TURISMO', 'Turismo'],
];

const HEADER_TOKENS = [
  ['name', 'RAZON SOCIAL'],
  ['activity', 'ACTIVIDAD'],
  ['address', 'DIRECCION'],
  ['phone', 'TELEFONO'],
  ['email', 'CORREO'],
];

export function department(sheetName) {
  const key = normalize(sheetName);
  return DEPARTMENTS.find(([tokens]) => tokens.some((t) => key.includes(t)))?.[1] ?? null;
}

export function sector(sheetName) {
  const key = normalize(sheetName);
  const found = SECTORS.find(([prefix]) => key.startsWith(prefix));
  if (!found) throw new Error(`Rubro desconocido: ${sheetName}`);
  return found[1];
}

// --- Ayudas para el árbol de fast-xml-parser (preserveOrder) -------------

const tagOf = (node) => Object.keys(node).find((k) => k !== ':@');
const children = (node) => node[tagOf(node)] ?? [];
const attrs = (node) => node[':@'] ?? {};
const childrenNamed = (node, name) => children(node).filter((c) => tagOf(c) === name);
const firstNamed = (nodes, name) => nodes.find((c) => tagOf(c) === name);

/** Todo el texto de un subárbol, como `itertext()` de ElementTree. */
function textOf(node) {
  if (node['#text'] !== undefined) return String(node['#text']);
  return children(node).map(textOf).join('');
}

const parseXml = (files, name) => {
  const file = files[name];
  if (!file) throw new Error(`El Excel no tiene ${name}`);
  return parser.parse(strFromU8(file));
};
const root = (doc) => doc.find((n) => tagOf(n) !== '?xml');

export function importWorkbook(buffer, sourceName = 'workbook.xlsx') {
  const files = unzipSync(new Uint8Array(buffer));
  const shared = files['xl/sharedStrings.xml']
    ? childrenNamed(root(parseXml(files, 'xl/sharedStrings.xml')), 'si').map(textOf)
    : [];
  const relations = Object.fromEntries(
    children(root(parseXml(files, 'xl/_rels/workbook.xml.rels'))).map((r) => [
      attrs(r).Id,
      attrs(r).Target,
    ]),
  );
  const workbook = root(parseXml(files, 'xl/workbook.xml'));
  const sheets = childrenNamed(firstNamed(children(workbook), 'sheets'), 'sheet');

  const entries = [];
  const seen = new Set();
  const sheetCounts = {};
  let duplicates = 0;

  for (const sheet of sheets) {
    const { name } = attrs(sheet);
    const dept = department(name);
    if (!dept) continue; // Portada e índices, sin empresas.
    let target = relations[attrs(sheet)['r:id']].replace(/^\/+/, '');
    if (!target.startsWith('xl/')) target = `xl/${target}`;
    const sheetData = firstNamed(children(root(parseXml(files, target))), 'sheetData');
    const rows = sheetData ? childrenNamed(sheetData, 'row') : [];

    const headers = {};
    let count = 0;
    for (const row of rows) {
      const values = {};
      for (const cell of childrenNamed(row, 'c')) {
        const { r, t } = attrs(cell);
        const col = r.replace(/\d/g, '');
        const v = firstNamed(children(cell), 'v');
        let text;
        if (t === 's' && v) text = shared[Number(textOf(v))];
        else if (t === 'inlineStr') text = textOf(firstNamed(children(cell), 'is'));
        else text = v ? textOf(v) : '';
        values[col] = clean(text ?? '');
      }

      if (Object.values(values).some((v) => normalize(v).includes('RAZON SOCIAL'))) {
        for (const [col, value] of Object.entries(values)) {
          const label = normalize(value);
          for (const [field, token] of HEADER_TOKENS)
            if (label.includes(token)) headers[field] = col;
        }
        continue;
      }
      if (!Object.keys(headers).length) continue;

      const record = {};
      for (const [field, col] of Object.entries(headers)) record[field] = values[col] ?? '';
      if (/^COLUMNA\d+$/.test(normalize(record.name ?? ''))) continue;
      if (!record.name || !['activity', 'address', 'phone', 'email'].some((f) => record[f])) {
        continue;
      }
      record.department = dept;
      record.sector = sector(name);
      const key = ['department', 'sector', 'name', 'activity', 'address', 'phone', 'email'].map(
        (f) => normalize(record[f] ?? ''),
      );
      const keyText = key.join('|');
      if (seen.has(keyText)) {
        duplicates++;
        continue;
      }
      seen.add(keyText);
      record.id = `labor_${createHash('sha256').update(keyText, 'utf8').digest('hex').slice(0, 20)}`;
      record.sourceSheet = name;
      record.sourceRow = Number(attrs(row).r);
      entries.push(record);
      count++;
    }
    if (count) sheetCounts[name] = count;
  }

  if (!entries.length)
    throw new Error('No se encontraron registros; revisar encabezados del Excel.');
  const departments = {};
  for (const e of entries) departments[e.department] = (departments[e.department] ?? 0) + 1;
  return {
    source: sourceName,
    recordCount: entries.length,
    duplicatesRemoved: duplicates,
    sheetCounts,
    departments: Object.fromEntries(
      Object.entries(departments).sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
    entries,
  };
}
