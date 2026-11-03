const router = require('express').Router();
const { pool } = require('../config/db');
const rateLimit = require('../middleware/rateLimit');
const { GROUPS, URGENCY, COMPONENTS, clean, phoneOk, newId } = require('../utils/helpers');
const { countMatches } = require('../services/matching');

// POST /api/requests  -> naya blood request + kitne compatible donors mile
router.post('/', rateLimit('write', 30, 6e5), async (req, res) => {
  const b = req.body || {};
  const r = {
    id: newId(), patient: clean(b.pn), bg: clean(b.rb, 4),
    comp: COMPONENTS.includes(b.comp) ? b.comp : 'Whole blood',
    units: Math.min(Math.max(parseInt(b.units) || 1, 1), 10),
    urgency: URGENCY.includes(b.urg) ? b.urg : URGENCY[0],
    hospital: clean(b.hosp), doctor: clean(b.doc), phone: clean(b.ph, 20), city: clean(b.city, 60),
  };
  if (!r.patient || !GROUPS.includes(r.bg) || !r.hospital || !r.doctor || !phoneOk(r.phone)) return res.status(400).json({ error: 'invalid request data' });

  const n = await countMatches(r.bg, r.city + ' ' + r.hospital);

  await pool.execute(
    `INSERT INTO requests (id, patient, blood_group, component, units, urgency, hospital, doctor, phone, city, status, matches, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, UTC_TIMESTAMP())`,
    [r.id, r.patient, r.bg, r.comp, r.units, r.urgency, r.hospital, r.doctor, r.phone, r.city, n]
  );
  console.log(`[alert] request ${r.id}: ${r.units} x ${r.bg} at ${r.hospital} -> ${n} matching donor(s)`);   // yahan SMS/email lagao
  res.status(201).json({ id: r.id, matches: n });
});

module.exports = router;
