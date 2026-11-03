const router = require('express').Router();
const { pool } = require('../config/db');
const rateLimit = require('../middleware/rateLimit');
const config = require('../config');
const {
  hashPassword, verifyPassword, burn, createSession, destroySession, destroyOtherSessions,
  requireHospital, requireApproved, requireSubscription,
} = require('../middleware/auth');
const { getState } = require('../services/subscriptions');
const { countMatches } = require('../services/matching');
const {
  GROUPS, URGENCY, COMPONENTS, clean, phoneOk, newId, emailOk, passwordOk, ISO, likeEscape, maskPhone, donorGroupsFor,
} = require('../utils/helpers');

const publicHospital = h => ({
  id: h.id, name: h.name, email: h.email, city: h.city, phone: h.phone, contact_person: h.contact_person,
  license_no: h.license_no, address: h.address, status: h.status, status_note: h.status_note,
});

// ---------------- Public: register + login ----------------

// POST /api/hospital/register
router.post('/register', rateLimit('hreg', 5, 36e5), async (req, res) => {
  const b = req.body || {};
  const h = {
    name: clean(b.name, 160), license: clean(b.license_no, 60), person: clean(b.contact_person),
    email: clean(b.email).toLowerCase(), phone: clean(b.phone, 20), city: clean(b.city, 60), address: clean(b.address, 255),
  };
  if (h.name.length < 3 || h.license.length < 3 || !h.person || !h.city || !phoneOk(h.phone))
    return res.status(400).json({ error: 'Please fill in hospital name, licence number, contact person, phone and city.' });
  if (!emailOk(h.email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!passwordOk(b.password)) return res.status(400).json({ error: 'Password must be 8+ characters with at least one letter and one number.' });

  try {
    await pool.execute(
      `INSERT INTO hospitals (name, license_no, contact_person, email, password_hash, phone, city, address, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', UTC_TIMESTAMP())`,
      [h.name, h.license, h.person, h.email, await hashPassword(b.password), h.phone, h.city, h.address]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This email or licence number is already registered.' });
    throw e;
  }
  res.status(201).json({ ok: true, message: 'Registration received. Our team will verify your licence and approve your account.' });
});

// POST /api/hospital/login  { email, password }
router.post('/login',
  rateLimit('hlogin-ip', 20, 6e5),
  rateLimit('hlogin-acct', 8, 6e5, req => (req.body || {}).email),
  async (req, res) => {
    const b = req.body || {};
    const [[h]] = await pool.execute('SELECT id, password_hash FROM hospitals WHERE email = ?', [clean(b.email).toLowerCase()]);
    const ok = h ? await verifyPassword(String(b.password || ''), h.password_hash) : await burn(String(b.password || ''));
    if (!ok) return res.status(401).json({ error: 'Wrong email or password.' });
    res.json({ token: await createSession('hospital', h.id) });
  });

// ---------------- Logged-in hospital (kisi bhi status me) ----------------
router.use(requireHospital);

router.post('/logout', async (req, res) => { await destroySession(req); res.json({ ok: true }); });

// GET /api/hospital/me -> profile + subscription status
router.get('/me', async (req, res) => {
  const [[p]] = await pool.execute("SELECT COUNT(*) AS n FROM payments WHERE hospital_id = ? AND status = 'submitted'", [req.hospital.id]);
  res.json({ hospital: publicHospital(req.hospital), subscription: await getState(req.hospital.id), pendingPayment: p.n > 0, phoneLimit: config.phoneRevealLimit });
});

router.post('/password', async (req, res) => {
  const b = req.body || {};
  const [[row]] = await pool.execute('SELECT password_hash FROM hospitals WHERE id = ?', [req.hospital.id]);
  if (!(await verifyPassword(String(b.current || ''), row.password_hash))) return res.status(400).json({ error: 'Current password is wrong.' });
  if (!passwordOk(b.next)) return res.status(400).json({ error: 'New password must be 8+ characters with at least one letter and one number.' });
  await pool.execute('UPDATE hospitals SET password_hash = ? WHERE id = ?', [await hashPassword(b.next), req.hospital.id]);
  await destroyOtherSessions('hospital', req.hospital.id, req);
  res.json({ ok: true });
});

// GET /api/hospital/subscription -> plans + payment instructions + payment history
router.get('/subscription', async (req, res) => {
  const [plans] = await pool.query('SELECT id, code, name, price_inr, months FROM plans WHERE active = 1 ORDER BY months');
  const [payments] = await pool.execute(
    `SELECT pay.id, pay.amount_inr, pay.method, pay.reference, pay.status, pay.note, ${ISO('pay.created_at')} AS created, p.name AS plan
       FROM payments pay JOIN subscriptions s ON s.id = pay.subscription_id JOIN plans p ON p.id = s.plan_id
      WHERE pay.hospital_id = ? ORDER BY pay.id DESC LIMIT 50`, [req.hospital.id]);
  res.json({ subscription: await getState(req.hospital.id), plans, payments, paymentInfo: config.payment });
});

// POST /api/hospital/subscribe  { plan_id, reference }  (payment karne ke baad transaction number bhejna)
router.post('/subscribe', requireApproved, rateLimit('hsub', 10, 36e5), async (req, res) => {
  const b = req.body || {};
  const reference = clean(b.reference, 80);
  if (reference.length < 4) return res.status(400).json({ error: 'Enter the UPI / bank transaction reference (UTR) of your payment.' });
  const [[plan]] = await pool.execute('SELECT id, price_inr FROM plans WHERE id = ? AND active = 1', [parseInt(b.plan_id, 10) || 0]);
  if (!plan) return res.status(400).json({ error: 'Choose a plan.' });
  const [[open]] = await pool.execute("SELECT COUNT(*) AS n FROM payments WHERE hospital_id = ? AND status = 'submitted'", [req.hospital.id]);
  if (open.n > 0) return res.status(409).json({ error: 'Your previous payment is still being verified.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [s] = await conn.execute("INSERT INTO subscriptions (hospital_id, plan_id, status, created_at) VALUES (?, ?, 'pending', UTC_TIMESTAMP())", [req.hospital.id, plan.id]);
    await conn.execute(
      "INSERT INTO payments (hospital_id, subscription_id, amount_inr, method, reference, status, created_at) VALUES (?, ?, ?, 'manual', ?, 'submitted', UTC_TIMESTAMP())",
      [req.hospital.id, s.insertId, plan.price_inr, reference]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  res.status(201).json({ ok: true, message: 'Payment submitted. Your plan starts as soon as our team verifies it.' });
});

// ---------------- Sirf approved + paid hospitals ----------------
router.use(requireApproved);
router.use(requireSubscription);

// Din ka hisaab: 'abhi tak aaj kitne donors ka contact dekha'
const contactsToday = async id => {
  const [[r]] = await pool.execute(
    "SELECT COUNT(DISTINCT donor_id) AS n FROM donor_access_log WHERE hospital_id = ? AND action = 'contact' AND created_at >= UTC_DATE()", [id]);
  return r.n;
};

// "Abhi donate kar sakta hai" ka SQL (men 90 din, women 120 din ka gap)
const AVAILABLE_SQL = "(last_donation IS NULL OR last_donation <= DATE_SUB(UTC_DATE(), INTERVAL IF(sex = 'female', 120, 90) DAY))";

router.get('/stats', async (req, res) => {
  const h = req.hospital;
  const [[a]] = await pool.execute(`SELECT COUNT(*) AS n FROM donors WHERE hospital_consent = 1 AND ${AVAILABLE_SQL}`);
  const [[c]] = await pool.execute(`SELECT COUNT(*) AS n FROM donors WHERE hospital_consent = 1 AND ${AVAILABLE_SQL} AND city = ?`, [h.city]);
  const [[o]] = await pool.execute("SELECT COUNT(*) AS n FROM requests WHERE hospital_id = ? AND status = 'open'", [h.id]);
  res.json({
    subscription: req.subscription, availableDonors: a.n, availableInCity: c.n, openRequests: o.n,
    contactsToday: await contactsToday(h.id), contactLimit: config.phoneRevealLimit,
  });
});

// GET /api/hospital/donors?bg=&compat=1&city=&available=1&page=1
router.get('/donors', async (req, res) => {
  const q = req.query, where = ['hospital_consent = 1'], args = [];
  const bg = clean(q.bg, 4);
  if (bg) {
    if (!GROUPS.includes(bg)) return res.status(400).json({ error: 'bad blood group' });
    const groups = q.compat === '1' ? donorGroupsFor(bg) : [bg];   // compat=1: bg = patient ka group, compatible donors dikhao
    where.push(`blood_group IN (${groups.map(() => '?').join(',')})`); args.push(...groups);
  }
  const city = clean(q.city, 60);
  if (city) { where.push('city LIKE ?'); args.push('%' + likeEscape(city) + '%'); }
  if (q.available === '1') where.push(AVAILABLE_SQL);

  const size = 25, page = Math.max(parseInt(q.page, 10) || 1, 1), cond = where.join(' AND ');
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM donors WHERE ${cond}`, args);
  const [rows] = await pool.query(
    `SELECT id, name, blood_group AS bg, city, sex, TIMESTAMPDIFF(YEAR, dob, UTC_DATE()) AS age, last_donation AS \`last\`, phone, ${AVAILABLE_SQL} AS available
       FROM donors WHERE ${cond} ORDER BY available DESC, created_at DESC LIMIT ? OFFSET ?`, [...args, size, (page - 1) * size]);

  // Phone number list me kabhi nahi bhejte, sirf masked
  res.json({
    total, page, pages: Math.max(Math.ceil(total / size), 1),
    donors: rows.map(d => ({ id: d.id, name: d.name, bg: d.bg, city: d.city, sex: d.sex, age: d.age, last: d.last, available: !!d.available, phone: maskPhone(d.phone) })),
  });
});

// POST /api/hospital/donors/:id/contact -> asli phone/email dikhata hai (log hota hai, daily limit hai)
router.post('/donors/:id/contact', rateLimit('hcontact', 60, 6e5), async (req, res) => {
  const hid = req.hospital.id, did = clean(req.params.id, 8);
  const [[d]] = await pool.execute('SELECT phone, email FROM donors WHERE id = ? AND hospital_consent = 1', [did]);
  if (!d) return res.status(404).json({ error: 'Donor not found.' });

  const [[seen]] = await pool.execute(
    "SELECT COUNT(*) AS n FROM donor_access_log WHERE hospital_id = ? AND donor_id = ? AND action = 'contact' AND created_at >= UTC_DATE()", [hid, did]);
  if (!seen.n) {                                   // aaj pehli baar -> limit check + log
    if ((await contactsToday(hid)) >= config.phoneRevealLimit)
      return res.status(429).json({ error: `Daily limit of ${config.phoneRevealLimit} donor contacts reached. Try again tomorrow.` });
    await pool.execute("INSERT INTO donor_access_log (hospital_id, donor_id, action, created_at) VALUES (?, ?, 'contact', UTC_TIMESTAMP())", [hid, did]);
  }
  res.json({ phone: d.phone, email: d.email });
});

// ---- Hospital ki apni blood requests ----
router.get('/requests', async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT id, patient, blood_group AS bg, component AS comp, units, urgency, doctor, phone, city, status, matches, ${ISO('created_at')} AS created
       FROM requests WHERE hospital_id = ? ORDER BY created_at DESC LIMIT 200`, [req.hospital.id]);
  res.json(rows);
});

router.post('/requests', rateLimit('hreq', 40, 36e5), async (req, res) => {
  const b = req.body || {}, h = req.hospital;
  const r = {
    id: newId(), patient: clean(b.pn), bg: clean(b.rb, 4),
    comp: COMPONENTS.includes(b.comp) ? b.comp : 'Whole blood',
    units: Math.min(Math.max(parseInt(b.units, 10) || 1, 1), 10),
    urgency: URGENCY.includes(b.urg) ? b.urg : URGENCY[0],
    doctor: clean(b.doc), phone: clean(b.ph || h.phone, 20), city: clean(b.city || h.city, 60),
  };
  if (!r.patient || !GROUPS.includes(r.bg) || !r.doctor || !phoneOk(r.phone)) return res.status(400).json({ error: 'Fill in patient, blood group, doctor and contact number.' });

  const n = await countMatches(r.bg, r.city + ' ' + h.name);
  await pool.execute(
    `INSERT INTO requests (id, patient, blood_group, component, units, urgency, hospital, doctor, phone, city, status, matches, hospital_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, UTC_TIMESTAMP())`,
    [r.id, r.patient, r.bg, r.comp, r.units, r.urgency, h.name, r.doctor, r.phone, r.city, n, h.id]);
  console.log(`[alert] request ${r.id}: ${r.units} x ${r.bg} at ${h.name} -> ${n} matching donor(s)`);   // yahan SMS/email lagao
  res.status(201).json({ id: r.id, matches: n });
});

router.patch('/requests/:id', async (req, res) => {
  const status = (req.body || {}).status;
  if (!['open', 'fulfilled', 'closed'].includes(status)) return res.status(400).json({ error: 'bad status' });
  const [r] = await pool.execute('UPDATE requests SET status = ? WHERE id = ? AND hospital_id = ?', [status, req.params.id, req.hospital.id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'not found' });
  res.json({ id: req.params.id, status });
});

router.use((req, res) => res.status(404).json({ error: 'not found' }));

module.exports = router;
