const router = require('express').Router();
const { pool } = require('../config/db');

router.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, app: 'hemobridge' }); }
  catch (e) { res.status(503).json({ ok: false }); }
});

// Public: plans aur prices (hospital register page par dikhane ke liye)
router.get('/plans', async (req, res) => {
  const [rows] = await pool.query('SELECT id, code, name, price_inr, months FROM plans WHERE active = 1 ORDER BY months');
  res.json(rows);
});

router.use('/donors', require('./donors'));
router.use('/requests', require('./requests'));
router.use('/bloodbanks', require('./bloodbanks'));
router.use('/hospital', require('./hospital'));
router.use('/admin', require('./admin'));
router.use((req, res) => res.status(404).json({ error: 'not found' }));

module.exports = router;
