import { sql, transaction } from '../../db/pool.js';
import { searchText } from '../../lib/text.js';

/**
 * Sincroniza `labor_companies` con lo importado del Excel: inserta las
 * nuevas, actualiza las existentes y borra las que ya no están. Los ids salen
 * del contenido, así que una empresa que no cambió conserva sus favoritos.
 */
export async function loadDirectory(entries) {
  return transaction(async (tx) => {
    // Tabla de paso normal (no #temporal): `query()` usa sp_executesql y una
    // #temporal creada ahí desaparece antes de la carga masiva.
    await new sql.Request(tx).query(`
      IF OBJECT_ID(N'labor_companies_staging') IS NOT NULL DROP TABLE labor_companies_staging;
      CREATE TABLE labor_companies_staging (
        id NVARCHAR(40) NOT NULL PRIMARY KEY, name NVARCHAR(400) NOT NULL,
        department NVARCHAR(40) NOT NULL, sector NVARCHAR(60) NOT NULL,
        activity NVARCHAR(MAX) NOT NULL, address NVARCHAR(MAX) NOT NULL,
        phone NVARCHAR(400) NOT NULL, email NVARCHAR(400) NOT NULL,
        source_sheet NVARCHAR(100) NOT NULL, source_row INT NOT NULL,
        search_text NVARCHAR(MAX) NOT NULL)`);

    const table = new sql.Table('labor_companies_staging');
    table.create = false;
    table.columns.add('id', sql.NVarChar(40), { nullable: false });
    table.columns.add('name', sql.NVarChar(400), { nullable: false });
    table.columns.add('department', sql.NVarChar(40), { nullable: false });
    table.columns.add('sector', sql.NVarChar(60), { nullable: false });
    table.columns.add('activity', sql.NVarChar(sql.MAX), { nullable: false });
    table.columns.add('address', sql.NVarChar(sql.MAX), { nullable: false });
    table.columns.add('phone', sql.NVarChar(400), { nullable: false });
    table.columns.add('email', sql.NVarChar(400), { nullable: false });
    table.columns.add('source_sheet', sql.NVarChar(100), { nullable: false });
    table.columns.add('source_row', sql.Int, { nullable: false });
    table.columns.add('search_text', sql.NVarChar(sql.MAX), { nullable: false });
    for (const e of entries) {
      const f = (k) => e[k] ?? '';
      table.rows.add(
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
      );
    }
    await new sql.Request(tx).bulk(table);

    const result = await new sql.Request(tx).query(`
      MERGE labor_companies AS t
      USING labor_companies_staging AS s ON t.id = s.id
      WHEN MATCHED THEN UPDATE SET name = s.name, department = s.department, sector = s.sector,
        activity = s.activity, address = s.address, phone = s.phone, email = s.email,
        source_sheet = s.source_sheet, source_row = s.source_row, search_text = s.search_text
      WHEN NOT MATCHED BY TARGET THEN INSERT (id, name, department, sector, activity, address,
        phone, email, source_sheet, source_row, search_text)
        VALUES (s.id, s.name, s.department, s.sector, s.activity, s.address, s.phone, s.email,
          s.source_sheet, s.source_row, s.search_text)
      WHEN NOT MATCHED BY SOURCE THEN DELETE
      OUTPUT $action AS action;
      DROP TABLE labor_companies_staging;`);
    const summary = { INSERT: 0, UPDATE: 0, DELETE: 0 };
    for (const r of result.recordset) summary[r.action]++;
    return { inserted: summary.INSERT, updated: summary.UPDATE, deleted: summary.DELETE };
  });
}
