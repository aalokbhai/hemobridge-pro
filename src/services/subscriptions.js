const { pool } = require('../config/db');
const { graceDays } = require('../config');
const { utcMs, sqlTime, ISO } = require('../utils/helpers');

const DAY = 864e5;

// ends (UTC string) + now -> 'none' | 'active' | 'grace' | 'expired'
function stateFrom(ends, nowMs = Date.now()) {
  const e = utcMs(ends);
  if (!e) return 'none';
  if (nowMs <= e) return 'active';
  if (nowMs <= e + graceDays * DAY) return 'grace';
  return 'expired';
}

// Ek hospital ka subscription status (plan khatam hone ki date sab active subscriptions me sabse door wali hoti hai)
async function getState(hospitalId) {
  const [[row]] = await pool.execute(
    `SELECT s.ends_at AS ends, ${ISO('s.ends_at')} AS ends_iso, p.name AS plan_name, p.code AS plan_code
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.hospital_id = ? AND s.status = 'active'
      ORDER BY s.ends_at DESC LIMIT 1`, [hospitalId]);
  if (!row) return { state: 'none', ends: null, daysLeft: 0, plan: null, graceDays };
  const state = stateFrom(row.ends);
  const daysLeft = Math.max(0, Math.ceil((utcMs(row.ends) - Date.now()) / DAY));
  return { state, ends: row.ends_iso, daysLeft, plan: row.plan_name, planCode: row.plan_code, graceDays };
}

// Pending subscription ko chalu karta hai. Agar pehle se plan chal raha hai to naya plan uske baad se shuru hota hai.
async function activate(conn, subscriptionId) {
  const [[s]] = await conn.query(
    'SELECT s.id, s.hospital_id, p.months FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.id = ?', [subscriptionId]);
  if (!s) throw new Error('subscription not found');
  const [[m]] = await conn.query("SELECT MAX(ends_at) AS e FROM subscriptions WHERE hospital_id = ? AND status = 'active'", [s.hospital_id]);
  const start = Math.max(Date.now(), utcMs(m.e) || 0);
  await conn.query("UPDATE subscriptions SET status = 'active', starts_at = ? WHERE id = ?", [sqlTime(start), s.id]);
  await conn.query('UPDATE subscriptions SET ends_at = DATE_ADD(starts_at, INTERVAL ? MONTH) WHERE id = ?', [s.months, s.id]);
}

module.exports = { stateFrom, getState, activate };
