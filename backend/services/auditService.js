/**
 * AuditService - Comprehensive audit logging system
 * Tracks all user actions, system events, and security incidents
 * Supports GDPR compliance and data retention policies
 */

const AuditLog = require('../models/AuditLog');

class AuditService {
  constructor() {
    this.retentionPeriod = 7 * 365 * 24 * 60 * 60 * 1000; // 7 years in milliseconds
  }

  /**
   * Log user authentication events
   * @param {string} userId - User ID
   * @param {string} action - Action performed (login, logout, failed_login, etc.)
   * @param {Object} details - Additional details
   * @param {Object} metadata - Request metadata
   */
  async logAuthentication(userId, action, details = {}, metadata = {}) {
    const auditEntry = {
      userId: userId || 'anonymous',
      action: action,
      category: 'authentication',
      details: {
        ...details,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        deviceType: metadata.deviceType
      },
      severity: this.getSeverityLevel(action),
      source: metadata.source || 'system',
      sessionId: metadata.sessionId,
      location: metadata.location
    };

    return await this.createLogEntry(auditEntry);
  }

  /**
   * Log user profile changes
   * @param {string} userId - User ID
   * @param {string} action - Action performed
   * @param {Object} changes - What was changed
   * @param {Object} metadata - Request metadata
   */
  async logProfileChange(userId, action, changes = {}, metadata = {}) {
    const auditEntry = {
      userId,
      action,
      category: 'profile',
      details: {
        changes,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      },
      severity: 'medium',
      source: metadata.source || 'user',
      sessionId: metadata.sessionId
    };

    return await this.createLogEntry(auditEntry);
  }

  /**
   * Log loan-related activities
   * @param {string} userId - User ID
   * @param {string} loanId - Loan ID
   * @param {string} action - Action performed
   * @param {Object} details - Loan details
   * @param {Object} metadata - Request metadata
   */
  async logLoanActivity(userId, loanId, action, details = {}, metadata = {}) {
    const auditEntry = {
      userId,
      action,
      category: 'loan',
      resourceId: loanId,
      resourceType: 'loan',
      details: {
        loanId,
        ...details,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      },
      severity: this.getLoanSeverityLevel(action),
      source: metadata.source || 'user',
      sessionId: metadata.sessionId
    };

    return await this.createLogEntry(auditEntry);
  }

  /**
   * Log payment transactions
   * @param {string} userId - User ID
   * @param {string} transactionId - Transaction ID
   * @param {string} action - Action performed
   * @param {Object} details - Transaction details
   * @param {Object} metadata - Request metadata
   */
  async logPaymentActivity(userId, transactionId, action, details = {}, metadata = {}) {
    const auditEntry = {
      userId,
      action,
      category: 'payment',
      resourceId: transactionId,
      resourceType: 'transaction',
      details: {
        transactionId,
        amount: details.amount,
        currency: details.currency || 'INR',
        paymentMethod: details.paymentMethod,
        status: details.status,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      },
      severity: this.getPaymentSeverityLevel(action),
      source: metadata.source || 'system',
      sessionId: metadata.sessionId
    };

    return await this.createLogEntry(auditEntry);
  }

  /**
   * Log security events
   * @param {string} userId - User ID
   * @param {string} action - Security action
   * @param {Object} details - Security details
   * @param {Object} metadata - Request metadata
   */
  async logSecurityEvent(userId, action, details = {}, metadata = {}) {
    const auditEntry = {
      userId: userId || 'system',
      action,
      category: 'security',
      details: {
        ...details,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        location: metadata.location
      },
      severity: 'high',
      source: metadata.source || 'system',
      sessionId: metadata.sessionId
    };

    return await this.createLogEntry(auditEntry);
  }

  /**
   * Log administrative actions
   * @param {string} adminId - Admin user ID
   * @param {string} action - Admin action
   * @param {Object} target - Target of action
   * @param {Object} details - Action details
   * @param {Object} metadata - Request metadata
   */
  async logAdminAction(adminId, action, target = {}, details = {}, metadata = {}) {
    const auditEntry = {
      userId: adminId,
      action,
      category: 'administration',
      resourceId: target.id,
      resourceType: target.type,
      details: {
        target,
        ...details,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      },
      severity: 'high',
      source: 'admin',
      sessionId: metadata.sessionId
    };

    return await this.createLogEntry(auditEntry);
  }

  /**
   * Log data access events (GDPR compliance)
   * @param {string} userId - User ID
   * @param {string} action - Access action
   * @param {Object} dataAccessed - What data was accessed
   * @param {Object} metadata - Request metadata
   */
  async logDataAccess(userId, action, dataAccessed = {}, metadata = {}) {
    const auditEntry = {
      userId,
      action,
      category: 'data_access',
      details: {
        dataAccessed,
        purpose: metadata.purpose,
        consentGiven: metadata.consentGiven,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      },
      severity: 'medium',
      source: metadata.source || 'system',
      sessionId: metadata.sessionId
    };

    return await this.createLogEntry(auditEntry);
  }

  /**
   * Log system events
   * @param {string} action - System action
   * @param {Object} details - System details
   * @param {string} severity - Severity level
   */
  async logSystemEvent(action, details = {}, severity = 'low') {
    const auditEntry = {
      userId: 'system',
      action,
      category: 'system',
      details,
      severity,
      source: 'system'
    };

    return await this.createLogEntry(auditEntry);
  }

  /**
   * Create audit log entry
   * @private
   * @param {Object} auditEntry - Audit entry data
   */
  async createLogEntry(auditEntry) {
    try {
      // Add timestamp and calculate retention date
      auditEntry.timestamp = new Date();
      auditEntry.retentionDate = new Date(Date.now() + this.retentionPeriod);

      // Create hash for integrity checking
      auditEntry.integrityHash = this.generateIntegrityHash(auditEntry);

      const auditLog = new AuditLog(auditEntry);
      await auditLog.save();

      // Log to console for development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[AUDIT] ${auditEntry.category.toUpperCase()}: ${auditEntry.action} by ${auditEntry.userId}`);
      }

      return {
        success: true,
        logId: auditLog._id,
        message: 'Audit log created successfully'
      };

    } catch (error) {
      console.error('Error creating audit log:', error);
      return {
        success: false,
        error: 'Failed to create audit log'
      };
    }
  }

  /**
   * Generate integrity hash for audit entry
   * @private
   * @param {Object} entry - Audit entry
   * @returns {string} SHA-256 hash
   */
  generateIntegrityHash(entry) {
    const crypto = require('crypto');
    const data = JSON.stringify({
      userId: entry.userId,
      action: entry.action,
      category: entry.category,
      timestamp: entry.timestamp,
      details: entry.details
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get audit logs with filtering
   * @param {Object} filters - Filter criteria
   * @param {Object} options - Query options
   * @returns {Object} Filtered audit logs
   */
  async getAuditLogs(filters = {}, options = {}) {
    try {
      const query = {};

      // Build query based on filters
      if (filters.userId) query.userId = filters.userId;
      if (filters.category) query.category = filters.category;
      if (filters.action) query.action = filters.action;
      if (filters.severity) query.severity = filters.severity;
      if (filters.resourceId) query.resourceId = filters.resourceId;
      if (filters.resourceType) query.resourceType = filters.resourceType;

      // Date range filtering
      if (filters.startDate || filters.endDate) {
        query.timestamp = {};
        if (filters.startDate) query.timestamp.$gte = new Date(filters.startDate);
        if (filters.endDate) query.timestamp.$lte = new Date(filters.endDate);
      }

      // Pagination
      const page = parseInt(options.page) || 1;
      const limit = parseInt(options.limit) || 50;
      const skip = (page - 1) * limit;

      // Sorting
      const sort = options.sort || { timestamp: -1 };

      const logs = await AuditLog.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('userId', 'fullName email')
        .lean();

      const total = await AuditLog.countDocuments(query);
      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        data: {
          logs,
          pagination: {
            currentPage: page,
            totalPages,
            totalLogs: total,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          }
        }
      };

    } catch (error) {
      console.error('Error retrieving audit logs:', error);
      return {
        success: false,
        error: 'Failed to retrieve audit logs'
      };
    }
  }

  /**
   * Get audit statistics
   * @param {Object} filters - Filter criteria
   * @returns {Object} Audit statistics
   */
  async getAuditStats(filters = {}) {
    try {
      const matchStage = {};

      // Build match stage based on filters
      if (filters.userId) matchStage.userId = filters.userId;
      if (filters.category) matchStage.category = filters.category;
      if (filters.startDate || filters.endDate) {
        matchStage.timestamp = {};
        if (filters.startDate) matchStage.timestamp.$gte = new Date(filters.startDate);
        if (filters.endDate) matchStage.timestamp.$lte = new Date(filters.endDate);
      }

      const stats = await AuditLog.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              category: '$category',
              severity: '$severity',
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$timestamp'
                }
              }
            },
            count: { $sum: 1 },
            uniqueUsers: { $addToSet: '$userId' }
          }
        },
        {
          $group: {
            _id: '$_id.category',
            severities: {
              $push: {
                severity: '$_id.severity',
                count: '$count',
                date: '$_id.date'
              }
            },
            totalEvents: { $sum: '$count' },
            uniqueUsersCount: { $sum: { $size: '$uniqueUsers' } }
          }
        }
      ]);

      return {
        success: true,
        data: stats
      };

    } catch (error) {
      console.error('Error getting audit statistics:', error);
      return {
        success: false,
        error: 'Failed to get audit statistics'
      };
    }
  }

  /**
   * Verify audit log integrity
   * @param {string} logId - Audit log ID
   * @returns {Object} Integrity verification result
   */
  async verifyIntegrity(logId) {
    try {
      const log = await AuditLog.findById(logId);
      if (!log) {
        return { success: false, error: 'Audit log not found' };
      }

      const currentHash = this.generateIntegrityHash(log);
      const isValid = currentHash === log.integrityHash;

      return {
        success: true,
        isValid,
        logId,
        expectedHash: log.integrityHash,
        calculatedHash: currentHash
      };

    } catch (error) {
      console.error('Error verifying audit log integrity:', error);
      return {
        success: false,
        error: 'Failed to verify integrity'
      };
    }
  }

  /**
   * Clean up old audit logs based on retention policy
   * @returns {Object} Cleanup result
   */
  async cleanupOldLogs() {
    try {
      const cutoffDate = new Date(Date.now() - this.retentionPeriod);
      const result = await AuditLog.deleteMany({
        retentionDate: { $lt: new Date() }
      });

      await this.logSystemEvent('audit_cleanup', {
        deletedCount: result.deletedCount,
        cutoffDate
      }, 'medium');

      return {
        success: true,
        deletedCount: result.deletedCount,
        message: `Cleaned up ${result.deletedCount} old audit logs`
      };

    } catch (error) {
      console.error('Error cleaning up old audit logs:', error);
      return {
        success: false,
        error: 'Failed to cleanup old logs'
      };
    }
  }

  /**
   * Get severity level for authentication actions
   * @private
   * @param {string} action - Action name
   * @returns {string} Severity level
   */
  getSeverityLevel(action) {
    const severityMap = {
      'login': 'low',
      'logout': 'low',
      'failed_login': 'medium',
      'password_change': 'medium',
      'account_locked': 'high',
      'suspicious_activity': 'high',
      '2fa_enabled': 'medium',
      '2fa_disabled': 'medium'
    };

    return severityMap[action] || 'low';
  }

  /**
   * Get severity level for loan actions
   * @private
   * @param {string} action - Action name
   * @returns {string} Severity level
   */
  getLoanSeverityLevel(action) {
    const severityMap = {
      'loan_created': 'medium',
      'loan_approved': 'high',
      'loan_rejected': 'medium',
      'loan_funded': 'high',
      'loan_repaid': 'medium',
      'loan_completed': 'medium',
      'loan_defaulted': 'high'
    };

    return severityMap[action] || 'low';
  }

  /**
   * Get severity level for payment actions
   * @private
   * @param {string} action - Action name
   * @returns {string} Severity level
   */
  getPaymentSeverityLevel(action) {
    const severityMap = {
      'payment_initiated': 'medium',
      'payment_completed': 'medium',
      'payment_failed': 'high',
      'payment_refunded': 'high',
      'large_transaction': 'high'
    };

    return severityMap[action] || 'low';
  }

  /**
   * Export audit logs for compliance
   * @param {Object} filters - Export filters
   * @param {string} format - Export format (json, csv)
   * @returns {Object} Export result
   */
  async exportAuditLogs(filters = {}, format = 'json') {
    try {
      const logs = await this.getAuditLogs(filters, { limit: 10000 });
      if (!logs.success) {
        return logs;
      }

      let exportData;
      if (format === 'csv') {
        exportData = this.convertToCSV(logs.data.logs);
      } else {
        exportData = logs.data.logs;
      }

      // Log the export action
      await this.logSystemEvent('audit_export', {
        filters,
        format,
        recordCount: logs.data.logs.length
      }, 'medium');

      return {
        success: true,
        data: exportData,
        format,
        recordCount: logs.data.logs.length
      };

    } catch (error) {
      console.error('Error exporting audit logs:', error);
      return {
        success: false,
        error: 'Failed to export audit logs'
      };
    }
  }

  /**
   * Convert logs to CSV format
   * @private
   * @param {Array} logs - Audit logs
   * @returns {string} CSV string
   */
  convertToCSV(logs) {
    if (logs.length === 0) return '';

    const headers = Object.keys(logs[0]);
    const csvRows = [headers.join(',')];

    for (const log of logs) {
      const values = headers.map(header => {
        const value = log[header];
        // Escape commas and quotes in CSV
        if (typeof value === 'object') {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }
}

module.exports = new AuditService();
