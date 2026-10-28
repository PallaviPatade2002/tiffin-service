const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const db = new DatabaseSync(process.env.DB_FILE || path.join(__dirname, '..', 'tiffin.db'));
db.exec('PRAGMA foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// migration for DBs created before orders.subscription_id existed
if (!db.prepare('PRAGMA table_info(orders)').all().some((c) => c.name === 'subscription_id')) {
  db.exec('ALTER TABLE orders ADD COLUMN subscription_id INTEGER REFERENCES subscriptions(id)');
}

module.exports = db;
