const bcrypt = require('bcryptjs');
const db = require('./db');

const addUser = (name, phone, role, address) =>
  db.prepare('INSERT OR IGNORE INTO users (name, phone, password_hash, role, address) VALUES (?,?,?,?,?)')
    .run(name, phone, bcrypt.hashSync('123456', 10), role, address);

addUser('Owner', '9000000001', 'admin', null);
addUser('Delivery Dada', '9000000002', 'delivery', null);
addUser('Demo Customer', '9000000003', 'customer', 'Shivaji Nagar, Pune');

if (!db.prepare('SELECT COUNT(*) c FROM menu_items').get().c) {
  const ins = db.prepare('INSERT INTO menu_items (name, description, price, meal_type, is_veg) VALUES (?,?,?,?,?)');
  ins.run('Poha', 'Kanda poha with sev and lemon', 40, 'breakfast', 1);
  ins.run('Veg Thali', '3 chapati, bhaji, dal, rice, salad', 90, 'lunch', 1);
  ins.run('Chicken Thali', '2 chapati, chicken rassa, rice', 140, 'lunch', 0);
  ins.run('Varan Bhat Thali', 'Varan, bhat, bhaji, poli, lonche', 80, 'dinner', 1);
}
console.log('Seeded. Logins (password 123456): admin 9000000001, delivery 9000000002, customer 9000000003');
