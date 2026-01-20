module.exports = {
  apps: [{
    name: 'bagstats-api',
    script: 'src/index.js',
    cwd: '/var/www/bagstats-api',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};
