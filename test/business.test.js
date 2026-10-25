import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, closePool, demoLogin, registerUser, resetDatabase } from './helpers.js';

before(resetDatabase);
after(closePool);

const hotel = {
  role: 'employer',
  businessSector: 'hospedaje',
  businessType: 'hotel_independiente',
};

describe('registro por rol y rubro', () => {
  test('una empresa se registra con rubro y tipo', async () => {
    const { user, auth } = await registerUser({
      ...hotel,
      name: 'Hotel Prueba',
      companyName: 'Hotel Prueba',
      city: 'Sucre',
      department: 'Chuquisaca',
    });
    assert.equal(user.businessSector, 'hospedaje');
    assert.equal(user.businessType, 'hotel_independiente');
    const business = await api().get('/api/me/business').set(auth).expect(200);
    assert.equal(business.body.layout, 'lodging');
    assert.equal(business.body.department, 'Chuquisaca');
  });

  test('sin rubro o con un tipo que no corresponde, no se registra', async () => {
    const base = { name: 'X', email: 'x@correo.bo', password: 'secreto123', role: 'employer' };
    await api().post('/api/auth/register').send(base).expect(400);
    const res = await api()
      .post('/api/auth/register')
      .send({ ...base, businessSector: 'hospedaje', businessType: 'agencia_viajes' })
      .expect(400);
    assert.match(res.body.error, /no corresponde/);
  });

  test('un turista se registra y entra con la demo', async () => {
    const { user } = await registerUser({ role: 'tourist' });
    assert.equal(user.role, 'tourist');
    const demo = await demoLogin('tourist');
    assert.equal(demo.user.name, 'Lucía Fernández');
  });

  test('el catálogo de rubros incluye hospedaje y turismo con sus tipos', async () => {
    const res = await api().get('/api/catalog/business-sectors').expect(200);
    const types = (id) => res.body.find((s) => s.id === id).types.map((t) => t.id);
    assert.ok(types('hospedaje').includes('cadena_hotelera'));
    assert.ok(types('turismo').includes('agencia_viajes'));
    assert.ok(types('turismo').includes('guias_turisticos'));
  });
});

describe('perfil de negocio y ofertas', () => {
  test('el hotel edita sus datos de rubro y publica habitaciones, no paquetes', async () => {
    const { auth } = await registerUser({ ...hotel, companyName: 'Hotel Sol' });
    const updated = await api()
      .put('/api/me/business')
      .set(auth)
      .send({
        tagline: 'Frente a la plaza',
        department: 'Potosí',
        province: 'Tomas Frias',
        city: 'Potosí',
        attributes: { stars: 3, amenities: ['Wi-Fi', 'Desayuno'], checkIn: '14:00' },
      })
      .expect(200);
    assert.equal(updated.body.attributes.stars, 3);

    await api()
      .put('/api/me/business')
      .set(auth)
      .send({ businessType: 'agencia_viajes' })
      .expect(400);

    const room = await api()
      .post('/api/me/offerings')
      .set(auth)
      .send({ kind: 'room', title: 'Doble', price: 'Bs 250', priceAmount: 250, capacity: 2 })
      .expect(201);
    assert.equal(room.body.department, 'Potosí', 'toma el lugar del negocio');
    await api()
      .post('/api/me/offerings')
      .set(auth)
      .send({ kind: 'package', title: 'Tour' })
      .expect(400);

    const page = await api().get(`/api/businesses/${room.body.ownerId}`).expect(200);
    assert.equal(page.body.offerings.length, 1);
    assert.equal(page.body.business.priceFrom, 250);

    await api()
      .put(`/api/me/offerings/${room.body.id}`)
      .set(auth)
      .send({ isActive: false })
      .expect(200);
    const hidden = await api().get(`/api/businesses/${room.body.ownerId}`).expect(200);
    assert.equal(hidden.body.offerings.length, 0, 'lo inactivo no se muestra');
  });

  test('un profesional ofrece talleres y tours; un turista no publica', async () => {
    const pro = await registerUser({ department: 'Oruro', city: 'Oruro' });
    const taller = await api()
      .post('/api/me/offerings')
      .set(pro.auth)
      .send({ kind: 'workshop', title: 'Taller de máscaras de la Diablada', duration: '2 horas' })
      .expect(201);
    assert.equal(taller.body.department, 'Oruro');
    await api()
      .post('/api/me/offerings')
      .set(pro.auth)
      .send({ kind: 'room', title: 'X' })
      .expect(400);

    const tourist = await registerUser({ role: 'tourist' });
    await api()
      .post('/api/me/offerings')
      .set(tourist.auth)
      .send({ kind: 'tour', title: 'X' })
      .expect(400);
    await api().post('/api/me/promotions').set(tourist.auth).send({ title: 'Promo' }).expect(403);
  });

  test('nadie edita ofertas ni promociones ajenas', async () => {
    const a = await registerUser({ ...hotel });
    const b = await registerUser({ ...hotel });
    const room = await api()
      .post('/api/me/offerings')
      .set(a.auth)
      .send({ kind: 'room', title: 'Simple' })
      .expect(201);
    await api()
      .put(`/api/me/offerings/${room.body.id}`)
      .set(b.auth)
      .send({ title: 'Mía' })
      .expect(403);
    const promo = await api()
      .post('/api/me/promotions')
      .set(a.auth)
      .send({ title: 'Noche gratis', discount: '3x2' })
      .expect(201);
    await api().delete(`/api/me/promotions/${promo.body.id}`).set(b.auth).expect(403);
  });

  test('las promociones vencidas no se publican', async () => {
    const a = await registerUser({ ...hotel, department: 'Beni' });
    await api()
      .post('/api/me/promotions')
      .set(a.auth)
      .send({ title: 'Vieja', validUntil: '2020-01-01' })
      .expect(201);
    await api()
      .post('/api/me/promotions')
      .set(a.auth)
      .send({ title: 'Vigente', validUntil: '2099-01-01' })
      .expect(201);
    const res = await api().get('/api/promotions?q=vigente').expect(200);
    assert.deepEqual(
      res.body.map((p) => p.title),
      ['Vigente'],
    );
    const old = await api().get('/api/promotions?q=vieja').expect(200);
    assert.equal(old.body.length, 0);
  });
});

describe('consultas', () => {
  test('un turista consulta a una agencia y la agencia responde', async () => {
    const tourist = await registerUser({ role: 'tourist', name: 'Ana Turista' });
    const agency = await registerUser({
      role: 'employer',
      businessSector: 'turismo',
      businessType: 'agencia_viajes',
      companyName: 'Viajes Prueba',
    });
    const pkg = await api()
      .post('/api/me/offerings')
      .set(agency.auth)
      .send({ kind: 'package', title: 'Salar 3 días', price: 'Bs 1.200' })
      .expect(201);

    const sent = await api()
      .post('/api/inquiries')
      .set(tourist.auth)
      .send({
        toUserId: agency.user.id,
        offeringId: pkg.body.id,
        message: '¿Tienen cupo para 3 personas?',
        travelDate: '2099-07-15',
        people: 3,
      })
      .expect(201);
    assert.equal(sent.body.status, 'nueva');
    assert.equal(sent.body.offeringTitle, 'Salar 3 días');

    const inbox = await api().get('/api/me/inquiries').set(agency.auth).expect(200);
    assert.equal(inbox.body.length, 1);
    assert.equal(inbox.body[0].fromName, 'Ana Turista');

    await api()
      .patch(`/api/me/inquiries/${sent.body.id}`)
      .set(tourist.auth)
      .send({ reply: 'Me respondo solo' })
      .expect(403);
    const replied = await api()
      .patch(`/api/me/inquiries/${sent.body.id}`)
      .set(agency.auth)
      .send({ reply: 'Sí, hay cupo.' })
      .expect(200);
    assert.equal(replied.body.status, 'respondida');

    const mine = await api().get('/api/me/inquiries?box=sent').set(tourist.auth).expect(200);
    assert.equal(mine.body[0].reply, 'Sí, hay cupo.');
  });

  test('no se consulta a un turista ni con una oferta de otro negocio', async () => {
    const a = await registerUser({ role: 'tourist' });
    const b = await registerUser({ role: 'tourist' });
    await api()
      .post('/api/inquiries')
      .set(a.auth)
      .send({ toUserId: b.user.id, message: 'Hola, ¿qué tal?' })
      .expect(404);
    await api()
      .post('/api/inquiries')
      .set(a.auth)
      .send({
        toUserId: 'demo_biz_hotel_sucre',
        offeringId: 'demo_biz_agency_uyuni_offering_1',
        message: 'Hola hola',
      })
      .expect(400);
  });
});

describe('explorar como turista', () => {
  test('en Potosí aparece la agencia del salar, sus paquetes y su promoción', async () => {
    const res = await api().get('/api/explore?department=Potos%C3%AD').expect(200);
    assert.ok(res.body.businesses.some((b) => b.name === 'Uyuni Expediciones'));
    assert.ok(res.body.businesses.every((b) => b.department === 'Potosí'));
    const uyuni = res.body.offerings.filter((o) => o.ownerName === 'Uyuni Expediciones');
    assert.equal(uyuni.length, 2);
    assert.ok(res.body.promotions.some((p) => p.title === 'Reserva anticipada'));
  });

  test('una cadena aparece con sus habitaciones en las ciudades de sus sedes', async () => {
    const res = await api()
      .get('/api/explore?department=Cochabamba&category=hospedaje')
      .expect(200);
    assert.ok(res.body.businesses.some((b) => b.businessType === 'cadena_hotelera'));
    assert.ok(res.body.offerings.every((o) => o.kind === 'room'));
    assert.ok(res.body.offerings.length >= 3);
  });

  test('provincia, guías y talleres de profesionales', async () => {
    const copa = await api()
      .get('/api/explore?department=La%20Paz&province=Manco%20Kapac&category=gastronomia')
      .expect(200);
    assert.deepEqual(
      copa.body.businesses.map((b) => b.name),
      ['Sabores del Lago'],
    );
    assert.ok(copa.body.offerings.every((o) => o.kind === 'dish'));

    const guias = await api().get('/api/explore?category=guias&department=La%20Paz').expect(200);
    assert.ok(guias.body.businesses.some((b) => b.businessType === 'guias_turisticos'));
    assert.ok(guias.body.professionals.some((p) => p.name === 'Rodrigo Quispe'));
    assert.ok(guias.body.offerings.every((o) => o.kind === 'tour'));

    const talleres = await api().get('/api/explore?category=talleres').expect(200);
    assert.ok(talleres.body.offerings.some((o) => o.ownerName === 'Rosario Mamani'));
    assert.ok(talleres.body.professionals.some((p) => p.name === 'Rosario Mamani'));
  });

  test('busca por texto sin tildes', async () => {
    const res = await api().get('/api/explore?q=trucha').expect(200);
    assert.ok(res.body.offerings.some((o) => o.title.includes('Trucha')));
    const salar = await api().get('/api/businesses?q=salar%20uyuni').expect(200);
    assert.equal(salar.body[0].name, 'Uyuni Expediciones');
  });
});
