// Naya admin banao ya purane admin ka password reset karo:
//   npm run create-admin -- email@example.com "NayaPassword123"
const { pool, initDatabase } = require('../src/config/db');
const { hashPassword } = require('../src/middleware/auth');

(async () => {
  const [email, password] = [String(process.argv[2] || '').trim().toLowerCase(), process.argv[3]];
  if (!/^\S+@\S+\.\S+$/.test(email) || !password || password.length < 10) {
    console.error('Use: npm run create-admin -- email@example.com "password-kam-se-kam-10-characters"');
    process.exit(1);
  }
  await initDatabase();
  const hash = await hashPassword(password);
  await pool.execute(
    'INSERT INTO admins (email, name, password_hash, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
    [email, 'Admin', hash]);
  await pool.execute("DELETE FROM sessions WHERE role = 'admin'");
  console.log('Admin ready:', email);
  await pool.end();
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
