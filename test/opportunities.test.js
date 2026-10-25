import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, closePool, demoLogin, registerUser, resetDatabase } from './helpers.js';

before(resetDatabase);
after(closePool);

const newOpportunity = {
  type: 'trabajo',
  title: 'Técnico electricista',
  organization: 'Empresa de Prueba',
  publisherType: 'empresa',
  rubro: 'Construcción',
  city: 'La Paz',
  modality: 'Presencial',
  description: 'Instalaciones eléctricas industriales.',
  deadline: new Date(Date.now() + 10 * 864e5).toISOString(),
  tags: ['Electricidad', 'Tableros'],
};

describe('tablero de oportunidades', () => {
  test('lista las oportunidades demo con la forma que espera la app', async () => {
    const res = await api().get('/api/opportunities').expect(200);
    assert.equal(res.body.length, 39);
    const t1 = res.body.find((o) => o.id === 't1');
    assert.equal(t1.type, 'trabajo');
    assert.ok(Array.isArray(t1.tags));
    assert.ok(new Date(t1.deadline) > new Date());
  });

  test('publica, postula, guarda y retira', async () => {
    const employer = await registerUser({ role: 'employer', companyName: 'Empresa de Prueba' });
    const created = await api()
      .post('/api/opportunities')
      .set(employer.auth)
      .send(newOpportunity)
      .expect(201);
    assert.equal(created.body.ownerId, employer.user.id);

    const pro = await registerUser({ name: 'Luis Mamani', specialty: 'Electricista' });
    await api()
      .put('/api/me/cv')
      .set(pro.auth)
      .send({ cv: { fullName: 'Luis Mamani', headline: 'Electricista', skills: ['Tableros'] } })
      .expect(200);

    const applied = await api()
      .post(`/api/opportunities/${created.body.id}/applications`)
      .set(pro.auth)
      .send({ message: 'Me interesa', sentCv: true, cvFileName: 'CV-luis.pdf' })
      .expect(201);
    assert.equal(applied.body.status, 'enviada');
    assert.equal(applied.body.opportunity.id, created.body.id);

    // Postular dos veces devuelve la misma postulación.
    const again = await api()
      .post(`/api/opportunities/${created.body.id}/applications`)
      .set(pro.auth)
      .send({})
      .expect(200);
    assert.equal(again.body.id, applied.body.id);

    const mine = await api().get('/api/me/applications').set(pro.auth).expect(200);
    assert.deepEqual(
      mine.body.map((a) => a.opportunity.id),
      [created.body.id],
    );

    await api().put(`/api/me/saved-opportunities/${created.body.id}`).set(pro.auth).expect(204);
    await api().put(`/api/me/saved-opportunities/${created.body.id}`).set(pro.auth).expect(204);
    const saved = await api().get('/api/me/saved-opportunities').set(pro.auth).expect(200);
    assert.deepEqual(saved.body, [created.body.id]);

    // La empresa ve al postulante con su CV.
    const applicants = await api().get('/api/employer/applicants').set(employer.auth).expect(200);
    assert.equal(applicants.body.length, 1);
    assert.equal(applicants.body[0].name, 'Luis Mamani');
    assert.deepEqual(applicants.body[0].cv.skills, ['Tableros']);
    assert.equal(applicants.body[0].sentCv, true);

    await api()
      .delete(`/api/opportunities/${created.body.id}/applications/mine`)
      .set(pro.auth)
      .expect(204);
    const after = await api().get('/api/me/applications').set(pro.auth).expect(200);
    assert.equal(after.body.length, 0);
  });

  test('no se puede postular a lo propio', async () => {
    const employer = await registerUser({ role: 'employer' });
    const created = await api()
      .post('/api/opportunities')
      .set(employer.auth)
      .send(newOpportunity)
      .expect(201);
    await api()
      .post(`/api/opportunities/${created.body.id}/applications`)
      .set(employer.auth)
      .send({})
      .expect(400);
  });

  test('la profesional demo trae sus postulaciones, guardados y trabajos', async () => {
    const maria = await demoLogin('seeker');
    const apps = await api().get('/api/me/applications').set(maria.auth).expect(200);
    assert.equal(apps.body.length, 5);
    const saved = await api().get('/api/me/saved-opportunities').set(maria.auth).expect(200);
    assert.deepEqual([...saved.body].sort(), ['b1', 'c1', 'k1']);
    const works = await api().get('/api/me/completed-works').set(maria.auth).expect(200);
    assert.equal(works.body.length, 4);
  });
});

describe('reclutamiento', () => {
  test('la empresa demo mueve postulantes y anota', async () => {
    const employer = await demoLogin('employer');
    const list = await api().get('/api/employer/applicants').set(employer.auth).expect(200);
    assert.equal(list.body.length, 5);
    const karen = list.body.find((a) => a.name === 'Karen Choque');
    assert.equal(karen.notes.length, 1);

    const moved = await api()
      .patch(`/api/employer/applicants/${karen.id}`)
      .set(employer.auth)
      .send({ status: 'aceptada' })
      .expect(200);
    assert.equal(moved.body.status, 'aceptada');

    const noted = await api()
      .post(`/api/employer/applicants/${karen.id}/notes`)
      .set(employer.auth)
      .send({ text: 'Enviar oferta' })
      .expect(201);
    assert.equal(noted.body.notes.length, 2);
    assert.equal(noted.body.notes[1].author, 'Valeria Rocha');
  });

  test('otra empresa no puede tocar esos postulantes', async () => {
    const employer = await demoLogin('employer');
    const list = await api().get('/api/employer/applicants').set(employer.auth).expect(200);
    const intruder = await registerUser({ role: 'employer' });
    await api()
      .patch(`/api/employer/applicants/${list.body[0].id}`)
      .set(intruder.auth)
      .send({ status: 'rechazada' })
      .expect(403);
    const own = await api().get('/api/employer/applicants').set(intruder.auth).expect(200);
    assert.equal(own.body.length, 0);
  });
});

describe('hoja de vida', () => {
  test('guarda el CV, genera un enlace único y lo publica', async () => {
    const a = await registerUser();
    const b = await registerUser();
    const cv = { fullName: 'María José Peña', headline: 'Contadora' };
    const first = await api().put('/api/me/cv').set(a.auth).send({ cv }).expect(200);
    const second = await api().put('/api/me/cv').set(b.auth).send({ cv }).expect(200);
    assert.equal(first.body.slug, 'maria-jose-pena');
    assert.equal(second.body.slug, 'maria-jose-pena-2');

    const mine = await api().get('/api/me/cv').set(a.auth).expect(200);
    assert.equal(mine.body.cv.headline, 'Contadora');
    assert.deepEqual(mine.body.cv.skills, []);

    const pub = await api().get('/api/cvs/maria-jose-pena').expect(200);
    assert.equal(pub.body.cv.fullName, 'María José Peña');

    await api().patch('/api/me').set(a.auth).send({ isProfilePublic: false }).expect(200);
    await api().get('/api/cvs/maria-jose-pena').expect(404);
  });
});
