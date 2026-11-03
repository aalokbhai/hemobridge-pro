const crypto = require('crypto');
const { promisify } = require('util');
const { pool } = require('../config/db');
const { sessionHours } = require('../config');
const { getState } = require('../services/subscriptions');

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1 };

// ---------- Password hashing (Node ka built-in scrypt, koi extra package nahi) ----------
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password), salt, 64, SCRYPT);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [alg, saltHex, keyHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const key = await scrypt(String(password), Buffer.from(saltHex, 'hex'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(key, expected);
}

// User na mile tab bhi same time lage (account guess karna mushkil)
const DUMMY_HASH = 'scrypt$' + '00'.repeat(16) + '$' + '00'.repeat(64);
const burn = password => verifyPassword(password, DUMMY_HASH).catch(() => false);

// ---------- Sessions (database me, isliye server restart par logout nahi hota) ----------
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');

async function createSession(role, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    'INSERT INTO sessions (token_hash, role, user_id, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR))',
    [sha(token), role, userId, sessionHours]
  );
  return token;
}

const bearer = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

async function destroySession(req) {
  const t = bearer(req);
  if (t) await pool.execute('DELETE FROM sessions WHERE token_hash = ?', [sha(t)]);
}

// Password badalne par baaki sab logins hata do
async function destroyOtherSessions(role, userId, req) {
  await pool.execute('DELETE FROM sessions WHERE role = ? AND user_id = ? AND token_hash <> ?', [role, userId, sha(bearer(req))]);
}

async function cleanupSessions() {
  await pool.execute('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()');
}

async function sessionUser(req, role) {
  const t = bearer(req);
  if (!t) return null;
  const [[row]] = await pool.execute(
    'SELECT user_id FROM sessions WHERE token_hash = ? AND role = ? AND expires_at > UTC_TIMESTAMP()', [sha(t), role]);
  return row ? row.user_id : null;
}

// ---------- Middlewares ----------
async function requireAdmin(req, res, next) {
  const id = await sessionUser(req, 'admin');
  if (!id) return res.status(401).json({ error: 'login required' });
  const [[admin]] = await pool.execute('SELECT id, email, name FROM admins WHERE id = ?', [id]);
  if (!admin) return res.status(401).json({ error: 'login required' });
  req.admin = admin;
  next();
}

// Hospital login hona chahiye (kisi bhi status me: pending / approved ...)
async function requireHospital(req, res, next) {
  const id = await sessionUser(req, 'hospital');
  if (!id) return res.status(401).json({ error: 'login required' });
  const [[h]] = await pool.execute(
    'SELECT id, name, license_no, contact_person, email, phone, city, address, status, status_note FROM hospitals WHERE id = ?', [id]);
  if (!h) return res.status(401).json({ error: 'login required' });
  req.hospital = h;
  next();
}

// Admin ne approve kiya hona chahiye
function requireApproved(req, res, next) {
  if (req.hospital.status !== 'approved')
    return res.status(403).json({ error: 'Your hospital account is ' + req.hospital.status + '.', code: 'not_approved' });
  next();
}

// Active (ya grace period wala) subscription chahiye
async function requireSubscription(req, res, next) {
  req.subscription = await getState(req.hospital.id);
  if (!['active', 'grace'].includes(req.subscription.state))
    return res.status(402).json({ error: 'An active subscription is required.', code: 'subscription_required' });
  next();
}

module.exports = {
  hashPassword, verifyPassword, burn, createSession, destroySession, destroyOtherSessions, cleanupSessions,
  requireAdmin, requireHospital, requireApproved, requireSubscription,
};
