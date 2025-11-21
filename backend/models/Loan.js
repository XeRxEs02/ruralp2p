import mongoose from 'mongoose';

const loanSchema = new mongoose.Schema({
  borrowerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Multi-lender support
  lenders: [{
    lenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    interestRate: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ['Pending', 'Active', 'Repaid', 'Defaulted'],
      default: 'Pending',
    },
    disbursedAt: {
      type: Date,
      default: null,
    },
    repaidAmount: {
      type: Number,
      default: 0,
    },
    blockchainTxHash: {
      type: String,
      default: null,
    },
  }],

  // Loan details
  totalAmount: {
    type: Number,
    required: true,
    min: 1,
  },
  duration: {
    type: Number,
    required: true,
    min: 1, // in months
  },
  averageInterestRate: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  purpose: {
    type: String,
    required: true,
    trim: true,
  },

  // Loan Status (FSM)
  status: {
    type: String,
    enum: ['PENDING', 'ACTIVE', 'DUE', 'REPAID', 'DEFAULTED', 'CANCELLED'],
    default: 'PENDING',
  },

  // Payment Information
  totalRepaidAmount: {
    type: Number,
    default: 0,
  },
  paymentStatus: {
    type: String,
    enum: ['Not Started', 'In Progress', 'Completed', 'Overdue'],
    default: 'Not Started',
  },

  // Blockchain Information
  blockchainTxHash: {
    type: String,
    default: null,
  },
  loanIdOnChain: {
    type: Number,
    default: null,
  },
  documentHash: {
    type: String,
    default: null,
  },

  // Asset-Backed Loan Information
  isAssetBacked: {
    type: Boolean,
    default: false,
  },
  collateralAssets: [{
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      required: true,
    },
    tokenId: String,
    collateralValue: {
      type: Number,
      required: true,
    },
    loanToValueRatio: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
  }],

  // Seasonal Repayment
  hasSeasonalRepayment: {
    type: Boolean,
    default: false,
  },
  seasonalRepaymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SeasonalRepayment',
    default: null,
  },

  // FSM State History
  stateHistory: [{
    state: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'DUE', 'REPAID', 'DEFAULTED', 'CANCELLED'],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  }],

  // Matching Information
  matchingScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 1,
  },
  matchedAt: {
    type: Date,
    default: null,
  },

  // Dates
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  disbursedAt: {
    type: Date,
    default: null,
  },
  dueDate: {
    type: Date,
    default: null,
  },
  completedAt: {
    type: Date,
    default: null,
  },
});

// Update the updatedAt field before saving
loanSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Calculate total amount owed (principal + interest)
loanSchema.methods.getTotalAmount = function() {
  return this.totalAmount + (this.totalAmount * this.averageInterestRate / 100);
};

// Calculate remaining amount
loanSchema.methods.getRemainingAmount = function() {
  return this.getTotalAmount() - this.totalRepaidAmount;
};

// Check if loan is overdue
loanSchema.methods.isOverdue = function() {
  if (!this.dueDate) return false;
  return new Date() > this.dueDate && this.status === 'ACTIVE';
};

// Virtual for loan progress percentage
loanSchema.virtual('progressPercentage').get(function() {
  const total = this.getTotalAmount();
  if (total === 0) return 0;
  return Math.min((this.totalRepaidAmount / total) * 100, 100);
});

// Get active lenders count
loanSchema.methods.getActiveLendersCount = function() {
  return this.lenders.filter(lender => lender.status === 'Active').length;
};

// Get total disbursed amount
loanSchema.methods.getTotalDisbursedAmount = function() {
  return this.lenders.reduce((sum, lender) => sum + lender.amount, 0);
};

// Check if all lenders have disbursed
loanSchema.methods.allLendersDisbursed = function() {
  return this.lenders.every(lender => lender.disbursedAt !== null);
};

// Ensure virtual fields are serialized
loanSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Loan', loanSchema);
