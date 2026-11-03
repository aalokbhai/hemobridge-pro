// PM2:  pm2 start ecosystem.config.js && pm2 save && pm2 startup
module.exports = {
  apps: [{
    name: 'hemobridge',
    script: 'src/server.js',
    instances: 1,            // 1 hi rakho (rate-limit memory me hai)
    autorestart: true,
    max_memory_restart: '400M',
    env: { NODE_ENV: 'production' },
  }],
};
