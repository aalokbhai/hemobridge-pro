const router = require('express').Router();
const { nearby } = require('../services/overpass');

// GET /api/bloodbanks/nearby?lat=&lng=&radius=
router.get('/nearby', async (req, res) => {
  const lat = +req.query.lat, lng = +req.query.lng;
  const radius = Math.min(Math.max(+req.query.radius || 10, 1), 50);
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return res.status(400).json({ error: 'bad coordinates' });
  try {
    res.json(await nearby(lat, lng, radius));
  } catch (e) {
    res.status(502).json({ error: 'map data unavailable' });
  }
});

module.exports = router;
