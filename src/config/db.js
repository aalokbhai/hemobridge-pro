const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db: cfg } = require('./index');

if (!/^\w+$/.test(cfg.database)) throw new Error('DB_NAME me sirf letters, numbers aur _ allowed hai');

const pool = mysql.createPool({
  ...cfg,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // DATE / DATETIME columns 'YYYY-MM-DD ...' string ban kar aate hain
});

// Purane database me naya column jodta hai (agar pehle se hai to kuch nahi karta)
async function addColumn(conn, table, column, ddl) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );
  if (!rows.length) await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
}

// Database + tables apne aap bana deta hai (agar pehle se hain to kuch nahi karta).
async function initDatabase() {
  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, ssl: cfg.ssl,
    multipleStatements: true,
  });
  try {
    // Managed hosting me user ko CREATE DATABASE ki permission nahi hoti -> database pehle se bana ho to chalega
    try { await conn.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4`); } catch (e) { /* ignore */ }
    await conn.query(`USE \`${cfg.database}\``);
    await conn.query(fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8'));

    // Migrations (v3 database ko v4 me upgrade karte hain)
    await addColumn(conn, 'donors', 'hospital_consent', 'hospital_consent TINYINT(1) NOT NULL DEFAULT 0');
    await addColumn(conn, 'donors', 'consent_at', 'consent_at DATETIME NULL');
    await addColumn(conn, 'requests', 'hospital_id', 'hospital_id INT UNSIGNED NULL');
  } finally {
    await conn.end();
  }
}

module.exports = { pool, initDatabase };
