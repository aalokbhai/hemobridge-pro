const path = require('path');
const express = require('express');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PUBLIC = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

// Security headers
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});

// FORCE_HTTPS=true (aur TRUST_PROXY=1) ho to http ko https par bhej deta hai
if (config.forceHttps) {
  app.use((req, res, next) => {
    if (req.secure || req.path === '/api/health') return next();
    res.redirect(301, 'https://' + req.headers.host + req.originalUrl);
  });
}

app.use(express.json({ limit: '20kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, require('./routes'));

app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC, 'admin.html')));
app.get('/hospital', (req, res) => res.sendFile(path.join(PUBLIC, 'hospital.html')));
app.use(express.static(PUBLIC));
app.use((req, res) => res.status(404).type('text/plain').send('Not found'));
app.use(errorHandler);

module.exports = app;
