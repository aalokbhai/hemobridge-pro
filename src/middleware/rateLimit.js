const hits = new Map();

// rateLimit('write', 30, 10*60*1000) -> ek IP se 10 minute me max 30 requests
// 4th argument (optional): custom key, e.g. req => req.body.email  (account-wise limit ke liye)
module.exports = (name, max, windowMs, keyFn) => (req, res, next) => {
  const who = keyFn ? String(keyFn(req) || req.ip).toLowerCase() : req.ip;
  const key = name + '|' + who, now = Date.now();
  const list = (hits.get(key) || []).filter(t => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (list.length > max) return res.status(429).json({ error: 'too many requests, try later' });
  next();
};

// Purani entries saaf (memory na badhe)
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of hits) if (!list.length || now - list[list.length - 1] > 3.6e6) hits.delete(k);
}, 10 * 60 * 1000).unref();
