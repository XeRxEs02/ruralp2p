/**
 * Winston Logger Configuration
 * Structured logging for production with multiple transports
 */

const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

// Add colors to winston
winston.addColors(colors);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.colorize({ all: true })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define transports
const transports = [
  // Error log file
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    )
  }),

  // Combined log file
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    )
  }),

  // HTTP requests log file
  new winston.transports.File({
    filename: path.join(logsDir, 'http.log'),
    level: 'http',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  })
];

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: logFormat,
  transports,
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    })
  ]
});

// Custom logging methods for different contexts
logger.audit = (message, meta = {}) => {
  logger.info('AUDIT', { message, ...meta, category: 'audit' });
};

logger.security = (message, meta = {}) => {
  logger.warn('SECURITY', { message, ...meta, category: 'security' });
};

logger.business = (message, meta = {}) => {
  logger.info('BUSINESS', { message, ...meta, category: 'business' });
};

logger.performance = (message, meta = {}) => {
  logger.info('PERFORMANCE', { message, ...meta, category: 'performance' });
};

// HTTP request logging middleware
logger.httpLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, url, ip } = req;
    const { statusCode } = res;
    const userAgent = req.get('User-Agent') || '';

    logger.http('HTTP Request', {
      method,
      url,
      statusCode,
      duration,
      ip,
      userAgent,
      userId: req.user?.id || 'anonymous',
      timestamp: new Date().toISOString()
    });
  });

  next();
};

// Database operation logging
logger.dbOperation = (operation, collection, duration, success = true, error = null) => {
  const level = success ? 'debug' : 'error';
  logger.log(level, 'DB_OPERATION', {
    operation,
    collection,
    duration,
    success,
    error: error?.message,
    timestamp: new Date().toISOString()
  });
};

// Business metrics logging
logger.businessMetric = (metric, value, tags = {}) => {
  logger.info('BUSINESS_METRIC', {
    metric,
    value,
    tags,
    timestamp: new Date().toISOString()
  });
};

// Error logging with context
logger.errorWithContext = (error, context = {}) => {
  logger.error('ERROR_WITH_CONTEXT', {
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
};

// Performance monitoring
logger.performanceMetric = (operation, duration, metadata = {}) => {
  logger.performance('PERFORMANCE_METRIC', {
    operation,
    duration,
    metadata,
    timestamp: new Date().toISOString()
  });
};

// GDPR compliance logging
logger.gdprEvent = (action, userId, details = {}) => {
  logger.info('GDPR_EVENT', {
    action,
    userId,
    details,
    timestamp: new Date().toISOString(),
    category: 'gdpr'
  });
};

// Blockchain event logging
logger.blockchainEvent = (event, details = {}) => {
  logger.info('BLOCKCHAIN_EVENT', {
    event,
    details,
    timestamp: new Date().toISOString(),
    category: 'blockchain'
  });
};

// Payment event logging
logger.paymentEvent = (event, transactionId, amount, status, details = {}) => {
  logger.info('PAYMENT_EVENT', {
    event,
    transactionId,
    amount,
    status,
    details,
    timestamp: new Date().toISOString(),
    category: 'payment'
  });
};

// Loan event logging
logger.loanEvent = (event, loanId, userId, details = {}) => {
  logger.info('LOAN_EVENT', {
    event,
    loanId,
    userId,
    details,
    timestamp: new Date().toISOString(),
    category: 'loan'
  });
};

// User activity logging
logger.userActivity = (userId, action, details = {}) => {
  logger.info('USER_ACTIVITY', {
    userId,
    action,
    details,
    timestamp: new Date().toISOString(),
    category: 'user_activity'
  });
};

// System health logging
logger.systemHealth = (component, status, metrics = {}) => {
  const level = status === 'healthy' ? 'info' : 'warn';
  logger.log(level, 'SYSTEM_HEALTH', {
    component,
    status,
    metrics,
    timestamp: new Date().toISOString(),
    category: 'system_health'
  });
};

// Export logger instance
module.exports = logger;
