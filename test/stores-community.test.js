import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, closePool, registerOwner, registerUser, resetDatabase } from './helpers.js';

before(resetDatabase);
after(closePool);

describe('emprendimientos', () => {
  test('lista las tiendas sin revelar el usuario del dueño', async () => {
    const res = await api().get('/api/stores').expect(200);
    assert.equal(res.body.length, 6);
    assert.ok(res.body.every((s) => s.ownerId === null));
    const marta = await api().get('/api/stores/tortas-y-empanadas-marta').expect(200);
    assert.equal(marta.body.products.length, 4);
  });

  test('registro, varias tiendas por cuenta y slugs únicos', async () => {
    const owner = await registerOwner('Salteñas Don Juan');
    assert.equal(owner.stores.length, 1);
    assert.equal(owner.stores[0].publicSlug, 'saltenas-don-juan-2');
    assert.equal(owner.stores[0].ownerId, owner.owner.username);

    const second = await api()
      .post('/api/owners/me/stores')
      .set(owner.auth)
      .send({ name: 'Segunda tienda', category: 'Artesanía', delivery: true })
      .expect(201);
    assert.equal(second.body.category, 'Artesanía');

    const updated = await api()
      .put(`/api/owners/me/stores/${second.body.id}`)
      .set(owner.auth)
      .send({ hours: 'Lun–Vie 9–18', products: [{ name: 'Aguayo', price: 'Bs 200' }] })
      .expect(200);
    assert.equal(updated.body.hours, 'Lun–Vie 9–18');
    assert.equal(updated.body.category, 'Artesanía');
    assert.equal(updated.body.products[0].name, 'Aguayo');

    const me = await api().get('/api/owners/me').set(owner.auth).expect(200);
    assert.equal(me.body.stores.length, 2);

    const login = await api()
      .post('/api/owners/login')
      .send({ username: owner.owner.username, password: 'secreto123' })
      .expect(200);
    assert.equal(login.body.stores.length, 2);
  });

  test('un dueño no edita tiendas ajenas y un usuario normal no entra aquí', async () => {
    const a = await registerOwner('Tienda A');
    const b = await registerOwner('Tienda B');
    await api()
      .put(`/api/owners/me/stores/${a.stores[0].id}`)
      .set(b.auth)
      .send({ name: 'Robada' })
      .expect(403);
    const user = await registerUser();
    await api().get('/api/owners/me').set(user.auth).expect(403);
  });

  test('ingreso demo como emprendedora', async () => {
    const res = await api().post('/api/owners/demo').expect(200);
    assert.equal(res.body.owner.username, 'marta');
    assert.equal(res.body.stores[0].id, 'e1');
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

  test('un emprendedor publica como su tienda', async () => {
    const owner = await registerOwner('Café del Sol');
    const storeId = owner.stores[0].id;
    await api()
      .post('/api/posts')
      .set(owner.auth)
      .send({ kind: 'offering', body: 'Nuevo menú' })
      .expect(400);
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
