// Galat JSON / bahut bada body -> 400, baaki sab -> 500
module.exports = (err, req, res, next) => {
  const status = err.status >= 400 && err.status < 500 ? 400 : 500;
  if (status === 500) console.error('Error:', err.message);
  res.status(status).json({ error: status === 400 ? 'bad request' : 'server error' });
};
