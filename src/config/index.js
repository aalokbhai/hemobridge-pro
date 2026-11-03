require('dotenv').config();

const env = process.env;
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const bool = (v, d = false) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));

module.exports = {
  isProd: env.NODE_ENV === 'production',
  port: int(env.PORT, 3000),

  trustProxy: env.TRUST_PROXY === 'true' ? true : int(env.TRUST_PROXY, 0) || false,
  forceHttps: bool(env.FORCE_HTTPS),

  admin: {
    email: String(env.ADMIN_EMAIL || 'admin@hemobridge.local').trim().toLowerCase(),
    password: String(env.ADMIN_PASSWORD || 'admin123'),
  },

  sessionHours: int(env.SESSION_HOURS, 12),
  graceDays: int(env.GRACE_DAYS, 3),
  phoneRevealLimit: int(env.PHONE_REVEAL_DAILY_LIMIT, 50),

  payment: {
    payee: env.PAY_PAYEE_NAME || '',
    upi: env.PAY_UPI_ID || '',
    bank: env.PAY_BANK_DETAILS || '',
    note: env.PAY_NOTE || '',
  },

  db: {
    host: env.DB_HOST || 'localhost',
    port: int(env.DB_PORT, 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'hemobridge',
    ssl: bool(env.DB_SSL)
      ? {
          ca: env.DB_SSL_CA,
          rejectUnauthorized: bool(env.DB_SSL_REJECT_UNAUTHORIZED, true),
        }
      : undefined,
  },
};