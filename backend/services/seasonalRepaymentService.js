const SeasonalRepayment = require('../models/SeasonalRepayment');
const Loan = require('../models/Loan');
const User = require('../models/User');
const Notification = require('../models/Notification');
const blockchainService = require('./blockchainService');

/**
 * SeasonalRepaymentService - Handles seasonal/harvest-based repayment schedules
 * Designed for agricultural loans with flexible repayment based on crop cycles
 */
class SeasonalRepaymentService {
  constructor() {
    this.seasonalSchedules = new Map();
    console.log('🌾 Seasonal Repayment Service initialized');
  }

  /**
   * Create seasonal repayment schedule for a loan
   * @param {string} loanId - Loan ID
   * @param {Object} seasonalData - Seasonal repayment configuration
   * @param {string} createdBy - User ID creating the schedule
   * @returns {Promise<Object>} Created seasonal repayment
   */
  async createSeasonalRepayment(loanId, seasonalData, createdBy) {
    try {
      const { seasonType, cropType, harvestSeasonStart, harvestSeasonEnd,
              expectedHarvestDate, expectedYield, yieldUnit, repaymentSchedule } = seasonalData;

      // Validate required fields
      if (!seasonType || !cropType || !harvestSeasonStart || !harvestSeasonEnd || !repaymentSchedule) {
        throw new Error('Season type, crop type, harvest dates, and repayment schedule are required');
      }

      // Check if loan exists
      const loan = await Loan.findById(loanId);
      if (!loan) {
        throw new Error('Loan not found');
      }

      // Check if user is authorized (borrower or lender)
      if (loan.borrowerId.toString() !== createdBy) {
        throw new Error('Unauthorized: Only borrower can create seasonal repayment schedule');
      }

      // Create seasonal repayment schedule
      const seasonalRepayment = new SeasonalRepayment({
        loanId,
        seasonType,
        cropType,
        harvestSeasonStart,
        harvestSeasonEnd,
        expectedHarvestDate,
        expectedYield,
        yieldUnit,
        repaymentSchedule,
        createdBy,
        isActive: true,
      });

      // Update loan with seasonal repayment
      loan.hasSeasonalRepayment = true;
      loan.seasonalRepaymentId = seasonalRepayment._id;
      loan.dueDate = expectedHarvestDate; // Set loan due date to harvest date

      await seasonalRepayment.save();
      await loan.save();

      console.log(`🌾 Seasonal repayment created for loan ${loanId} (${cropType} - ${seasonType})`);

      return {
        success: true,
        seasonalRepayment: seasonalRepayment,
        loan: loan,
        message: 'Seasonal repayment schedule created successfully',
      };

    } catch (error) {
      console.error('Create seasonal repayment error:', error);
      throw new Error(`Failed to create seasonal repayment: ${error.message}`);
    }
  }

  /**
   * Process seasonal payment
   * @param {string} loanId - Loan ID
   * @param {number} installmentNumber - Installment number to pay
   * @param {number} amount - Payment amount
   * @param {string} payerId - User ID making payment
   * @returns {Promise<Object>} Payment result
   */
  async processSeasonalPayment(loanId, installmentNumber, amount, payerId) {
    try {
      // Get loan with seasonal repayment
      const loan = await Loan.findById(loanId)
        .populate('seasonalRepaymentId');

      if (!loan || !loan.seasonalRepaymentId) {
        throw new Error('Loan or seasonal repayment not found');
      }

      // Verify payer is the borrower
      if (loan.borrowerId.toString() !== payerId) {
        throw new Error('Only borrower can make payments');
      }

      const seasonalRepayment = loan.seasonalRepaymentId;

      // Process payment using seasonal repayment model
      const paymentResult = seasonalRepayment.processPayment(installmentNumber, amount);

      // Update loan totals
      loan.totalRepaidAmount = seasonalRepayment.totalPaid;
      loan.paymentStatus = seasonalRepayment.isCompleted() ? 'Completed' : 'In Progress';

      if (seasonalRepayment.isCompleted()) {
        loan.status = 'REPAID';
        loan.completedAt = new Date();
      }

      await loan.save();
      await seasonalRepayment.save();

      // Blockchain integration
      let blockchainResult;
      try {
        blockchainResult = await blockchainService.processRepayment({
          loanId: loan.loanIdOnChain,
          amount: amount,
          borrowerAddress: loan.borrowerId.walletAddress,
          paymentId: `seasonal-${installmentNumber}-${Date.now()}`
        });
        console.log('✅ Seasonal payment recorded on blockchain:', blockchainResult.txHash);
      } catch (blockchainError) {
        console.error('❌ Blockchain payment error:', blockchainError.message);
        blockchainResult = { success: false, error: blockchainError.message };
      }

      // Send notifications
      await this.sendPaymentNotifications(loan, seasonalRepayment, amount, installmentNumber);

      console.log(`💰 Seasonal payment processed: ₹${amount} for installment ${installmentNumber}`);

      return {
        success: true,
        paymentResult: paymentResult,
        loan: loan,
        seasonalRepayment: seasonalRepayment,
        blockchain: blockchainResult,
        message: 'Seasonal payment processed successfully',
      };

    } catch (error) {
      console.error('Process seasonal payment error:', error);
      throw error;
    }
  }

  /**
   * Defer seasonal payment due to weather/natural causes
   * @param {string} loanId - Loan ID
   * @param {number} installmentNumber - Installment to defer
   * @param {Date} newDueDate - New due date
   * @param {string} reason - Reason for deferral
   * @param {string} userId - User requesting deferral
   * @returns {Promise<Object>} Deferral result
   */
  async deferSeasonalPayment(loanId, installmentNumber, newDueDate, reason, userId) {
    try {
      const loan = await Loan.findById(loanId)
        .populate('seasonalRepaymentId');

      if (!loan || !loan.seasonalRepaymentId) {
        throw new Error('Loan or seasonal repayment not found');
      }

      // Verify user is the borrower
      if (loan.borrowerId.toString() !== userId) {
        throw new Error('Only borrower can request payment deferral');
      }

      const seasonalRepayment = loan.seasonalRepaymentId;

      // Process deferral
      const deferralResult = seasonalRepayment.deferPayment(installmentNumber, newDueDate, reason);

      await seasonalRepayment.save();

      // Send notifications
      await this.sendDeferralNotifications(loan, installmentNumber, newDueDate, reason);

      console.log(`⏰ Seasonal payment deferred: Installment ${installmentNumber} to ${newDueDate.toDateString()}`);

      return {
        success: true,
        deferralResult: deferralResult,
        seasonalRepayment: seasonalRepayment,
        message: 'Payment deferred successfully',
      };

    } catch (error) {
      console.error('Defer seasonal payment error:', error);
      throw error;
    }
  }

  /**
   * Get seasonal repayment status
   * @param {string} loanId - Loan ID
   * @returns {Promise<Object>} Seasonal repayment status
   */
  async getSeasonalRepaymentStatus(loanId) {
    try {
      const loan = await Loan.findById(loanId)
        .populate('seasonalRepaymentId')
        .populate('borrowerId', 'fullName email phone');

      if (!loan || !loan.seasonalRepaymentId) {
        throw new Error('Loan or seasonal repayment not found');
      }

      const seasonalRepayment = loan.seasonalRepaymentId;

      return {
        success: true,
        loan: loan,
        seasonalRepayment: seasonalRepayment,
        status: {
          totalAmount: seasonalRepayment.getTotalAmount(),
          remainingAmount: seasonalRepayment.getRemainingAmount(),
          totalPaid: seasonalRepayment.totalPaid,
          completionPercentage: seasonalRepayment.completionPercentage,
          isCompleted: seasonalRepayment.isCompleted(),
          isOverdue: seasonalRepayment.isOverdue,
          nextInstallment: seasonalRepayment.getNextInstallment(),
          daysUntilNextPayment: seasonalRepayment.getDaysUntilNextPayment(),
          overdueInstallments: seasonalRepayment.getOverdueInstallments(),
        },
      };

    } catch (error) {
      console.error('Get seasonal repayment status error:', error);
      throw error;
    }
  }

  /**
   * Check for seasonal payments due soon
   * @param {number} daysAhead - Check payments due within X days
   * @returns {Promise<Object>} Upcoming payments
   */
  async checkUpcomingSeasonalPayments(daysAhead = 7) {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);

      const seasonalRepayments = await SeasonalRepayment.find({ isActive: true })
        .populate('loanId')
        .populate('createdBy', 'fullName email phone');

      const upcomingPayments = [];

      for (const repayment of seasonalRepayments) {
        const nextInstallment = repayment.getNextInstallment();
        if (nextInstallment && nextInstallment.dueDate <= futureDate) {
          upcomingPayments.push({
            repayment: repayment,
            loan: repayment.loanId,
            borrower: repayment.createdBy,
            nextInstallment: nextInstallment,
            daysUntilDue: repayment.getDaysUntilNextPayment(),
          });
        }
      }

      return {
        success: true,
        upcomingPayments: upcomingPayments,
        count: upcomingPayments.length,
        checkDate: futureDate,
      };

    } catch (error) {
      console.error('Check upcoming seasonal payments error:', error);
      throw error;
    }
  }

  /**
   * Generate seasonal repayment schedule
   * @param {number} totalAmount - Total loan amount
   * @param {number} durationMonths - Loan duration in months
   * @param {string} seasonType - Type of season
   * @param {Date} harvestDate - Expected harvest date
   * @returns {Array} Generated repayment schedule
   */
  generateSeasonalSchedule(totalAmount, durationMonths, seasonType, harvestDate) {
    const schedule = [];
    const monthlyAmount = totalAmount / durationMonths;

    for (let i = 1; i <= durationMonths; i++) {
      const dueDate = new Date(harvestDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      schedule.push({
        installmentNumber: i,
        dueDate: dueDate,
        amount: monthlyAmount,
        status: 'Pending',
      });
    }

    return schedule;
  }

  /**
   * Send payment notifications
   * @private
   */
  async sendPaymentNotifications(loan, seasonalRepayment, amount, installmentNumber) {
    try {
      const notifications = [];

      // Notify lenders
      for (const lender of loan.lenders || []) {
        if (lender.lenderId) {
          notifications.push({
            recipientId: lender.lenderId,
            type: 'PaymentReceived',
            title: 'Seasonal Payment Received',
            message: `Seasonal payment of ₹${amount} received for installment ${installmentNumber}.`,
            relatedLoanId: loan._id,
            priority: 'Medium',
            channels: {
              email: true,
              sms: false,
              push: true,
              inApp: true,
            },
          });
        }
      }

      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
        console.log(`📱 Sent ${notifications.length} payment notifications`);
      }

    } catch (error) {
      console.error('Payment notification error:', error);
    }
  }

  /**
   * Send deferral notifications
   * @private
   */
  async sendDeferralNotifications(loan, installmentNumber, newDueDate, reason) {
    try {
      const notifications = [];

      // Notify lenders about deferral
      for (const lender of loan.lenders || []) {
        if (lender.lenderId) {
          notifications.push({
            recipientId: lender.lenderId,
            type: 'PaymentDeferred',
            title: 'Payment Deferred',
            message: `Installment ${installmentNumber} deferred to ${newDueDate.toDateString()}. Reason: ${reason}`,
            relatedLoanId: loan._id,
            priority: 'Medium',
            channels: {
              email: true,
              sms: false,
              push: true,
              inApp: true,
            },
          });
        }
      }

      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
        console.log(`📱 Sent ${notifications.length} deferral notifications`);
      }

    } catch (error) {
      console.error('Deferral notification error:', error);
    }
  }

  /**
   * Get seasonal repayment analytics
   * @param {string} userId - User ID (optional, for user-specific data)
   * @returns {Promise<Object>} Analytics data
   */
  async getSeasonalAnalytics(userId = null) {
    try {
      let query = { isActive: true };
      if (userId) {
        // Get loans for user and their seasonal repayments
        const userLoans = await Loan.find({
          $or: [
            { borrowerId: userId },
            { 'lenders.lenderId': userId }
          ]
        }).select('_id');

        const loanIds = userLoans.map(loan => loan._id);
        query.loanId = { $in: loanIds };
      }

      const repayments = await SeasonalRepayment.find(query)
        .populate('loanId')
        .populate('createdBy', 'fullName');

      const analytics = {
        totalSchedules: repayments.length,
        bySeasonType: {},
        byCropType: {},
        completionStats: {
          completed: 0,
          inProgress: 0,
          overdue: 0,
        },
        totalValue: 0,
        totalPaid: 0,
      };

      repayments.forEach(repayment => {
        // Group by season type
        analytics.bySeasonType[repayment.seasonType] =
          (analytics.bySeasonType[repayment.seasonType] || 0) + 1;

        // Group by crop type
        analytics.byCropType[repayment.cropType] =
          (analytics.byCropType[repayment.cropType] || 0) + 1;

        // Completion stats
        if (repayment.isCompleted()) {
          analytics.completionStats.completed++;
        } else if (repayment.isOverdue) {
          analytics.completionStats.overdue++;
        } else {
          analytics.completionStats.inProgress++;
        }

        // Totals
        analytics.totalValue += repayment.getTotalAmount();
        analytics.totalPaid += repayment.totalPaid;
      });

      return {
        success: true,
        analytics: analytics,
        period: 'All time',
      };

    } catch (error) {
      console.error('Get seasonal analytics error:', error);
      throw error;
    }
  }
}

// Export singleton instance
const seasonalRepaymentService = new SeasonalRepaymentService();

module.exports = {
  SeasonalRepaymentService,
  seasonalRepaymentService,
  createSeasonalRepayment: (loanId, seasonalData, createdBy) =>
    seasonalRepaymentService.createSeasonalRepayment(loanId, seasonalData, createdBy),
  processSeasonalPayment: (loanId, installmentNumber, amount, payerId) =>
    seasonalRepaymentService.processSeasonalPayment(loanId, installmentNumber, amount, payerId),
  deferSeasonalPayment: (loanId, installmentNumber, newDueDate, reason, userId) =>
    seasonalRepaymentService.deferSeasonalPayment(loanId, installmentNumber, newDueDate, reason, userId),
  getSeasonalRepaymentStatus: (loanId) =>
    seasonalRepaymentService.getSeasonalRepaymentStatus(loanId),
  checkUpcomingSeasonalPayments: (daysAhead) =>
    seasonalRepaymentService.checkUpcomingSeasonalPayments(daysAhead),
  generateSeasonalSchedule: (totalAmount, durationMonths, seasonType, harvestDate) =>
    seasonalRepaymentService.generateSeasonalSchedule(totalAmount, durationMonths, seasonType, harvestDate),
  getSeasonalAnalytics: (userId) =>
    seasonalRepaymentService.getSeasonalAnalytics(userId),
};
