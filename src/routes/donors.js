const router = require('express').Router();
const { pool } = require('../config/db');
const rateLimit = require('../middleware/rateLimit');
const { GROUPS, clean, digits, phoneOk, dateOrNull, newId } = require('../utils/helpers');

// POST /api/donors  -> naya donor (same phone number ho to purana update ho jaata hai)
router.post('/', rateLimit('write', 30, 6e5), async (req, res) => {
  const b = req.body || {};
  const d = {
    name: clean(b.name), phone: clean(b.phone, 20), email: clean(b.email), city: clean(b.city, 60),
    bg: clean(b.bg, 4), sex: clean(b.sex, 6), dob: dateOrNull(clean(b.dob, 10)),
    wt: +b.wt > 0 && +b.wt < 400 ? +b.wt : null, last: dateOrNull(clean(b.last, 10)),
    consent: b.consent === true || b.consent === 'true' || b.consent === 'on' ? 1 : 0,   // hospitals ko details dikhane ki permission
  };
  if (!d.name || !phoneOk(d.phone) || !d.city || !GROUPS.includes(d.bg)) return res.status(400).json({ error: 'invalid donor data' });

  const pd = digits(d.phone);
  await pool.execute(
    `INSERT INTO donors (id, name, phone, phone_digits, email, city, blood_group, sex, dob, weight_kg, last_donation, hospital_consent, consent_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, IF(? = 1, UTC_TIMESTAMP(), NULL), UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE name=VALUES(name), phone=VALUES(phone), email=VALUES(email), city=VALUES(city),
       blood_group=VALUES(blood_group), sex=VALUES(sex), dob=VALUES(dob), weight_kg=VALUES(weight_kg), last_donation=VALUES(last_donation),
       hospital_consent=VALUES(hospital_consent), consent_at=VALUES(consent_at)`,
    [newId(), d.name, d.phone, pd, d.email, d.city, d.bg, d.sex, d.dob, d.wt, d.last, d.consent, d.consent]
  );
  const [[row]] = await pool.execute('SELECT id FROM donors WHERE phone_digits = ?', [pd]);
  res.status(201).json({ id: row.id });
});

// POST /api/donors/optout  { phone } -> donor hospitals ke saath apni details share karna band kar sakta hai
router.post('/optout', rateLimit('optout', 10, 6e5), async (req, res) => {
  const pd = digits((req.body || {}).phone || '');
  if (pd.length < 8) return res.status(400).json({ error: 'Enter the mobile number you registered with.' });
  await pool.execute('UPDATE donors SET hospital_consent = 0, consent_at = NULL WHERE phone_digits = ?', [pd]);
  res.json({ ok: true });   // number mile ya na mile, same jawab (kisi ka number confirm nahi karte)
});

module.exports = router;
