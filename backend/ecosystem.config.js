/**
 * PM2 Ecosystem Configuration
 * Production process management for RuralConnect backend
 */

module.exports = {
  apps: [
    {
      name: 'ruralconnect-backend',
      script: 'server.js',
      instances: process.env.NODE_ENV === 'production' ? 2 : 1,
      exec_mode: process.env.NODE_ENV === 'production' ? 'cluster' : 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 5000,
        LOG_LEVEL: 'info',
        // Database
        MONGODB_URI: process.env.MONGODB_URI,
        // Security
        JWT_SECRET: process.env.JWT_SECRET,
        ENCRYPTION_MASTER_KEY: process.env.ENCRYPTION_MASTER_KEY,
        // External Services
        RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
        RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
        // Blockchain
        POLYGON_RPC_URL: process.env.POLYGON_RPC_URL,
        PRIVATE_KEY: process.env.PRIVATE_KEY,
        CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS,
        // Email/SMS (if needed)
        SMTP_HOST: process.env.SMTP_HOST,
        SMTP_PORT: process.env.SMTP_PORT,
        SMTP_USER: process.env.SMTP_USER,
        SMTP_PASS: process.env.SMTP_PASS
      },
      // Process management
      max_memory_restart: '1G',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Monitoring
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads'],
      // Environment variables
      env_file: process.env.NODE_ENV === 'production' ? '.env.production' : '.env',
      // Health checks
      health_check: {
        enabled: true,
        url: `http://localhost:${process.env.PORT || 5000}/api/health`,
        interval: 30000, // 30 seconds
        timeout: 5000,   // 5 seconds
        fails: 3         // Restart after 3 failures
      }
    }
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'node',
      host: process.env.DEPLOY_HOST || 'your-server.com',
      ref: 'origin/main',
      repo: 'https://github.com/SaiKrishna-333/LatestForwardingRepositoryMiniProject.git',
      path: '/var/www/ruralconnect',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
