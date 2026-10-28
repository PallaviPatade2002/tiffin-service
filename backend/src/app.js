const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { sign, requireAuth } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['pending', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];

// ---------- Auth ----------
app.post('/api/auth/register', (req, res) => {
  const { name, phone, password, address } = req.body;
  if (!name || !phone || !password || password.length < 6) {
    return res.status(400).json({ error: 'name, phone and password (min 6 chars) required' });
  }
  if (db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)) {
    return res.status(409).json({ error: 'Phone already registered' });
  }
  const r = db
    .prepare('INSERT INTO users (name, phone, password_hash, address) VALUES (?,?,?,?)')
    .run(name, phone, bcrypt.hashSync(password, 10), address || null);
  const user = { id: Number(r.lastInsertRowid), role: 'customer' };
  res.status(201).json({ token: sign(user), user: { ...user, name, phone } });
});

app.post('/api/auth/login', (req, res) => {
  const { phone, password } = req.body;
  const u = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!u || !bcrypt.compareSync(password || '', u.password_hash)) {
    return res.status(401).json({ error: 'Wrong phone or password' });
  }
  res.json({ token: sign(u), user: { id: u.id, name: u.name, phone: u.phone, role: u.role } });
});

// ---------- Menu ----------
app.get('/api/menu', (req, res) => {
  res.json(db.prepare('SELECT * FROM menu_items WHERE available = 1 ORDER BY meal_type, name').all());
});

app.get('/api/menu/all', requireAuth('admin'), (req, res) => {
  res.json(db.prepare('SELECT * FROM menu_items ORDER BY meal_type, name').all());
});

app.post('/api/menu', requireAuth('admin'), (req, res) => {
  const { name, description, price, meal_type, is_veg } = req.body;
  if (!name || !(price >= 0)) return res.status(400).json({ error: 'name and price required' });
  const r = db
    .prepare('INSERT INTO menu_items (name, description, price, meal_type, is_veg) VALUES (?,?,?,?,?)')
    .run(name, description || null, price, meal_type || 'lunch', is_veg === false ? 0 : 1);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/menu/:id', requireAuth('admin'), (req, res) => {
  const cur = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const m = { ...cur, ...req.body };
  db.prepare(
    'UPDATE menu_items SET name=?, description=?, price=?, meal_type=?, is_veg=?, available=? WHERE id=?'
  ).run(m.name, m.description, m.price, m.meal_type, m.is_veg ? 1 : 0, m.available ? 1 : 0, cur.id);
  res.json({ ok: true });
});

// ---------- Orders ----------
app.post('/api/orders', requireAuth('customer'), (req, res) => {
  const { items, order_date, address } = req.body;
  if (!Array.isArray(items) || !items.length || !DATE_RE.test(order_date || '')) {
    return res.status(400).json({ error: 'items and order_date (YYYY-MM-DD) required' });
  }
  const user = db.prepare('SELECT address FROM users WHERE id = ?').get(req.user.id);
  const deliverTo = address || user.address;
  if (!deliverTo) return res.status(400).json({ error: 'address required' });

  let total = 0;
  const lines = [];
  for (const it of items) {
    const m = db.prepare('SELECT * FROM menu_items WHERE id = ? AND available = 1').get(it.menu_item_id);
    if (!m || !Number.isInteger(it.qty) || it.qty <= 0) {
      return res.status(400).json({ error: 'Invalid item ' + it.menu_item_id });
    }
    total += m.price * it.qty;
    lines.push({ id: m.id, qty: it.qty, price: m.price });
  }

  db.exec('BEGIN');
  try {
    const o = db
      .prepare('INSERT INTO orders (user_id, order_date, address, total) VALUES (?,?,?,?)')
      .run(req.user.id, order_date, deliverTo, total);
    const ins = db.prepare('INSERT INTO order_items (order_id, menu_item_id, qty, price) VALUES (?,?,?,?)');
    for (const l of lines) ins.run(o.lastInsertRowid, l.id, l.qty, l.price);
    db.exec('COMMIT');
    res.status(201).json({ id: Number(o.lastInsertRowid), total });
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
});

app.get('/api/orders', requireAuth(), (req, res) => {
  const base = `SELECT o.*, u.name AS customer_name, u.phone AS customer_phone FROM orders o
                JOIN users u ON u.id = o.user_id`;
  let rows;
  if (req.user.role === 'customer') {
    rows = db.prepare(base + ' WHERE o.user_id = ? ORDER BY o.id DESC').all(req.user.id);
  } else if (req.user.role === 'delivery') {
    rows = db.prepare(base + ' WHERE o.delivery_boy_id = ? ORDER BY o.id DESC').all(req.user.id);
  } else {
    const { date } = req.query;
    rows = date
      ? db.prepare(base + ' WHERE o.order_date = ? ORDER BY o.id DESC').all(date)
      : db.prepare(base + ' ORDER BY o.id DESC').all();
  }
  const itemsStmt = db.prepare(
    `SELECT oi.qty, oi.price, m.name FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id
     WHERE oi.order_id = ?`
  );
  res.json(rows.map((o) => ({ ...o, items: itemsStmt.all(o.id) })));
});

app.patch('/api/orders/:id', requireAuth('admin', 'delivery'), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Not found' });
  const { status, payment_status, delivery_boy_id } = req.body;

  if (req.user.role === 'delivery') {
    if (o.delivery_boy_id !== req.user.id) return res.status(403).json({ error: 'Not your delivery' });
    if (!['out_for_delivery', 'delivered'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, o.id);
    return res.json({ ok: true });
  }

  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (payment_status && !['paid', 'unpaid'].includes(payment_status)) {
    return res.status(400).json({ error: 'Invalid payment_status' });
  }
  db.prepare('UPDATE orders SET status=?, payment_status=?, delivery_boy_id=? WHERE id=?').run(
    status ?? o.status,
    payment_status ?? o.payment_status,
    delivery_boy_id ?? o.delivery_boy_id,
    o.id
  );
  res.json({ ok: true });
});

app.post('/api/orders/:id/cancel', requireAuth('customer'), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!o) return res.status(404).json({ error: 'Not found' });
  if (o.status !== 'pending') return res.status(400).json({ error: 'Only pending orders can be cancelled' });
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(o.id);
  res.json({ ok: true });
});

// ---------- Subscriptions ----------
app.post('/api/subscriptions', requireAuth('customer'), (req, res) => {
  const { menu_item_id, start_date, end_date } = req.body;
  if (!DATE_RE.test(start_date || '') || !DATE_RE.test(end_date || '') || end_date < start_date) {
    return res.status(400).json({ error: 'Valid start_date and end_date (YYYY-MM-DD) required' });
  }
  if (!db.prepare('SELECT id FROM menu_items WHERE id = ? AND available = 1').get(menu_item_id)) {
    return res.status(400).json({ error: 'Invalid menu item' });
  }
  const r = db
    .prepare('INSERT INTO subscriptions (user_id, menu_item_id, start_date, end_date) VALUES (?,?,?,?)')
    .run(req.user.id, menu_item_id, start_date, end_date);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

app.get('/api/subscriptions', requireAuth('customer', 'admin'), (req, res) => {
  const base = `SELECT s.*, m.name AS item_name, m.price, u.name AS customer_name, u.phone AS customer_phone
                FROM subscriptions s JOIN menu_items m ON m.id = s.menu_item_id JOIN users u ON u.id = s.user_id`;
  res.json(
    req.user.role === 'admin'
      ? db.prepare(base + ' ORDER BY s.id DESC').all()
      : db.prepare(base + ' WHERE s.user_id = ? ORDER BY s.id DESC').all(req.user.id)
  );
});

app.patch('/api/subscriptions/:id', requireAuth('customer', 'admin'), (req, res) => {
  const s = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(req.params.id);
  if (!s || (req.user.role === 'customer' && s.user_id !== req.user.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!['active', 'paused', 'ended'].includes(req.body.status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  db.prepare('UPDATE subscriptions SET status = ? WHERE id = ?').run(req.body.status, s.id);
  res.json({ ok: true });
});

// Creates one pending order per active subscription for the given date (skips ones already created).
app.post('/api/subscriptions/generate', requireAuth('admin'), (req, res) => {
  const { date } = req.body;
  if (!DATE_RE.test(date || '')) return res.status(400).json({ error: 'date (YYYY-MM-DD) required' });
  const subs = db
    .prepare(
      `SELECT s.*, m.price, u.address FROM subscriptions s
       JOIN menu_items m ON m.id = s.menu_item_id JOIN users u ON u.id = s.user_id
       WHERE s.status = 'active' AND s.start_date <= ? AND s.end_date >= ?
         AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.subscription_id = s.id AND o.order_date = ?)`
    )
    .all(date, date, date);
  let created = 0;
  let skipped = 0;
  db.exec('BEGIN');
  try {
    for (const s of subs) {
      if (!s.address) {
        skipped++;
        continue;
      }
      const o = db
        .prepare('INSERT INTO orders (user_id, order_date, address, total, subscription_id) VALUES (?,?,?,?,?)')
        .run(s.user_id, date, s.address, s.price, s.id);
      db.prepare('INSERT INTO order_items (order_id, menu_item_id, qty, price) VALUES (?,?,1,?)').run(
        o.lastInsertRowid,
        s.menu_item_id,
        s.price
      );
      created++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ created, skipped_no_address: skipped });
});

// ---------- Staff (admin) ----------
app.post('/api/delivery-boys', requireAuth('admin'), (req, res) => {
  const { name, phone, password } = req.body;
  if (!name || !phone || !password || password.length < 6) {
    return res.status(400).json({ error: 'name, phone and password (min 6 chars) required' });
  }
  if (db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)) {
    return res.status(409).json({ error: 'Phone already registered' });
  }
  const r = db
    .prepare("INSERT INTO users (name, phone, password_hash, role) VALUES (?,?,?,'delivery')")
    .run(name, phone, bcrypt.hashSync(password, 10));
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// ---------- Reports (admin) ----------
app.get('/api/reports/summary', requireAuth('admin'), (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM
  const like = month + '%';
  res.json({
    month,
    orders: db.prepare("SELECT COUNT(*) c FROM orders WHERE order_date LIKE ? AND status != 'cancelled'").get(like).c,
    income: db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE order_date LIKE ? AND payment_status='paid'").get(like).s,
    pending_payments: db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE order_date LIKE ? AND payment_status='unpaid' AND status!='cancelled'").get(like).s,
  });
});

app.get('/api/delivery-boys', requireAuth('admin'), (req, res) => {
  res.json(db.prepare("SELECT id, name, phone FROM users WHERE role = 'delivery'").all());
});

// Serve the built frontend (single-server deploy)
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;
