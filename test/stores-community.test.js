import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, closePool, registerOwner, registerUser, resetDatabase } from './helpers.js';

before(resetDatabase);
after(closePool);

describe('emprendimientos', () => {
  test('lista las tiendas con su dueño profesional y su lugar', async () => {
    const res = await api().get('/api/stores').expect(200);
    assert.equal(res.body.length, 6);
    const marta = await api().get('/api/stores/tortas-y-empanadas-marta').expect(200);
    assert.equal(marta.body.products.length, 4);
    assert.equal(marta.body.ownerId, 'demo_owner_marta');
    assert.equal(marta.body.department, 'Santa Cruz');
    const owner = await api().get('/api/profiles/demo_owner_marta').expect(200);
    assert.equal(owner.body.role, 'seeker');
  });

  test('un profesional crea varias tiendas con enlaces únicos', async () => {
    const owner = await registerOwner('Salteñas Don Juan');
    assert.equal(owner.stores[0].publicSlug, 'saltenas-don-juan-2');
    assert.equal(owner.stores[0].ownerId, owner.user.id);

    const second = await api()
      .post('/api/me/stores')
      .set(owner.auth)
      .send({ name: 'Segunda tienda', category: 'Artesanía', delivery: true })
      .expect(201);
    assert.equal(second.body.category, 'Artesanía');

    const updated = await api()
      .put(`/api/me/stores/${second.body.id}`)
      .set(owner.auth)
      .send({ hours: 'Lun–Vie 9–18', products: [{ name: 'Aguayo', price: 'Bs 200' }] })
      .expect(200);
    assert.equal(updated.body.hours, 'Lun–Vie 9–18');
    assert.equal(updated.body.category, 'Artesanía');
    assert.equal(updated.body.products[0].name, 'Aguayo');

    const mine = await api().get('/api/me/stores').set(owner.auth).expect(200);
    assert.equal(mine.body.length, 2);
  });

  test('solo un profesional tiene emprendimientos y nadie edita los ajenos', async () => {
    const a = await registerOwner('Tienda A');
    const b = await registerOwner('Tienda B');
    await api()
      .put(`/api/me/stores/${a.stores[0].id}`)
      .set(b.auth)
      .send({ name: 'Robada' })
      .expect(403);
    for (const role of ['employer', 'tourist', 'serviceSeeker']) {
      const other = await registerUser({
        role,
        ...(role === 'employer' && { businessSector: 'comercio', businessType: 'tienda' }),
      });
      await api().post('/api/me/stores').set(other.auth).send({ name: 'X' }).expect(403);
    }
  });

  test('ya no existen las cuentas aparte de emprendedor', async () => {
    await api().post('/api/owners/login').send({ username: 'marta', password: 'x' }).expect(404);
  });
});

describe('comunidad', () => {
  test('publica, reacciona, comenta, edita y borra', async () => {
    const user = await registerUser({ name: 'Rosa Quispe', specialty: 'Enfermera' });
    const post = await api()
      .post('/api/posts')
      .set(user.auth)
      .send({ kind: 'seeking', body: 'Busco trabajo en Sucre' })
      .expect(201);
    assert.equal(post.body.author.id, user.user.id);
    assert.equal(post.body.author.subtitle, 'Enfermera');

    let res = await api().post(`/api/posts/${post.body.id}/likes`).set(user.auth).expect(200);
    assert.deepEqual(res.body.likedBy, [user.user.id]);
    res = await api().post(`/api/posts/${post.body.id}/likes`).set(user.auth).expect(200);
    assert.deepEqual(res.body.likedBy, []);

    res = await api()
      .post(`/api/posts/${post.body.id}/comments`)
      .set(user.auth)
      .send({ body: '¡Suerte!' })
      .expect(201);
    assert.equal(res.body.comments.length, 1);

    res = await api()
      .patch(`/api/posts/${post.body.id}`)
      .set(user.auth)
      .send({ body: 'Busco trabajo en Sucre o Potosí' })
      .expect(200);
    assert.equal(res.body.body, 'Busco trabajo en Sucre o Potosí');

    const other = await registerUser();
    await api().delete(`/api/posts/${post.body.id}`).set(other.auth).expect(403);
    await api().delete(`/api/posts/${post.body.id}`).set(user.auth).expect(204);
    const all = await api().get('/api/posts').expect(200);
    assert.ok(!all.body.some((p) => p.id === post.body.id));
  });

  test('un profesional publica como su emprendimiento', async () => {
    const owner = await registerOwner('Café del Sol');
    const storeId = owner.stores[0].id;
    const asPerson = await api()
      .post('/api/posts')
      .set(owner.auth)
      .send({ kind: 'offering', body: 'Hola' })
      .expect(201);
    assert.equal(asPerson.body.author.id, owner.user.id);
    const intruder = await registerOwner('Otra');
    await api()
      .post('/api/posts')
      .set(intruder.auth)
      .send({ kind: 'offering', body: 'Hola', asStoreId: storeId })
      .expect(403);
    const post = await api()
      .post('/api/posts')
      .set(owner.auth)
      .send({ kind: 'offering', body: 'Nuevo menú', asStoreId: storeId })
      .expect(201);
    assert.equal(post.body.author.id, `store:${storeId}`);
    assert.equal(post.body.author.role, 'Emprendimiento');
    await api()
      .delete(`/api/posts/${post.body.id}?asStoreId=${storeId}`)
      .set(owner.auth)
      .expect(204);
  });

  test('valida el largo del mensaje', async () => {
    const user = await registerUser();
    await api()
      .post('/api/posts')
      .set(user.auth)
      .send({ kind: 'news', body: 'x'.repeat(3001) })
      .expect(400);
    await api().post('/api/posts').set(user.auth).send({ kind: 'news', body: '   ' }).expect(400);
  });
});
