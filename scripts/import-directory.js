// Importa el directorio laboral desde el Excel a SQL Server.
//
//   npm run directory:import
//   npm run directory:import -- --source otra/ruta.xlsx
//   npm run directory:import -- --dry-run      (solo muestra el resumen)
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { importWorkbook } from '../src/modules/directory/import-workbook.js';

const { values } = parseArgs({
  options: {
    source: { type: 'string', default: 'data/BASE DE DATOS- INSERCION LABORAL.xlsx' },
    'dry-run': { type: 'boolean', default: false },
  },
});

try {
  const data = importWorkbook(await readFile(values.source), path.basename(values.source));
  const { entries: _entries, sheetCounts, ...summary } = data;
  console.log(JSON.stringify(summary));
  console.log(`Hojas importadas: ${Object.keys(sheetCounts).length}.`);
  if (!values['dry-run']) {
    // Se importa aquí para que --dry-run no necesite configuración de base de datos.
    const { loadDirectory } = await import('../src/modules/directory/load-directory.js');
    const { closePool } = await import('../src/db/pool.js');
    try {
      console.log('Base de datos:', JSON.stringify(await loadDirectory(data.entries)));
    } finally {
      await closePool();
    }
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
}
