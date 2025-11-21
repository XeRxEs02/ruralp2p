/**
 * GDPRService - Comprehensive GDPR compliance implementation
 * Handles data subject rights, consent management, and data protection
 */

const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const auditService = require('./auditService');

class GDPRService {
  constructor() {
    this.dataRetentionPeriod = 7 * 365 * 24 * 60 * 60 * 1000; // 7 years
    this.consentRetentionPeriod = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years for consent records
  }

  /**
   * Handle GDPR data subject access request (DSAR)
   * @param {string} userId - User ID requesting data
   * @param {Object} options - Request options
   * @returns {Object} Data export result
   */
  async handleDataAccessRequest(userId, options = {}) {
    try {
      // Get user profile data
      const user = await User.findById(userId).select('-password -faceEmbedding -aadharSalt');
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Get user's audit logs
      const auditLogs = await AuditLog.find({ userId }).sort({ timestamp: -1 });

      // Get user's loan data
      const Loan = require('../models/Loan');
      const loans = await Loan.find({ borrowerId: userId })
        .populate('lenders.lenderId', 'fullName email')
        .select('-__v');

      // Get user's transaction data
      const Transaction = require('../models/Transaction');
      const transactions = await Transaction.find({
        $or: [{ borrowerId: userId }, { lenderId: userId }]
      }).sort({ createdAt: -1 });

      // Get user's documents
      const Document = require('../models/Document');
      const documents = await Document.find({ userId }).select('-__v');

      // Get user's notifications
      const Notification = require('../models/Notification');
      const notifications = await Notification.find({
        $or: [{ recipientId: userId }, { senderId: userId }]
      }).sort({ createdAt: -1 });

      // Compile comprehensive data export
      const dataExport = {
        userProfile: user,
        auditLogs: auditLogs,
        loans: loans,
        transactions: transactions,
        documents: documents,
        notifications: notifications,
        exportMetadata: {
          exportedAt: new Date(),
          exportedBy: 'system',
          purpose: options.purpose || 'DSAR',
          retentionPeriod: this.dataRetentionPeriod
        }
      };

      // Log the data access
      await auditService.logDataAccess(userId, 'data_exported', {
        dataTypes: Object.keys(dataExport),
        recordCounts: {
          auditLogs: auditLogs.length,
          loans: loans.length,
          transactions: transactions.length,
          documents: documents.length,
          notifications: notifications.length
        },
        purpose: options.purpose || 'DSAR'
      }, {
        purpose: 'GDPR_DSAR',
        consentGiven: true
      });

      return {
        success: true,
        data: dataExport,
        message: 'Data export completed successfully'
      };

    } catch (error) {
      console.error('Error handling data access request:', error);
      return {
        success: false,
        error: 'Failed to process data access request'
      };
    }
  }

  /**
   * Handle GDPR data portability request
   * @param {string} userId - User ID requesting data portability
   * @param {string} format - Export format (json, xml, csv)
   * @returns {Object} Data portability result
   */
  async handleDataPortability(userId, format = 'json') {
    try {
      const accessResult = await this.handleDataAccessRequest(userId, {
        purpose: 'data_portability'
      });

      if (!accessResult.success) {
        return accessResult;
      }

      let exportData;
      switch (format) {
        case 'xml':
          exportData = this.convertToXML(accessResult.data);
          break;
        case 'csv':
          exportData = this.convertToCSV(accessResult.data);
          break;
        default:
          exportData = JSON.stringify(accessResult.data, null, 2);
      }

      return {
        success: true,
        data: exportData,
        format: format,
        contentType: this.getContentType(format),
        filename: `gdpr-data-export-${userId}-${Date.now()}.${format === 'json' ? 'json' : format}`
      };

    } catch (error) {
      console.error('Error handling data portability:', error);
      return {
        success: false,
        error: 'Failed to process data portability request'
      };
    }
  }

  /**
   * Handle GDPR right to erasure (right to be forgotten)
   * @param {string} userId - User ID requesting erasure
   * @param {Object} options - Erasure options
   * @returns {Object} Erasure result
   */
  async handleRightToErasure(userId, options = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Check if user has consented to erasure
      if (!options.force && !user.gdprConsent) {
        return {
          success: false,
          error: 'User must provide explicit consent for data erasure'
        };
      }

      const erasureResults = {
        userProfile: false,
        auditLogs: false,
        loans: false,
        transactions: false,
        documents: false,
        notifications: false
      };

      // Anonymize or delete user profile
      if (options.anonymizeOnly) {
        // Anonymize user data instead of deleting
        user.fullName = 'Anonymous User';
        user.email = `anonymous_${userId}@deleted.local`;
        user.phone = 'DELETED';
        user.aadharNumber = 'DELETED';
        user.faceImage = null;
        user.aadharDocument = null;
        user.gdprConsent = false;
        await user.save();
        erasureResults.userProfile = true;
      } else {
        // Full deletion
        await User.findByIdAndDelete(userId);
        erasureResults.userProfile = true;
      }

      // Handle audit logs
      if (options.includeAuditLogs) {
        if (options.anonymizeOnly) {
          const auditLogs = await AuditLog.find({ userId });
          for (const log of auditLogs) {
            await log.anonymize();
          }
        } else {
          await AuditLog.deleteMany({ userId });
        }
        erasureResults.auditLogs = true;
      }

      // Handle loans (typically anonymize, don't delete for legal reasons)
      const Loan = require('../models/Loan');
      const loans = await Loan.find({ borrowerId: userId });
      for (const loan of loans) {
        loan.borrowerId = 'DELETED_USER';
        await loan.save();
      }
      erasureResults.loans = true;

      // Handle transactions
      const Transaction = require('../models/Transaction');
      if (options.anonymizeOnly) {
        await Transaction.updateMany(
          { $or: [{ borrowerId: userId }, { lenderId: userId }] },
          {
            $set: {
              borrowerId: borrowerId === userId ? 'DELETED_USER' : '$borrowerId',
              lenderId: lenderId === userId ? 'DELETED_USER' : '$lenderId'
            }
          }
        );
      } else {
        await Transaction.deleteMany({
          $or: [{ borrowerId: userId }, { lenderId: userId }]
        });
      }
      erasureResults.transactions = true;

      // Handle documents
      const Document = require('../models/Document');
      await Document.deleteMany({ userId });
      erasureResults.documents = true;

      // Handle notifications
      const Notification = require('../models/Notification');
      await Notification.deleteMany({
        $or: [{ recipientId: userId }, { senderId: userId }]
      });
      erasureResults.notifications = true;

      // Log the erasure action
      await auditService.logDataAccess('system', 'data_erasure_completed', {
        targetUserId: userId,
        erasureResults,
        anonymizedOnly: options.anonymizeOnly,
        includedAuditLogs: options.includeAuditLogs
      }, {
        purpose: 'GDPR_erasure',
        consentGiven: true
      });

      return {
        success: true,
        message: 'Data erasure completed successfully',
        results: erasureResults,
        anonymizedOnly: options.anonymizeOnly
      };

    } catch (error) {
      console.error('Error handling right to erasure:', error);
      return {
        success: false,
        error: 'Failed to process erasure request'
      };
    }
  }

  /**
   * Handle GDPR right to rectification
   * @param {string} userId - User ID requesting rectification
   * @param {Object} corrections - Data corrections
   * @returns {Object} Rectification result
   */
  async handleRightToRectification(userId, corrections) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const oldData = {
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        aadharNumber: user.aadharNumber
      };

      // Apply corrections
      if (corrections.fullName) user.fullName = corrections.fullName;
      if (corrections.email) user.email = corrections.email;
      if (corrections.phone) user.phone = corrections.phone;
      if (corrections.aadharNumber) user.aadharNumber = corrections.aadharNumber;

      await user.save();

      // Log the rectification
      await auditService.logDataAccess(userId, 'data_rectified', {
        oldData,
        newData: corrections,
        correctedFields: Object.keys(corrections)
      }, {
        purpose: 'GDPR_rectification',
        consentGiven: true
      });

      return {
        success: true,
        message: 'Data rectification completed successfully',
        correctedFields: Object.keys(corrections)
      };

    } catch (error) {
      console.error('Error handling right to rectification:', error);
      return {
        success: false,
        error: 'Failed to process rectification request'
      };
    }
  }

  /**
   * Manage user consent
   * @param {string} userId - User ID
   * @param {Object} consents - Consent settings
   * @returns {Object} Consent update result
   */
  async manageConsent(userId, consents) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const oldConsents = {
        gdprConsent: user.gdprConsent,
        dataRetentionConsent: user.dataRetentionConsent,
        marketingConsent: user.marketingConsent
      };

      // Update consents
      if (consents.gdprConsent !== undefined) user.gdprConsent = consents.gdprConsent;
      if (consents.dataRetentionConsent !== undefined) user.dataRetentionConsent = consents.dataRetentionConsent;
      if (consents.marketingConsent !== undefined) user.marketingConsent = consents.marketingConsent;

      await user.save();

      // Log consent changes
      await auditService.logDataAccess(userId, 'consent_updated', {
        oldConsents,
        newConsents: consents,
        changedFields: Object.keys(consents)
      }, {
        purpose: 'GDPR_consent',
        consentGiven: true
      });

      return {
        success: true,
        message: 'Consent settings updated successfully',
        consents: {
          gdprConsent: user.gdprConsent,
          dataRetentionConsent: user.dataRetentionConsent,
          marketingConsent: user.marketingConsent
        }
      };

    } catch (error) {
      console.error('Error managing consent:', error);
      return {
        success: false,
        error: 'Failed to update consent settings'
      };
    }
  }

  /**
   * Handle GDPR data processing restriction request
   * @param {string} userId - User ID
   * @param {boolean} restrict - Whether to restrict processing
   * @returns {Object} Restriction result
   */
  async handleProcessingRestriction(userId, restrict) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      user.processingRestricted = restrict;
      await user.save();

      // Log the restriction
      await auditService.logDataAccess(userId, restrict ? 'processing_restricted' : 'processing_restored', {
        restrictionStatus: restrict
      }, {
        purpose: 'GDPR_processing_restriction',
        consentGiven: true
      });

      return {
        success: true,
        message: `Data processing ${restrict ? 'restricted' : 'restored'} successfully`,
        processingRestricted: restrict
      };

    } catch (error) {
      console.error('Error handling processing restriction:', error);
      return {
        success: false,
        error: 'Failed to process restriction request'
      };
    }
  }

  /**
   * Get GDPR compliance status for user
   * @param {string} userId - User ID
   * @returns {Object} Compliance status
   */
  async getComplianceStatus(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Get data access logs
      const dataAccessLogs = await AuditLog.find({
        userId,
        category: 'data_access'
      }).sort({ timestamp: -1 }).limit(10);

      // Calculate data retention status
      const accountAge = Date.now() - user.createdAt.getTime();
      const retentionExpiry = new Date(user.createdAt.getTime() + this.dataRetentionPeriod);

      return {
        success: true,
        complianceStatus: {
          gdprConsent: user.gdprConsent,
          dataRetentionConsent: user.dataRetentionConsent,
          marketingConsent: user.marketingConsent,
          processingRestricted: user.processingRestricted || false,
          accountAge: accountAge,
          retentionExpiry: retentionExpiry,
          dataRetentionPeriod: this.dataRetentionPeriod,
          lastDataAccess: dataAccessLogs.length > 0 ? dataAccessLogs[0].timestamp : null,
          dataAccessCount: dataAccessLogs.length
        }
      };

    } catch (error) {
      console.error('Error getting compliance status:', error);
      return {
        success: false,
        error: 'Failed to get compliance status'
      };
    }
  }

  /**
   * Perform GDPR compliance audit
   * @returns {Object} Audit results
   */
  async performComplianceAudit() {
    try {
      const results = {
        totalUsers: 0,
        usersWithConsent: 0,
        usersWithoutConsent: 0,
        expiredConsents: 0,
        dataRetentionViolations: 0,
        anonymizedRecords: 0
      };

      // Count total users
      results.totalUsers = await User.countDocuments();

      // Count users with/without GDPR consent
      results.usersWithConsent = await User.countDocuments({ gdprConsent: true });
      results.usersWithoutConsent = await User.countDocuments({ gdprConsent: false });

      // Count expired audit logs (should be auto-deleted by TTL, but check)
      const expiredLogs = await AuditLog.countDocuments({
        retentionDate: { $lt: new Date() }
      });
      results.expiredRecords = expiredLogs;

      // Count anonymized records
      results.anonymizedRecords = await AuditLog.countDocuments({ dataAnonymized: true });

      // Log the audit
      await auditService.logSystemEvent('gdpr_compliance_audit', results, 'medium');

      return {
        success: true,
        auditResults: results,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Error performing compliance audit:', error);
      return {
        success: false,
        error: 'Failed to perform compliance audit'
      };
    }
  }

  /**
   * Convert data to XML format
   * @private
   * @param {Object} data - Data to convert
   * @returns {string} XML string
   */
  convertToXML(data) {
    // Simple XML conversion - in production, use a proper XML library
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<GDPRDataExport>\n';

    for (const [key, value] of Object.entries(data)) {
      xml += `  <${key}>\n`;
      xml += `    ${JSON.stringify(value, null, 4).replace(/\n/g, '\n    ')}\n`;
      xml += `  </${key}>\n`;
    }

    xml += '</GDPRDataExport>';
    return xml;
  }

  /**
   * Convert data to CSV format
   * @private
   * @param {Object} data - Data to convert
   * @returns {string} CSV string
   */
  convertToCSV(data) {
    // Convert to CSV - simplified implementation
    let csv = 'Section,Data\n';

    for (const [key, value] of Object.entries(data)) {
      csv += `"${key}","${JSON.stringify(value).replace(/"/g, '""')}"\n`;
    }

    return csv;
  }

  /**
   * Get content type for format
   * @private
   * @param {string} format - Export format
   * @returns {string} Content type
   */
  getContentType(format) {
    const types = {
      json: 'application/json',
      xml: 'application/xml',
      csv: 'text/csv'
    };
    return types[format] || 'application/octet-stream';
  }
}

module.exports = new GDPRService();
