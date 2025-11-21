const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * Transaction Schema for RuralConnect P2P Lending Platform
 * Tracks all payment transactions including loan payments, repayments, and transfers
 */
const transactionSchema = new mongoose.Schema({
  // Transaction Identifiers
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Loan and User Information
  loanId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
    ref: 'Loan'
  },
  
  borrowerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
    ref: 'User'
  },
  
  lenderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
    ref: 'User'
  },
  
  // Transaction Details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD', 'ETH']
  },
  
  type: {
    type: String,
    required: true,
    enum: ['loan_disbursement', 'emi_payment', 'full_repayment', 'penalty', 'interest', 'processing_fee']
  },
  
  // Payment Gateway Information
  razorpayOrderId: {
    type: String,
    sparse: true,
    index: true
  },
  
  razorpayPaymentId: {
    type: String,
    sparse: true
  },
  
  razorpaySignature: {
    type: String,
    sparse: true
  },
  
  // Blockchain Integration
  txnHash: {
    type: String,
    sparse: true
  },
  
  blockchainNetwork: {
    type: String,
    default: 'polygon_mumbai',
    enum: ['polygon_mumbai', 'polygon_mainnet', 'ethereum', 'local']
  },
  
  smartContractAddress: {
    type: String,
    sparse: true
  },
  
  gasUsed: {
    type: Number,
    sparse: true
  },
  
  gasFee: {
    type: Number,
    sparse: true
  },
  
  // Transaction Status and Tracking
  status: {
    type: String,
    required: true,
    default: 'pending',
    enum: ['pending', 'processing', 'confirmed', 'failed', 'cancelled', 'refunded']
  },
  
  failureReason: {
    type: String,
    sparse: true
  },
  
  // Metadata and Additional Information
  metadata: {
    paymentMethod: {
      type: String,
      enum: ['razorpay', 'upi', 'netbanking', 'card', 'wallet', 'mock']
    },
    deviceInfo: {
      userAgent: String,
      ipAddress: String,
      location: {
        lat: Number,
        lng: Number,
        address: String
      }
    },
    emiNumber: Number,
    totalEmis: Number,
    remainingAmount: Number
  },
  
  // Timestamps
  initiatedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  confirmedAt: {
    type: Date,
    sparse: true
  },
  
  // Notifications tracking
  notificationsSent: [{
    type: {
      type: String,
      enum: ['sms', 'email', 'push', 'websocket']
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    recipient: String,
    status: {
      type: String,
      enum: ['sent', 'delivered', 'failed'],
      default: 'sent'
    }
  }],
  
  // Sync and Offline Support
  syncStatus: {
    type: String,
    default: 'synced',
    enum: ['synced', 'pending_sync', 'conflict']
  },
  
  offlineCreated: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  versionKey: false
});

// Indexes for better query performance
transactionSchema.index({ loanId: 1, type: 1 });
transactionSchema.index({ borrowerId: 1, status: 1 });
transactionSchema.index({ lenderId: 1, status: 1 });
transactionSchema.index({ txnHash: 1 }, { sparse: true });
transactionSchema.index({ initiatedAt: -1 });
transactionSchema.index({ 'metadata.emiNumber': 1, loanId: 1 });

// Virtual for transaction reference
transactionSchema.virtual('displayId').get(function() {
  return `TXN${this.transactionId.slice(-8).toUpperCase()}`;
});

// Methods
transactionSchema.methods.markAsConfirmed = function(txnHash = null, gasFee = null) {
  this.status = 'confirmed';
  this.confirmedAt = new Date();
  if (txnHash) this.txnHash = txnHash;
  if (gasFee) this.gasFee = gasFee;
  return this.save();
};

transactionSchema.methods.markAsFailed = function(reason) {
  this.status = 'failed';
  this.failureReason = reason;
  return this.save();
};

transactionSchema.methods.addNotification = function(type, recipient, status = 'sent') {
  this.notificationsSent.push({
    type,
    recipient,
    status,
    sentAt: new Date()
  });
  return this.save();
};

// Statics
transactionSchema.statics.findByLoan = function(loanId, options = {}) {
  const query = this.find({ loanId });
  
  if (options.type) query.where('type', options.type);
  if (options.status) query.where('status', options.status);
  if (options.limit) query.limit(options.limit);
  
  return query.sort({ initiatedAt: -1 });
};

transactionSchema.statics.getPendingTransactions = function() {
  return this.find({ 
    status: { $in: ['pending', 'processing'] },
    initiatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
  });
};

transactionSchema.statics.getTransactionSummary = function(userId, userType = 'borrower') {
  const matchField = userType === 'borrower' ? 'borrowerId' : 'lenderId';
  
  return this.aggregate([
    { $match: { [matchField]: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);
};

// Pre-save middleware
transactionSchema.pre('save', function(next) {
  console.log('Pre-save middleware called:', { isNew: this.isNew, hasTransactionId: !!this.transactionId });
  if (this.isNew && !this.transactionId) {
    this.transactionId = uuidv4();
    console.log('Generated transactionId:', this.transactionId);
  }
  next();
});

// Post-save middleware for event emission
transactionSchema.post('save', function(doc, next) {
  const eventBus = require('../utils/eventBus');
  
  if (doc.status === 'confirmed' && doc.isModified('status')) {
    eventBus.emit('transaction.confirmed', {
      transactionId: doc.transactionId,
      loanId: doc.loanId,
      borrowerId: doc.borrowerId,
      lenderId: doc.lenderId,
      amount: doc.amount,
      type: doc.type,
      txnHash: doc.txnHash
    });
  }
  
  if (doc.status === 'failed' && doc.isModified('status')) {
    eventBus.emit('transaction.failed', {
      transactionId: doc.transactionId,
      loanId: doc.loanId,
      borrowerId: doc.borrowerId,
      failureReason: doc.failureReason
    });
  }
  
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
