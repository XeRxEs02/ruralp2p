/**
 * Health Controller
 * Provides health monitoring and uptime endpoints for production
 */

const os = require('os');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

class HealthController {
  constructor() {
    this.startTime = Date.now();
    this.version = process.env.npm_package_version || '1.0.0';
  }

  /**
   * Basic health check endpoint
   * GET /api/health
   */
  async healthCheck(req, res) {
    try {
      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: this.getUptime(),
        version: this.version,
        environment: process.env.NODE_ENV || 'development',
        services: {
          database: await this.checkDatabaseHealth(),
          memory: this.getMemoryUsage(),
          cpu: this.getCpuUsage()
        }
      };

      // Log health check
      logger.systemHealth('health_check', 'healthy', {
        uptime: health.uptime,
        memory: health.services.memory,
        database: health.services.database
      });

      // Determine overall status
      const overallStatus = this.determineOverallStatus(health.services);

      res.status(overallStatus === 'ok' ? 200 : 503).json({
        ...health,
        status: overallStatus
      });

    } catch (error) {
      logger.errorWithContext(error, { endpoint: '/api/health' });

      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: this.getUptime(),
        version: this.version,
        error: 'Health check failed'
      });
    }
  }

  /**
   * Detailed health check with metrics
   * GET /api/health/detailed
   */
  async detailedHealthCheck(req, res) {
    try {
      const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: this.getUptime(),
        version: this.version,
        environment: process.env.NODE_ENV || 'development',
        system: {
          platform: os.platform(),
          arch: os.arch(),
          release: os.release(),
          hostname: os.hostname(),
          cpus: os.cpus().length,
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          loadAverage: os.loadavg()
        },
        process: {
          pid: process.pid,
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
          versions: process.versions,
          env: this.getSafeEnvironment()
        },
        services: {
          database: await this.checkDatabaseHealth(),
          redis: await this.checkRedisHealth(), // If using Redis
          blockchain: await this.checkBlockchainHealth(),
          externalAPIs: await this.checkExternalAPIsHealth()
        },
        metrics: {
          activeConnections: this.getActiveConnections(),
          requestCount: this.getRequestCount(),
          errorRate: this.getErrorRate()
        }
      };

      const overallStatus = this.determineOverallStatus(health.services);

      res.status(overallStatus === 'ok' ? 200 : 503).json({
        ...health,
        status: overallStatus
      });

    } catch (error) {
      logger.errorWithContext(error, { endpoint: '/api/health/detailed' });

      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Detailed health check failed',
        details: error.message
      });
    }
  }

  /**
   * Uptime endpoint
   * GET /api/uptime
   */
  async getUptime(req, res) {
    try {
      const uptime = this.getUptime();

      res.json({
        uptime: uptime.seconds,
        uptimeHuman: uptime.human,
        startTime: new Date(this.startTime).toISOString(),
        currentTime: new Date().toISOString(),
        version: this.version
      });

    } catch (error) {
      logger.errorWithContext(error, { endpoint: '/api/uptime' });
      res.status(500).json({ error: 'Failed to get uptime' });
    }
  }

  /**
   * Readiness probe for Kubernetes/Docker
   * GET /api/ready
   */
  async readinessCheck(req, res) {
    try {
      const isReady = await this.checkReadiness();

      if (isReady) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      logger.errorWithContext(error, { endpoint: '/api/health' });

      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: {
          milliseconds: Date.now() - this.startTime,
          seconds: Math.floor((Date.now() - this.startTime) / 1000),
          human: this.formatUptime ? this.formatUptime(Math.floor((Date.now() - this.startTime) / 1000)) : 'Unknown'
        },
        version: this.version,
        error: 'Health check failed',
        details: error.message
      });
    }
  }

  /**
   * Liveness probe for Kubernetes/Docker
   * GET /api/live
   */
  async livenessCheck(req, res) {
    // Simple liveness check - if the process is running, it's alive
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: this.getUptime().human
    });
  }

  /**
   * Get system metrics
   * GET /api/metrics
   */
  async getMetrics(req, res) {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        system: {
          cpu: this.getCpuUsage(),
          memory: this.getMemoryUsage(),
          disk: await this.getDiskUsage(),
          network: this.getNetworkStats()
        },
        application: {
          uptime: this.getUptime(),
          activeConnections: this.getActiveConnections(),
          requestRate: this.getRequestRate(),
          errorRate: this.getErrorRate(),
          responseTime: this.getAverageResponseTime()
        },
        business: await this.getBusinessMetrics()
      };

      res.json(metrics);

    } catch (error) {
      logger.errorWithContext(error, { endpoint: '/api/metrics' });
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  }

  // Helper methods

  getUptime() {
    const uptimeMs = Date.now() - this.startTime;
    const uptimeSec = Math.floor(uptimeMs / 1000);

    return {
      milliseconds: uptimeMs,
      seconds: uptimeSec,
      human: this.formatUptime(uptimeSec)
    };
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }

  async checkDatabaseHealth() {
    try {
      if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        return { status: 'disconnected', latency: null };
      }

      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      const latency = Date.now() - start;

      return {
        status: 'connected',
        latency: latency,
        database: mongoose.connection.name
      };

    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        latency: null
      };
    }
  }

  async checkRedisHealth() {
    // Placeholder for Redis health check
    // Implement if using Redis for caching
    return { status: 'not_configured' };
  }

  async checkBlockchainHealth() {
    try {
      // Basic blockchain connectivity check
      const blockchainService = require('../services/blockchainService');

      // Simple ping to check if blockchain service is responsive
      const isHealthy = blockchainService ? true : false;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        network: process.env.BLOCKCHAIN_NETWORK || 'polygon-amoy'
      };

    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  async checkExternalAPIsHealth() {
    const apis = {
      razorpay: await this.checkAPIHealth('https://api.razorpay.com/v1'),
      twilio: await this.checkAPIHealth('https://api.twilio.com/2010-04-01'),
      firebase: { status: 'configured' } // Firebase doesn't have a ping endpoint
    };

    return apis;
  }

  async checkAPIHealth(url) {
    try {
      const https = require('https');
      const start = Date.now();

      return new Promise((resolve) => {
        const req = https.request(url, { method: 'HEAD' }, (res) => {
          const latency = Date.now() - start;
          resolve({
            status: res.statusCode < 400 ? 'healthy' : 'unhealthy',
            latency: latency,
            statusCode: res.statusCode
          });
        });

        req.on('error', (error) => {
          resolve({
            status: 'error',
            error: error.message
          });
        });

        req.setTimeout(5000, () => {
          req.destroy();
          resolve({ status: 'timeout' });
        });

        req.end();
      });

    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  getMemoryUsage() {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();

    return {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      systemTotal: totalMem,
      systemFree: os.freemem(),
      usagePercent: ((memUsage.heapUsed / totalMem) * 100).toFixed(2)
    };
  }

  getCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);

    return {
      usage: usage,
      cores: cpus.length,
      loadAverage: os.loadavg()
    };
  }

  async getDiskUsage() {
    // Basic disk usage check
    try {
      const fs = require('fs').promises;
      const stats = await fs.statvfs ? await fs.statvfs('/') : null;

      if (stats) {
        const total = stats.f_blocks * stats.f_frsize;
        const free = stats.f_bavail * stats.f_frsize;
        const used = total - free;

        return {
          total: total,
          used: used,
          free: free,
          usagePercent: ((used / total) * 100).toFixed(2)
        };
      }

      return { status: 'not_available' };

    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  getNetworkStats() {
    const networkInterfaces = os.networkInterfaces();
    const stats = {};

    for (const [name, interfaces] of Object.entries(networkInterfaces)) {
      stats[name] = interfaces.map(iface => ({
        address: iface.address,
        netmask: iface.netmask,
        family: iface.family,
        mac: iface.mac,
        internal: iface.internal
      }));
    }

    return stats;
  }

  getSafeEnvironment() {
    const safe = {};
    const allowed = ['NODE_ENV', 'PORT', 'LOG_LEVEL'];

    allowed.forEach(key => {
      if (process.env[key]) {
        safe[key] = process.env[key];
      }
    });

    return safe;
  }

  determineOverallStatus(services) {
    // Check if critical services are healthy
    const criticalServices = ['database'];

    for (const service of criticalServices) {
      if (services[service]?.status !== 'connected' && services[service]?.status !== 'healthy') {
        return 'degraded';
      }
    }

    // Check if any service has errors
    for (const service of Object.values(services)) {
      if (service?.status === 'error') {
        return 'error';
      }
    }

    return 'ok';
  }

  async checkReadiness() {
    // Check if all critical dependencies are ready
    const dbHealthy = await this.checkDatabaseHealth();
    const blockchainHealthy = await this.checkBlockchainHealth();

    return dbHealthy.status === 'connected' && blockchainHealthy.status !== 'error';
  }

  // Placeholder methods for metrics (implement based on your monitoring setup)
  getActiveConnections() {
    // Return active WebSocket connections or HTTP connections
    return 0; // Placeholder
  }

  getRequestCount() {
    // Return total requests served
    return 0; // Placeholder
  }

  getErrorRate() {
    // Return error rate percentage
    return 0; // Placeholder
  }

  getRequestRate() {
    // Return requests per second
    return 0; // Placeholder
  }

  getAverageResponseTime() {
    // Return average response time in ms
    return 0; // Placeholder
  }

  async getBusinessMetrics() {
    try {
      const Loan = require('../models/Loan');
      const User = require('../models/User');
      const Transaction = require('../models/Transaction');

      const [
        totalLoans,
        activeLoans,
        totalUsers,
        totalTransactions,
        recentLoans
      ] = await Promise.all([
        Loan.countDocuments(),
        Loan.countDocuments({ status: 'ACTIVE' }),
        User.countDocuments(),
        Transaction.countDocuments(),
        Loan.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
      ]);

      return {
        totalLoans,
        activeLoans,
        totalUsers,
        totalTransactions,
        loansToday: recentLoans,
        loanUtilizationRate: totalLoans > 0 ? ((activeLoans / totalLoans) * 100).toFixed(2) : 0
      };

    } catch (error) {
      return {
        error: 'Failed to get business metrics',
        details: error.message
      };
    }
  }
}

module.exports = new HealthController();
