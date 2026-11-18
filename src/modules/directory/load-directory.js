import { transaction } from '../../db/pool.js';
import { searchText } from '../../lib/text.js';

const COLUMNS = [
  'id',
  'name',
  'department',
  'sector',
  'activity',
  'address',
  'phone',
  'email',
  'source_sheet',
  'source_row',
  'search_text',
];

/**
 * Sincroniza `labor_companies` con lo importado del Excel: inserta las
 * nuevas, actualiza las existentes y borra las que ya no están. Los ids salen
 * del contenido, así que una empresa que no cambió conserva sus favoritos.
 */
export async function loadDirectory(entries) {
  // Una columna por arreglo: así las 30.000 filas viajan en una sola consulta.
  const columns = COLUMNS.map(() => []);
  for (const e of entries) {
    const f = (k) => e[k] ?? '';
    const row = [
      e.id,
      f('name').slice(0, 400),
      e.department,
      e.sector,
      f('activity'),
      f('address'),
      f('phone').slice(0, 400),
      f('email').slice(0, 400),
      e.sourceSheet,
      e.sourceRow,
      // Igual que `LaborCompany.searchable` del frontend.
      searchText(`${f('name')} ${e.department} ${e.sector} ${f('activity')} ${f('address')}`),
    ];
    row.forEach((value, i) => columns[i].push(value));
  }

  return transaction(async (tx) => {
    await tx.query(`
      CREATE TEMP TABLE labor_companies_staging
        (LIKE labor_companies INCLUDING DEFAULTS) ON COMMIT DROP`);
    await tx.query(
      `INSERT INTO labor_companies_staging (${COLUMNS.join(', ')})
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
         $7::text[], $8::text[], $9::text[], $10::int[], $11::text[])`,
      columns,
    );

    const deleted = await tx.query(`
      DELETE FROM labor_companies t
      WHERE NOT EXISTS (SELECT 1 FROM labor_companies_staging s WHERE s.id = t.id)`);
    // `xmax = 0` distingue la fila recién insertada de la que ya existía.
    const upserted = await tx.query(`
      INSERT INTO labor_companies (${COLUMNS.join(', ')})
      SELECT ${COLUMNS.join(', ')} FROM labor_companies_staging
      ON CONFLICT (id) DO UPDATE SET
        ${COLUMNS.filter((c) => c !== 'id')
          .map((c) => `${c} = EXCLUDED.${c}`)
          .join(', ')}
      RETURNING (xmax = 0) AS inserted`);
    const inserted = upserted.rows.filter((r) => r.inserted).length;
    return { inserted, updated: upserted.rows.length - inserted, deleted: deleted.rowCount };
  });
}
