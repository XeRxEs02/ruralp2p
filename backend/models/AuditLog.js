const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // User Information
  userId: {
    type: String,
    required: true,
    index: true
  },

  // Action Details
  action: {
    type: String,
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: [
      'authentication',
      'authorization',
      'profile',
      'loan',
      'payment',
      'security',
      'administration',
      'data_access',
      'system',
      'compliance'
    ],
    required: true,
    index: true
  },

  // Resource Information (optional)
  resourceId: {
    type: String,
    index: true
  },
  resourceType: {
    type: String,
    enum: ['user', 'loan', 'transaction', 'document', 'notification', 'system'],
    index: true
  },

  // Detailed Information
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Severity and Priority
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low',
    index: true
  },

  // Source Information
  source: {
    type: String,
    enum: ['user', 'system', 'admin', 'api', 'mobile', 'web'],
    default: 'system',
    index: true
  },
  sessionId: {
    type: String,
    index: true
  },

  // Location and Device Information
  location: {
    country: String,
    region: String,
    city: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },

  // Integrity and Compliance
  integrityHash: {
    type: String,
    required: true
  },
  retentionDate: {
    type: Date,
    required: true,
    index: true
  },

  // GDPR Compliance
  gdprCompliant: {
    type: Boolean,
    default: true
  },
  dataAnonymized: {
    type: Boolean,
    default: false
  },

  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for efficient querying
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ category: 1, severity: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resourceId: 1, resourceType: 1 });
auditLogSchema.index({ retentionDate: 1 }, { expireAfterSeconds: 0 }); // TTL index for automatic cleanup

// Pre-save middleware
auditLogSchema.pre('save', function(next) {
  // Ensure retention date is set
  if (!this.retentionDate) {
    // Default 7 years retention
    this.retentionDate = new Date(Date.now() + (7 * 365 * 24 * 60 * 60 * 1000));
  }

  // Mark as GDPR compliant by default
  if (this.gdprCompliant === undefined) {
    this.gdprCompliant = true;
  }

  next();
});

// Static methods for querying
auditLogSchema.statics.getUserActivity = function(userId, options = {}) {
  const query = { userId };
  const limit = options.limit || 100;
  const sort = options.sort || { timestamp: -1 };

  return this.find(query).sort(sort).limit(limit);
};

auditLogSchema.statics.getSecurityEvents = function(options = {}) {
  const query = {
    category: 'security',
    severity: { $in: options.severity || ['high', 'critical'] }
  };

  if (options.startDate) {
    query.timestamp = { $gte: new Date(options.startDate) };
  }

  return this.find(query).sort({ timestamp: -1 });
};

auditLogSchema.statics.getGDPRDataAccess = function(userId) {
  return this.find({
    userId,
    category: 'data_access'
  }).sort({ timestamp: -1 });
};

// Instance methods
auditLogSchema.methods.anonymize = function() {
  // Remove or hash personally identifiable information
  if (this.details) {
    // Remove sensitive fields
    delete this.details.email;
    delete this.details.phone;
    delete this.details.ipAddress;

    // Hash userId for aggregation purposes
    if (this.userId && this.userId !== 'system' && this.userId !== 'anonymous') {
      const crypto = require('crypto');
      this.userId = crypto.createHash('sha256').update(this.userId).digest('hex');
    }
  }

  this.dataAnonymized = true;
  return this.save();
};

auditLogSchema.methods.isExpired = function() {
  return this.retentionDate < new Date();
};

// Virtual for formatted timestamp
auditLogSchema.virtual('formattedTimestamp').get(function() {
  return this.timestamp.toISOString();
});

// Ensure virtual fields are serialized
auditLogSchema.set('toJSON', { virtuals: true });
auditLogSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
