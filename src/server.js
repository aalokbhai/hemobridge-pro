const http = require('http');
const { exec } = require('child_process');
const config = require('./config');
const { pool, initDatabase } = require('./config/db');
const { bootstrap } = require('./services/bootstrap');
const { cleanupSessions } = require('./middleware/auth');
const app = require('./app');

async function main() {
  try {
    await initDatabase();
    console.log(`MySQL connected  (database: ${config.db.database})`);
  } catch (e) {
    console.error('\n  MySQL se connect nahi ho paya: ' + (e.code || e.message));
    console.error('  1) MySQL server chal raha hai? (XAMPP me "Start" dabao)');
    console.error('  2) .env file me DB_HOST / DB_USER / DB_PASSWORD / DB_NAME sahi hain?\n');
    process.exit(1);
  }

  let seeded;
  try {
    seeded = await bootstrap();
  } catch (e) {
    console.error('\n  ' + e.message + '\n');
    process.exit(1);
  }

  cleanupSessions().catch(() => {});
  setInterval(() => cleanupSessions().catch(() => {}), 60 * 60 * 1000).unref();

  let port = config.port;
  const server = http.createServer(app);

  server.on('error', e => {
    // Port badalna sirf apne computer par; server par fixed port hi chahiye
    if (!config.isProd && e.code === 'EADDRINUSE' && port < config.port + 20) {
      console.log(`Port ${port} busy hai, ${port + 1} try kar raha hoon...`);
      server.listen(++port);
    } else { console.error('Server error:', e.message); process.exit(1); }
  });

  server.on('listening', () => {
    const url = 'http://localhost:' + port;
    console.log(`\n  HemoBridge is running (${config.isProd ? 'production' : 'development'})`);
    console.log(`  App:       ${url}`);
    console.log(`  Hospital:  ${url}/hospital`);
    console.log(`  Admin:     ${url}/admin`);
    if (seeded.created) console.log(`\n  Pehla admin ban gaya -> email: ${seeded.email}  (password: .env ke ADMIN_PASSWORD me)`);
    if (!config.isProd && config.admin.password === 'admin123') console.log('  NOTE: ADMIN_PASSWORD abhi default hai. Live karne se pehle .env me badlo.');
    console.log('  Stop:      Ctrl + C\n');
    if (!config.isProd && !process.env.NO_OPEN) {
      const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
      exec(cmd, () => {});
    }
  });

  server.listen(port);

  // Docker / PM2 stop kare to araam se band ho
  const stop = () => server.close(() => pool.end().finally(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

process.on('unhandledRejection', e => console.error('Error:', e && e.message));
main();
