process.env.DB_FILE = ':memory:';
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const db = require('../src/db');

let server, base;
test.before(
  () =>
    new Promise((resolve) => {
      server = app.listen(0, () => {
        base = 'http://localhost:' + server.address().port;
        resolve();
      });
    })
);
test.after(() => server.close());

const call = async (method, path, body, token) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

test('customer order flow + admin controls', async () => {
  db.prepare("INSERT INTO users (name, phone, password_hash, role) VALUES ('Owner','1',?,'admin')").run(
    bcrypt.hashSync('secret1', 4)
  );

  const adm = (await call('POST', '/api/auth/login', { phone: '1', password: 'secret1' })).body.token;
  const m = await call('POST', '/api/menu', { name: 'Thali', price: 90 }, adm);
  assert.equal(m.status, 201);

  const reg = await call('POST', '/api/auth/register', { name: 'A', phone: '2', password: 'abcdef', address: 'Pune' });
  assert.equal(reg.status, 201);
  const cust = reg.body.token;

  assert.equal((await call('POST', '/api/menu', { name: 'x', price: 1 }, cust)).status, 403);

  const o = await call('POST', '/api/orders', { order_date: '2026-11-01', items: [{ menu_item_id: m.body.id, qty: 2 }] }, cust);
  assert.equal(o.status, 201);
  assert.equal(o.body.total, 180);

  assert.equal((await call('PATCH', '/api/orders/' + o.body.id, { payment_status: 'paid' }, adm)).status, 200);
  const rep = await call('GET', '/api/reports/summary?month=2026-11', null, adm);
  assert.deepEqual([rep.body.orders, rep.body.income], [1, 180]);

  assert.equal((await call('GET', '/api/orders', null, cust)).body[0].items[0].name, 'Thali');
});

test('subscriptions, cancel, delivery staff', async () => {
  const adm = (await call('POST', '/api/auth/login', { phone: '1', password: 'secret1' })).body.token;
  const menu = (await call('GET', '/api/menu')).body;
  const cust = (await call('POST', '/api/auth/register', { name: 'B', phone: '3', password: 'abcdef', address: 'Pune' })).body.token;

  const sub = await call('POST', '/api/subscriptions', { menu_item_id: menu[0].id, start_date: '2026-12-01', end_date: '2026-12-31' }, cust);
  assert.equal(sub.status, 201);
  assert.equal((await call('POST', '/api/subscriptions', { menu_item_id: menu[0].id, start_date: '2026-12-05', end_date: '2026-12-01' }, cust)).status, 400);

  assert.equal((await call('POST', '/api/subscriptions/generate', { date: '2026-12-10' }, adm)).body.created, 1);
  assert.equal((await call('POST', '/api/subscriptions/generate', { date: '2026-12-10' }, adm)).body.created, 0); // no duplicates
  assert.equal((await call('POST', '/api/subscriptions/generate', { date: '2027-02-01' }, adm)).body.created, 0); // out of range

  await call('PATCH', '/api/subscriptions/' + sub.body.id, { status: 'paused' }, cust);
  assert.equal((await call('POST', '/api/subscriptions/generate', { date: '2026-12-11' }, adm)).body.created, 0);

  const orders = (await call('GET', '/api/orders', null, cust)).body;
  assert.equal((await call('POST', `/api/orders/${orders[0].id}/cancel`, null, cust)).status, 200);
  assert.equal((await call('POST', `/api/orders/${orders[0].id}/cancel`, null, cust)).status, 400);

  assert.equal((await call('POST', '/api/delivery-boys', { name: 'D', phone: '4', password: 'abcdef' }, adm)).status, 201);
  assert.equal((await call('POST', '/api/delivery-boys', { name: 'D', phone: '4', password: 'abcdef' }, adm)).status, 409);
  assert.equal((await call('GET', '/api/delivery-boys', null, adm)).body.length, 1);
});
