const { pool } = require('../config/db');
const { admin, isProd } = require('../config');
const { hashPassword } = require('../middleware/auth');

// Pehli baar server chalne par: default plans aur pehla admin bana deta hai
async function bootstrap() {
  await pool.query(`INSERT IGNORE INTO plans (code, name, price_inr, months) VALUES ('monthly', 'Monthly', 999, 1), ('yearly', 'Yearly', 9999, 12)`);

  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM admins');
  if (n > 0) return { created: false };

  if (isProd && (admin.password === 'admin123' || admin.password.length < 10)) {
    throw Object.assign(new Error('Production me ADMIN_PASSWORD kam se kam 10 characters ka aur "admin123" se alag hona chahiye (.env check karo).'), { fatal: true });
  }
  await pool.execute('INSERT INTO admins (email, name, password_hash, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())',
    [admin.email, 'Admin', await hashPassword(admin.password)]);
  return { created: true, email: admin.email };
}

module.exports = { bootstrap };
