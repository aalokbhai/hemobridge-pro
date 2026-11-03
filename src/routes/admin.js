const router = require('express').Router();
const { pool } = require('../config/db');
const rateLimit = require('../middleware/rateLimit');
const { hashPassword, verifyPassword, burn, createSession, destroySession, destroyOtherSessions, requireAdmin } = require('../middleware/auth');
const { stateFrom, activate } = require('../services/subscriptions');
const { toCsv, clean, ISO } = require('../utils/helpers');
const config = require('../config');

const DONORS_SQL = `SELECT id, name, phone, email, city, blood_group AS bg, sex, dob, weight_kg AS wt, last_donation AS \`last\`, hospital_consent AS consent, ${ISO('created_at')} AS created FROM donors ORDER BY created_at DESC`;
const REQUESTS_SQL = `SELECT id, patient, blood_group AS bg, component AS comp, units, urgency, hospital, doctor, phone, city, status, matches, ${ISO('created_at')} AS created FROM requests ORDER BY created_at DESC`;

// POST /api/admin/login  { email, password }   (login ke liye auth nahi chahiye)
router.post('/login',
  rateLimit('alogin-ip', 15, 6e5),
  rateLimit('alogin-acct', 8, 6e5, req => (req.body || {}).email),
  async (req, res) => {
    const b = req.body || {};
    const [[a]] = await pool.execute('SELECT id, password_hash FROM admins WHERE email = ?', [clean(b.email).toLowerCase()]);
    const ok = a ? await verifyPassword(String(b.password || ''), a.password_hash) : await burn(String(b.password || ''));
    if (!ok) return res.status(401).json({ error: 'Wrong email or password.' });
    res.json({ token: await createSession('admin', a.id) });
  });

// Iske neeche sab routes admin-only
router.use(requireAdmin);

router.post('/logout', async (req, res) => { await destroySession(req); res.json({ ok: true }); });
router.get('/me', (req, res) => res.json(req.admin));

router.post('/password', async (req, res) => {
  const b = req.body || {};
  const [[a]] = await pool.execute('SELECT password_hash FROM admins WHERE id = ?', [req.admin.id]);
  if (!(await verifyPassword(String(b.current || ''), a.password_hash))) return res.status(400).json({ error: 'Current password is wrong.' });
  if (typeof b.next !== 'string' || b.next.length < 10 || b.next.length > 100) return res.status(400).json({ error: 'New password must be at least 10 characters.' });
  await pool.execute('UPDATE admins SET password_hash = ? WHERE id = ?', [await hashPassword(b.next), req.admin.id]);
  await destroyOtherSessions('admin', req.admin.id, req);
  res.json({ ok: true });
});

// ---------------- Overview ----------------
router.get('/overview', async (req, res) => {
  const one = async sql => (await pool.query(sql))[0][0].n;
  const [[rev]] = await pool.query("SELECT COALESCE(SUM(amount_inr), 0) AS total FROM payments WHERE status = 'confirmed'");
  res.json({
    hospitalsPending: await one("SELECT COUNT(*) AS n FROM hospitals WHERE status = 'pending'"),
    hospitalsApproved: await one("SELECT COUNT(*) AS n FROM hospitals WHERE status = 'approved'"),
    paymentsWaiting: await one("SELECT COUNT(*) AS n FROM payments WHERE status = 'submitted'"),
    activeSubscribers: await one("SELECT COUNT(DISTINCT hospital_id) AS n FROM subscriptions WHERE status = 'active' AND ends_at >= UTC_TIMESTAMP()"),
    expiringSoon: await one("SELECT COUNT(DISTINCT hospital_id) AS n FROM subscriptions WHERE status = 'active' AND ends_at BETWEEN UTC_TIMESTAMP() AND DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)"),
    revenue: rev.total,
    donors: await one('SELECT COUNT(*) AS n FROM donors'),
    donorsShared: await one('SELECT COUNT(*) AS n FROM donors WHERE hospital_consent = 1'),
    openRequests: await one("SELECT COUNT(*) AS n FROM requests WHERE status = 'open'"),
    totalRequests: await one('SELECT COUNT(*) AS n FROM requests'),
  });
});

// ---------------- Hospitals ----------------
router.get('/hospitals', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT h.id, h.name, h.license_no, h.contact_person, h.email, h.phone, h.city, h.address, h.status, h.status_note,
            ${ISO('h.created_at')} AS created,
            (SELECT ${ISO('MAX(s.ends_at)')} FROM subscriptions s WHERE s.hospital_id = h.id AND s.status = 'active') AS ends,
            (SELECT MAX(s.ends_at) FROM subscriptions s WHERE s.hospital_id = h.id AND s.status = 'active') AS ends_raw
       FROM hospitals h ORDER BY FIELD(h.status, 'pending', 'approved', 'suspended', 'rejected'), h.created_at DESC`);
  res.json(rows.map(({ ends_raw, ...h }) => ({ ...h, subState: stateFrom(ends_raw) })));
});

// PATCH /api/admin/hospitals/:id  { status: approved|rejected|suspended|pending, note }
router.patch('/hospitals/:id', async (req, res) => {
  const b = req.body || {};
  if (!['approved', 'rejected', 'suspended', 'pending'].includes(b.status)) return res.status(400).json({ error: 'bad status' });
  const [r] = await pool.execute(
    `UPDATE hospitals SET status = ?, status_note = ?, approved_at = IF(? = 'approved' AND approved_at IS NULL, UTC_TIMESTAMP(), approved_at) WHERE id = ?`,
    [b.status, clean(b.note, 255), b.status, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// POST /api/admin/hospitals/:id/grant  { plan_id }  -> bina payment ke plan chalu karna (free trial / offline payment)
router.post('/hospitals/:id/grant', async (req, res) => {
  const [[h]] = await pool.execute('SELECT id, status FROM hospitals WHERE id = ?', [req.params.id]);
  if (!h) return res.status(404).json({ error: 'not found' });
  if (h.status !== 'approved') return res.status(400).json({ error: 'Approve the hospital first.' });
  const [[plan]] = await pool.execute('SELECT id FROM plans WHERE id = ?', [parseInt((req.body || {}).plan_id, 10) || 0]);
  if (!plan) return res.status(400).json({ error: 'Choose a plan.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [s] = await conn.execute("INSERT INTO subscriptions (hospital_id, plan_id, status, created_at) VALUES (?, ?, 'pending', UTC_TIMESTAMP())", [h.id, plan.id]);
    await conn.execute(
      "INSERT INTO payments (hospital_id, subscription_id, amount_inr, method, reference, status, note, created_at, decided_at, decided_by) VALUES (?, ?, 0, 'admin_grant', 'ADMIN-GRANT', 'confirmed', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?)",
      [h.id, s.insertId, clean((req.body || {}).note, 255) || 'Granted by admin', req.admin.id]);
    await activate(conn, s.insertId);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  res.json({ ok: true });
});

// ---------------- Payments ----------------
router.get('/payments', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT pay.id, pay.amount_inr AS amount, pay.method, pay.reference, pay.status, pay.note, ${ISO('pay.created_at')} AS created,
            h.id AS hospital_id, h.name AS hospital, p.name AS plan, ${ISO('s.ends_at')} AS ends
       FROM payments pay JOIN hospitals h ON h.id = pay.hospital_id
       JOIN subscriptions s ON s.id = pay.subscription_id JOIN plans p ON p.id = s.plan_id
      ORDER BY FIELD(pay.status, 'submitted', 'confirmed', 'rejected'), pay.id DESC LIMIT 500`);
  res.json(rows);
});

// POST /api/admin/payments/:id/decision  { decision: confirm|reject, note }
router.post('/payments/:id/decision', async (req, res) => {
  const b = req.body || {};
  if (!['confirm', 'reject'].includes(b.decision)) return res.status(400).json({ error: 'bad decision' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[pay]] = await conn.execute('SELECT id, subscription_id, status FROM payments WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!pay) { await conn.rollback(); return res.status(404).json({ error: 'not found' }); }
    if (pay.status !== 'submitted') { await conn.rollback(); return res.status(409).json({ error: 'This payment was already decided.' }); }

    const confirm = b.decision === 'confirm';
    await conn.execute('UPDATE payments SET status = ?, note = ?, decided_at = UTC_TIMESTAMP(), decided_by = ? WHERE id = ?',
      [confirm ? 'confirmed' : 'rejected', clean(b.note, 255), req.admin.id, pay.id]);
    if (confirm) await activate(conn, pay.subscription_id);
    else await conn.execute("UPDATE subscriptions SET status = 'rejected' WHERE id = ?", [pay.subscription_id]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  res.json({ ok: true });
});

// ---------------- Plans ----------------
router.get('/plans', async (req, res) => {
  const [rows] = await pool.query('SELECT id, code, name, price_inr, months, active FROM plans ORDER BY months');
  res.json({ plans: rows, graceDays: config.graceDays, phoneLimit: config.phoneRevealLimit });
});

router.put('/plans/:id', async (req, res) => {
  const b = req.body || {}, price = parseInt(b.price_inr, 10);
  if (!(price >= 0 && price <= 10000000)) return res.status(400).json({ error: 'Enter a valid price.' });
  const [r] = await pool.execute('UPDATE plans SET price_inr = ?, active = ? WHERE id = ?', [price, b.active === false || b.active === 0 ? 0 : 1, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---------------- Donor access log ----------------
router.get('/access-log', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT l.id, ${ISO('l.created_at')} AS created, h.name AS hospital, l.action, l.donor_id, d.name AS donor, d.blood_group AS bg
       FROM donor_access_log l JOIN hospitals h ON h.id = l.hospital_id LEFT JOIN donors d ON d.id = l.donor_id
      ORDER BY l.id DESC LIMIT 300`);
  res.json(rows);
});

// ---------------- Donors / requests (pehle jaisa) ----------------
router.get('/data', async (req, res) => {
  const [[requests], [donors]] = await Promise.all([pool.query(REQUESTS_SQL), pool.query(DONORS_SQL)]);
  res.json({ requests, donors });
});

router.get('/export/donors.csv', async (req, res) => {
  const [rows] = await pool.query(DONORS_SQL);
  const head = ['Name', 'Phone', 'Email', 'City', 'Blood group', 'Sex', 'DOB', 'Weight', 'Last donation', 'Shared with hospitals', 'Registered'];
  res.type('text/csv; charset=utf-8').send(toCsv([head, ...rows.map(d => [d.name, d.phone, d.email, d.city, d.bg, d.sex, d.dob, d.wt, d.last, d.consent ? 'yes' : 'no', d.created])]));
});

router.get('/export/requests.csv', async (req, res) => {
  const [rows] = await pool.query(REQUESTS_SQL);
  const head = ['ID', 'Patient', 'Blood group', 'Component', 'Units', 'Urgency', 'Hospital', 'Doctor', 'Phone', 'City', 'Status', 'Matches', 'Created'];
  res.type('text/csv; charset=utf-8').send(toCsv([head, ...rows.map(r => [r.id, r.patient, r.bg, r.comp, r.units, r.urgency, r.hospital, r.doctor, r.phone, r.city, r.status, r.matches, r.created])]));
});

// PATCH /api/admin/requests/:id  { status: open | fulfilled | closed }
router.patch('/requests/:id', async (req, res) => {
  const status = (req.body || {}).status;
  if (!['open', 'fulfilled', 'closed'].includes(status)) return res.status(400).json({ error: 'bad status' });
  const [r] = await pool.execute('UPDATE requests SET status = ? WHERE id = ?', [status, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'not found' });
  res.json({ id: req.params.id, status });
});

// DELETE /api/admin/donors/:id  |  /api/admin/requests/:id
router.delete('/:table/:id', async (req, res) => {
  if (!['donors', 'requests'].includes(req.params.table)) return res.status(404).json({ error: 'not found' });
  const [r] = await pool.execute(`DELETE FROM ${req.params.table} WHERE id = ?`, [req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

router.use((req, res) => res.status(404).json({ error: 'not found' }));

module.exports = router;
