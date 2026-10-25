import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { api, closePool, registerUser, resetDatabase } from './helpers.js';
import { importWorkbook, department, sector } from '../src/modules/directory/import-workbook.js';
import { FALLBACK, outputText } from '../src/modules/ai/ai.routes.js';

before(resetDatabase);
after(closePool);

describe('directorio laboral', () => {
  test('busca sin distinguir tildes ni mayúsculas y filtra', async () => {
    let res = await api().get('/api/directory/companies?q=potosi%20ESTANO').expect(200);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.items[0].id, 'labor_1');

    res = await api().get('/api/directory/companies?department=La%20Paz').expect(200);
    assert.deepEqual(
      res.body.items.map((c) => c.id),
      ['labor_2'],
    );

    res = await api().get('/api/directory/companies?q=100%25').expect(200);
    assert.equal(res.body.total, 0, 'el % se busca literal, no como comodín');

    const facets = await api().get('/api/directory/facets').expect(200);
    assert.deepEqual(facets.body, {
      count: 2,
      departments: ['La Paz', 'Potosí'],
      sectors: ['Construcción', 'Minería'],
    });
  });

  test('pagina los resultados', async () => {
    const res = await api().get('/api/directory/companies?pageSize=1&page=2').expect(200);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.total, 2);
    assert.equal(res.body.page, 2);
  });

  test('favoritos por usuario', async () => {
    const a = await registerUser();
    const b = await registerUser();
    await api().put('/api/directory/favorites/labor_2').set(a.auth).expect(204);
    await api().put('/api/directory/favorites/no-existe').set(a.auth).expect(404);
    assert.deepEqual((await api().get('/api/directory/favorites').set(a.auth)).body, ['labor_2']);
    assert.deepEqual((await api().get('/api/directory/favorites').set(b.auth)).body, []);

    const onlyFav = await api()
      .get('/api/directory/companies?favorites=true')
      .set(a.auth)
      .expect(200);
    assert.deepEqual(
      onlyFav.body.items.map((c) => c.id),
      ['labor_2'],
    );
    await api().get('/api/directory/companies?favorites=true').expect(401);

    await api().delete('/api/directory/favorites/labor_2').set(a.auth).expect(204);
    assert.deepEqual((await api().get('/api/directory/favorites').set(a.auth)).body, []);
  });

  test('reglas del importador', () => {
    assert.equal(department('CONSTRUCTORA LA PAZ'), 'La Paz');
    assert.equal(department('MINERIA POTOSI'), 'Potosí');
    assert.equal(department('PORTADA'), null);
    assert.equal(sector('HIROCARBURO TARIJA'), 'Hidrocarburos');
    assert.throws(() => sector('OTRA COSA'), /Rubro desconocido/);
  });

  test('importa el Excel real con los mismos totales que el importador original', async () => {
    const buffer = await readFile('data/BASE DE DATOS- INSERCION LABORAL.xlsx');
    const data = importWorkbook(buffer);
    assert.equal(data.recordCount, 30667);
    assert.equal(data.duplicatesRemoved, 98);
    assert.equal(Object.keys(data.sheetCounts).length, 90);
    assert.equal(new Set(data.entries.map((e) => e.id)).size, data.entries.length);
  });
});

describe('búsqueda con IA', () => {
  test('sin clave configurada responde con sugerencias genéricas', async () => {
    for (const path of ['/api/ai/job-search', '/api/openai']) {
      const res = await api().post(path).send({ userQuery: 'contador' }).expect(200);
      assert.equal(res.body.fallback, FALLBACK);
    }
  });

  test('valida la consulta', async () => {
    await api().post('/api/ai/job-search').send({ userQuery: '' }).expect(400);
  });

  test('extrae el texto de la respuesta de OpenAI', () => {
    assert.equal(outputText({ output_text: 'hola' }), 'hola');
    assert.equal(
      outputText({
        output: [
          { type: 'reasoning', summary: [] },
          { type: 'message', content: [{ type: 'output_text', text: 'respuesta' }] },
        ],
      }),
      'respuesta',
    );
    assert.equal(outputText({}), null);
  });
});

describe('API', () => {
  test('health, CORS y rutas desconocidas', async () => {
    const health = await api().get('/health').expect(200);
    assert.equal(health.body.database, 'ok');
    const cors = await api()
      .get('/api/opportunities')
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    assert.equal(cors.headers['access-control-allow-origin'], 'http://localhost:5173');
    const blocked = await api().get('/api/opportunities').set('Origin', 'https://otro.com');
    assert.equal(blocked.headers['access-control-allow-origin'], undefined);
    await api().get('/api/no-existe').expect(404);
  });
});
