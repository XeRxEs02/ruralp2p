/**
 * Health Routes
 * Defines all health monitoring and system status endpoints
 */

const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');
const logger = require('../utils/logger');

// Apply HTTP logging middleware to all health routes
router.use(logger.httpLogger);

/**
 * @route   GET /api/health
 * @desc    Basic health check endpoint
 * @access  Public
 * @returns {Object} Health status with basic metrics
 */
router.get('/', healthController.healthCheck);

/**
 * @route   GET /api/health/detailed
 * @desc    Detailed health check with comprehensive metrics
 * @access  Public (consider restricting in production)
 * @returns {Object} Detailed health status and system metrics
 */
router.get('/detailed', healthController.detailedHealthCheck);

/**
 * @route   GET /api/uptime
 * @desc    Get application uptime information
 * @access  Public
 * @returns {Object} Uptime statistics
 */
router.get('/uptime', healthController.getUptime);

/**
 * @route   GET /api/ready
 * @desc    Kubernetes readiness probe
 * @access  Public
 * @returns {Object} Readiness status
 */
router.get('/ready', healthController.readinessCheck);

/**
 * @route   GET /api/live
 * @desc    Kubernetes liveness probe
 * @access  Public
 * @returns {Object} Liveness status
 */
router.get('/live', healthController.livenessCheck);

/**
 * @route   GET /api/metrics
 * @desc    System and application metrics
 * @access  Private (Admin only in production)
 * @returns {Object} Comprehensive metrics
 */
router.get('/metrics', healthController.getMetrics);

/**
 * @route   GET /api/health/ping
 * @desc    Simple ping/pong health check
 * @access  Public
 * @returns {Object} Simple pong response
 */
router.get('/ping', (req, res) => {
  res.json({
    status: 'pong',
    timestamp: new Date().toISOString(),
    service: 'ruralconnect-backend'
  });
});

/**
 * @route   GET /api/health/version
 * @desc    Get application version information
 * @access  Public
 * @returns {Object} Version and build information
 */
router.get('/version', (req, res) => {
  res.json({
    version: process.env.npm_package_version || '1.0.0',
    name: process.env.npm_package_name || 'ruralconnect-backend',
    environment: process.env.NODE_ENV || 'development',
    build: {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    }
  });
});

/**
 * @route   GET /api/health/status
 * @desc    Get overall system status
 * @access  Public
 * @returns {Object} System status summary
 */
router.get('/status', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const os = require('os');

    const status = {
      timestamp: new Date().toISOString(),
      status: 'operational',
      services: {
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        server: 'running',
        memory: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
        uptime: `${(process.uptime() / 3600).toFixed(2)} hours`
      },
      system: {
        platform: os.platform(),
        cpus: os.cpus().length,
        totalMemory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`,
        freeMemory: `${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`
      }
    };

    // Determine overall status
    if (mongoose.connection.readyState !== 1) {
      status.status = 'degraded';
    }

    res.json(status);

  } catch (error) {
    logger.errorWithContext(error, { endpoint: '/api/health/status' });
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Failed to get system status'
    });
  }
});

module.exports = router;
