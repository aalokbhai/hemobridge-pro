const crypto = require('crypto');

// Kaunsa donor group kis patient group ko blood de sakta hai (patient -> compatible donors)
const COMPAT = {
  'O-': 'O- O+ A- A+ B- B+ AB- AB+', 'O+': 'O+ A+ B+ AB+',
  'A-': 'A- A+ AB- AB+', 'A+': 'A+ AB+',
  'B-': 'B- B+ AB- AB+', 'B+': 'B+ AB+',
  'AB-': 'AB- AB+', 'AB+': 'AB+',
};
const GROUPS = Object.keys(COMPAT);
const URGENCY = ['Immediately', 'Within 6 hours', 'Within 24 hours', 'Planned (2 days or more)'];
const COMPONENTS = ['Whole blood', 'Packed red cells', 'Platelets', 'Plasma'];

const clean = (v, n = 120) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const digits = s => String(s).replace(/\D/g, '');
const phoneOk = p => digits(p).length >= 8 && digits(p).length <= 13;
const dateOrNull = v => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : null);
const newId = () => crypto.randomUUID().slice(0, 8);

// Patient ke blood group ko kaun-kaun se donor groups de sakte hain
const donorGroupsFor = patientGroup => GROUPS.filter(g => COMPAT[g].split(' ').includes(patientGroup));

// CSV (Excel formula injection se bachaav ke saath)
const toCsv = rows => '\ufeff' + rows
  .map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"').join(','))
  .join('\r\n');

// ---- v4 helpers (hospital / subscription) ----
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;
const passwordOk = p => typeof p === 'string' && p.length >= 8 && p.length <= 100 && /[A-Za-z]/.test(p) && /\d/.test(p);
const ISO = col => `DATE_FORMAT(${col}, '%Y-%m-%dT%H:%i:%sZ')`;          // MySQL (UTC) -> ISO string
const likeEscape = s => String(s).replace(/[\\%_]/g, '\\$&');
const maskPhone = p => { const d = digits(p); return d.length <= 4 ? '••••' : d.slice(0, 2) + '•'.repeat(d.length - 4) + d.slice(-2); };
const utcMs = s => (s ? Date.parse(String(s).replace(' ', 'T') + 'Z') : null);   // 'YYYY-MM-DD HH:MM:SS' (UTC) -> ms
const sqlTime = d => new Date(d).toISOString().slice(0, 19).replace('T', ' ');   // Date -> 'YYYY-MM-DD HH:MM:SS' (UTC)

module.exports = { GROUPS, URGENCY, COMPONENTS, clean, digits, phoneOk, dateOrNull, newId, donorGroupsFor, toCsv, emailOk, passwordOk, ISO, likeEscape, maskPhone, utcMs, sqlTime };
