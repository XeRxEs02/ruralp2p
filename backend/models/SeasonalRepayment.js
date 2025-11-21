const mongoose = require('mongoose');

const seasonalRepaymentSchema = new mongoose.Schema({
  loanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan',
    required: true,
  },

  // Seasonal Configuration
  seasonType: {
    type: String,
    enum: ['Kharif', 'Rabi', 'Zaid', 'Custom'],
    required: true,
  },
  cropType: {
    type: String,
    required: true,
    trim: true,
  },

  // Repayment Schedule
  repaymentSchedule: [{
    installmentNumber: {
      type: Number,
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['Pending', 'Paid', 'Overdue', 'Waived'],
      default: 'Pending',
    },
    paidDate: Date,
    transactionHash: String,
    notes: String,
  }],

  // Seasonal Adjustments
  harvestSeasonStart: {
    type: Date,
    required: true,
  },
  harvestSeasonEnd: {
    type: Date,
    required: true,
  },
  expectedHarvestDate: Date,
  expectedYield: Number,
  yieldUnit: String,

  // Flexible Payment Options
  allowEarlyPayment: {
    type: Boolean,
    default: true,
  },
  allowPaymentDeferral: {
    type: Boolean,
    default: false,
  },
  maxDeferralDays: {
    type: Number,
    default: 30,
  },

  // Weather/Disaster Considerations
  weatherInsurance: {
    type: Boolean,
    default: false,
  },
  disasterClause: {
    type: Boolean,
    default: false,
  },
  insuranceProvider: String,
  insurancePolicyNumber: String,

  // Performance Tracking
  totalPaid: {
    type: Number,
    default: 0,
  },
  totalPending: {
    type: Number,
    default: 0,
  },
  lastPaymentDate: Date,
  nextPaymentDate: Date,

  // Status
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
seasonalRepaymentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Calculate total amount due
seasonalRepaymentSchema.methods.getTotalAmount = function() {
  return this.repaymentSchedule.reduce((sum, installment) => sum + installment.amount, 0);
};

// Calculate remaining amount
seasonalRepaymentSchema.methods.getRemainingAmount = function() {
  return this.repaymentSchedule
    .filter(installment => installment.status === 'Pending')
    .reduce((sum, installment) => sum + installment.amount, 0);
};

// Check if all payments are completed
seasonalRepaymentSchema.methods.isCompleted = function() {
  return this.repaymentSchedule.every(installment => installment.status === 'Paid');
};

// Get overdue installments
seasonalRepaymentSchema.methods.getOverdueInstallments = function() {
  const now = new Date();
  return this.repaymentSchedule.filter(
    installment => installment.status === 'Pending' && installment.dueDate < now
  );
};

// Get next installment
seasonalRepaymentSchema.methods.getNextInstallment = function() {
  return this.repaymentSchedule.find(
    installment => installment.status === 'Pending'
  );
};

// Calculate days until next payment
seasonalRepaymentSchema.methods.getDaysUntilNextPayment = function() {
  const nextInstallment = this.getNextInstallment();
  if (!nextInstallment) return 0;

  const now = new Date();
  const diffTime = nextInstallment.dueDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Update totals when installments change
seasonalRepaymentSchema.methods.updateTotals = function() {
  this.totalPaid = this.repaymentSchedule
    .filter(installment => installment.status === 'Paid')
    .reduce((sum, installment) => sum + installment.amount, 0);

  this.totalPending = this.repaymentSchedule
    .filter(installment => installment.status === 'Pending')
    .reduce((sum, installment) => sum + installment.amount, 0);

  // Update next payment date
  const nextInstallment = this.getNextInstallment();
  this.nextPaymentDate = nextInstallment ? nextInstallment.dueDate : null;

  // Update last payment date
  const paidInstallments = this.repaymentSchedule
    .filter(installment => installment.status === 'Paid')
    .sort((a, b) => new Date(b.paidDate) - new Date(a.paidDate));

  this.lastPaymentDate = paidInstallments.length > 0 ? paidInstallments[0].paidDate : null;
};

// Process payment
seasonalRepaymentSchema.methods.processPayment = function(installmentNumber, amount, transactionHash = null) {
  const installment = this.repaymentSchedule.find(
    inst => inst.installmentNumber === installmentNumber
  );

  if (!installment) {
    throw new Error(`Installment ${installmentNumber} not found`);
  }

  if (installment.status === 'Paid') {
    throw new Error(`Installment ${installmentNumber} already paid`);
  }

  // Mark as paid
  installment.status = 'Paid';
  installment.paidDate = new Date();
  if (transactionHash) {
    installment.transactionHash = transactionHash;
  }

  // Update totals
  this.updateTotals();

  return {
    success: true,
    installmentNumber,
    amount,
    remainingAmount: this.getRemainingAmount(),
    isCompleted: this.isCompleted(),
  };
};

// Check if payment can be deferred
seasonalRepaymentSchema.methods.canDeferPayment = function(installmentNumber) {
  if (!this.allowPaymentDeferral) return false;

  const installment = this.repaymentSchedule.find(
    inst => inst.installmentNumber === installmentNumber
  );

  if (!installment || installment.status !== 'Pending') return false;

  const daysOverdue = Math.floor((Date.now() - installment.dueDate) / (1000 * 60 * 60 * 24));
  return daysOverdue <= this.maxDeferralDays;
};

// Defer payment
seasonalRepaymentSchema.methods.deferPayment = function(installmentNumber, newDueDate, reason) {
  if (!this.canDeferPayment(installmentNumber)) {
    throw new Error('Payment cannot be deferred');
  }

  const installment = this.repaymentSchedule.find(
    inst => inst.installmentNumber === installmentNumber
  );

  installment.dueDate = newDueDate;
  installment.notes = (installment.notes || '') + `\nDeferred: ${reason}`;

  // Update next payment date
  this.updateTotals();

  return {
    success: true,
    installmentNumber,
    newDueDate,
    reason,
  };
};

// Virtual for completion percentage
seasonalRepaymentSchema.virtual('completionPercentage').get(function() {
  const total = this.getTotalAmount();
  if (total === 0) return 0;
  return (this.totalPaid / total) * 100;
});

// Virtual for overdue status
seasonalRepaymentSchema.virtual('isOverdue').get(function() {
  return this.getOverdueInstallments().length > 0;
});

// Ensure virtual fields are serialized
seasonalRepaymentSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('SeasonalRepayment', seasonalRepaymentSchema);
