import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, closePool, demoLogin, registerUser, resetDatabase } from './helpers.js';

before(resetDatabase);
after(closePool);

describe('registro e ingreso', () => {
  test('registra, ingresa y devuelve el perfil sin la contraseña', async () => {
    const { user, auth } = await registerUser({ name: 'Ana Pérez', city: 'Sucre' });
    assert.equal(user.name, 'Ana Pérez');
    assert.equal(user.role, 'seeker');
    assert.equal(user.password, undefined);
    assert.equal(user.passwordHash, undefined);

    const me = await api().get('/api/me').set(auth).expect(200);
    assert.equal(me.body.city, 'Sucre');

    const login = await api()
      .post('/api/auth/login')
      .send({ email: user.email.toUpperCase(), password: 'secreto123' })
      .expect(200);
    assert.ok(login.body.token);
  });

  test('no permite dos cuentas con el mismo correo', async () => {
    const { user } = await registerUser();
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Otra', email: user.email, password: 'secreto123', role: 'tourist' })
      .expect(409);
    assert.match(res.body.error, /ya está registrado/);
  });

  test('rechaza credenciales incorrectas con un mensaje genérico', async () => {
    const { user } = await registerUser();
    const wrong = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'otra-clave' })
      .expect(401);
    const missing = await api()
      .post('/api/auth/login')
      .send({ email: 'nadie@correo.bo', password: 'otra-clave' })
      .expect(401);
    assert.equal(wrong.body.error, missing.body.error);
  });

  test('valida los datos de registro', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'X', email: 'no-es-correo', password: '123', role: 'seeker' })
      .expect(400);
    assert.ok(res.body.error);
    assert.ok(res.body.details.length >= 2);
  });

  test('exige sesión válida', async () => {
    await api().get('/api/me').expect(401);
    await api().get('/api/me').set('Authorization', 'Bearer token-falso').expect(401);
  });

  test('ingreso de demostración por rol', async () => {
    const { user } = await demoLogin('employer');
    assert.equal(user.id, 'demo_employer');
    assert.equal(user.companyName, 'AndinaTech S.R.L.');
  });
});

describe('perfil', () => {
  test('actualiza campos editables e ignora los protegidos', async () => {
    const { auth } = await registerUser();
    const res = await api()
      .patch('/api/me')
      .set(auth)
      .send({
        name: 'Nombre Nuevo',
        skills: ['Flutter', 'SQL'],
        department: 'Oruro',
        role: 'employer',
        isEmployerVerified: true,
        rating: 5,
      })
      .expect(200);
    assert.equal(res.body.name, 'Nombre Nuevo');
    assert.deepEqual(res.body.skills, ['Flutter', 'SQL']);
    assert.equal(res.body.role, 'seeker');
    assert.equal(res.body.isEmployerVerified, false);
    assert.equal(res.body.rating, null);
  });

  test('guarda y quita la foto', async () => {
    const { auth } = await registerUser();
    const photo = Buffer.from('foto').toString('base64');
    let res = await api().patch('/api/me').set(auth).send({ photoBase64: photo }).expect(200);
    assert.equal(res.body.photoBase64, photo);
    res = await api().patch('/api/me').set(auth).send({ photoBase64: null }).expect(200);
    assert.equal(res.body.photoBase64, null);
  });

  test('cambia la contraseña verificando la anterior', async () => {
    const { user, auth } = await registerUser();
    await api()
      .put('/api/me/password')
      .set(auth)
      .send({ oldPassword: 'mala', newPassword: 'nueva-clave' })
      .expect(401);
    await api()
      .put('/api/me/password')
      .set(auth)
      .send({ oldPassword: 'secreto123', newPassword: 'nueva-clave' })
      .expect(204);
    await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'nueva-clave' })
      .expect(200);
  });

  test('lista perfiles públicos por rol sin datos privados', async () => {
    const { auth } = await registerUser({ role: 'serviceSeeker', taxId: '123' });
    await api().patch('/api/me').set(auth).send({ isProfilePublic: false }).expect(200);
    const res = await api().get('/api/profiles?role=serviceSeeker').expect(200);
    assert.ok(res.body.length >= 5);
    assert.ok(res.body.every((p) => p.role === 'serviceSeeker' && p.isProfilePublic));
    assert.ok(res.body.every((p) => p.taxId === undefined));
  });
});
