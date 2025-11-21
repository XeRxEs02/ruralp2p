/**
 * Loan Refinancing Service
 * Handles loan refinancing applications, eligibility checks,
 * and seamless loan transitions with improved terms
 */

const Loan = require('../models/Loan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const auditService = require('./auditService');
const dynamicInterestService = require('./dynamicInterestService');

class LoanRefinancingService {
  constructor() {
    // Refinancing eligibility criteria
    this.eligibilityCriteria = {
      minimumLoanAge: 3 * 30 * 24 * 60 * 60 * 1000, // 3 months
      minimumRemainingAmount: 10000, // ₹10,000 minimum
      minimumCreditScore: 650,
      maximumRefinancingFrequency: 2, // Max 2 refinancing per year
      minimumTimeBetweenRefinancing: 6 * 30 * 24 * 60 * 60 * 1000, // 6 months
      minimumOnTimePayments: 0.8, // 80% on-time payment rate
      maximumDPD: 30 // Maximum 30 days past due
    };

    // Refinancing benefits and costs
    this.refinancingFees = {
      processingFee: 0.015, // 1.5% of loan amount
      prepaymentPenalty: 0.02, // 2% for early payoff
      documentationFee: 500, // Fixed fee
      stampDuty: 0.005 // 0.5% of loan amount
    };

    // Refinancing incentives
    this.incentives = {
      loyalCustomerDiscount: 0.005, // 0.5% discount for loyal customers
      digitalChannelBonus: 0.003,   // 0.3% bonus for digital applications
      timelyPaymentBonus: 0.002,    // 0.2% bonus for excellent payment history
      bulkRefinancingDiscount: 0.01  // 1% discount for multiple loans
    };
  }

  /**
   * Check refinancing eligibility for a loan
   * @param {string} loanId - Loan ID to check
   * @param {string} userId - User ID requesting refinancing
   * @returns {Object} Eligibility assessment
   */
  async checkRefinancingEligibility(loanId, userId) {
    try {
      console.log(`\n=== 🔄 CHECKING REFINANCING ELIGIBILITY ===`);
      console.log(`Loan ID: ${loanId}, User ID: ${userId}`);

      // Get loan details
      const loan = await Loan.findById(loanId).populate('borrowerId');
      if (!loan) {
        return { eligible: false, reason: 'Loan not found' };
      }

      // Verify ownership
      if (loan.borrowerId._id.toString() !== userId) {
        return { eligible: false, reason: 'Unauthorized access to loan' };
      }

      // Check loan status
      if (!['ACTIVE', 'DEFAULTED'].includes(loan.status)) {
        return { eligible: false, reason: `Loan status ${loan.status} not eligible for refinancing` };
      }

      const eligibilityChecks = {
        loanAge: false,
        remainingAmount: false,
        creditScore: false,
        paymentHistory: false,
        frequencyLimit: false,
        timeGap: false,
        overallEligibility: false
      };

      let ineligibilityReasons = [];

      // 1. Check loan age
      const loanAge = Date.now() - loan.createdAt.getTime();
      eligibilityChecks.loanAge = loanAge >= this.eligibilityCriteria.minimumLoanAge;
      if (!eligibilityChecks.loanAge) {
        ineligibilityReasons.push(`Loan too new (minimum ${Math.round(this.eligibilityCriteria.minimumLoanAge / (30 * 24 * 60 * 60 * 1000))} months required)`);
      }

      // 2. Check remaining amount
      const remainingAmount = loan.totalAmount - (loan.totalRepaidAmount || 0);
      eligibilityChecks.remainingAmount = remainingAmount >= this.eligibilityCriteria.minimumRemainingAmount;
      if (!eligibilityChecks.remainingAmount) {
        ineligibilityReasons.push(`Insufficient remaining balance (minimum ₹${this.eligibilityCriteria.minimumRemainingAmount.toLocaleString()} required)`);
      }

      // 3. Check credit score
      const creditScore = loan.borrowerId.creditScore || 650;
      eligibilityChecks.creditScore = creditScore >= this.eligibilityCriteria.minimumCreditScore;
      if (!eligibilityChecks.creditScore) {
        ineligibilityReasons.push(`Credit score too low (minimum ${this.eligibilityCriteria.minimumCreditScore} required, current: ${creditScore})`);
      }

      // 4. Check payment history
      const onTimePaymentRate = await this.calculateOnTimePaymentRate(userId);
      const maxDPD = await this.getMaxDaysPastDue(userId);
      eligibilityChecks.paymentHistory =
        onTimePaymentRate >= this.eligibilityCriteria.minimumOnTimePayments &&
        maxDPD <= this.eligibilityCriteria.maximumDPD;

      if (!eligibilityChecks.paymentHistory) {
        ineligibilityReasons.push(`Poor payment history (on-time rate: ${(onTimePaymentRate * 100).toFixed(1)}%, max DPD: ${maxDPD} days)`);
      }

      // 5. Check refinancing frequency
      const refinancingCount = await this.getRefinancingCount(userId, 365 * 24 * 60 * 60 * 1000); // Last year
      eligibilityChecks.frequencyLimit = refinancingCount < this.eligibilityCriteria.maximumRefinancingFrequency;
      if (!eligibilityChecks.frequencyLimit) {
        ineligibilityReasons.push(`Too many refinancing applications (${refinancingCount} in last year, maximum ${this.eligibilityCriteria.maximumRefinancingFrequency} allowed)`);
      }

      // 6. Check time gap since last refinancing
      const lastRefinancingDate = await this.getLastRefinancingDate(userId);
      const timeSinceLastRefinancing = lastRefinancingDate ?
        Date.now() - lastRefinancingDate.getTime() : Infinity;
      eligibilityChecks.timeGap = timeSinceLastRefinancing >= this.eligibilityCriteria.minimumTimeBetweenRefinancing;
      if (!eligibilityChecks.timeGap) {
        const monthsRemaining = Math.ceil((this.eligibilityCriteria.minimumTimeBetweenRefinancing - timeSinceLastRefinancing) / (30 * 24 * 60 * 60 * 1000));
        ineligibilityReasons.push(`Too soon since last refinancing (${monthsRemaining} months remaining)`);
      }

      // Overall eligibility
      eligibilityChecks.overallEligibility = Object.values(eligibilityChecks).every(check => check);

      const result = {
        eligible: eligibilityChecks.overallEligibility,
        loanId: loanId,
        remainingAmount: remainingAmount,
        currentInterestRate: loan.averageInterestRate,
        eligibilityChecks: eligibilityChecks,
        ineligibilityReasons: ineligibilityReasons,
        potentialSavings: eligibilityChecks.overallEligibility ?
          await this.calculatePotentialSavings(loan, remainingAmount) : null,
        nextEligibleDate: !eligibilityChecks.timeGap ?
          new Date(lastRefinancingDate.getTime() + this.eligibilityCriteria.minimumTimeBetweenRefinancing) : null
      };

      console.log(`Eligibility Result: ${result.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
      if (!result.eligible) {
        console.log(`Reasons: ${result.ineligibilityReasons.join(', ')}`);
      }

      return result;

    } catch (error) {
      console.error('Error checking refinancing eligibility:', error);
      return {
        eligible: false,
        error: 'Failed to check eligibility',
        details: error.message
      };
    }
  }

  /**
   * Calculate on-time payment rate for user
   * @param {string} userId - User ID
   * @returns {number} On-time payment rate (0-1)
   */
  async calculateOnTimePaymentRate(userId) {
    try {
      const transactions = await Transaction.find({
        borrowerId: userId,
        type: { $in: ['emi_payment', 'full_repayment'] }
      }).sort({ createdAt: -1 }).limit(12); // Last 12 payments

      if (transactions.length === 0) return 1.0; // No history = perfect record

      const onTimePayments = transactions.filter(t => {
        // Consider payment on-time if within 7 days of due date
        const dueDate = new Date(t.dueDate);
        const paymentDate = new Date(t.createdAt);
        const daysDifference = (paymentDate - dueDate) / (24 * 60 * 60 * 1000);
        return daysDifference <= 7;
      }).length;

      return onTimePayments / transactions.length;
    } catch (error) {
      console.error('Error calculating on-time payment rate:', error);
      return 0.5; // Conservative default
    }
  }

  /**
   * Get maximum days past due for user
   * @param {string} userId - User ID
   * @returns {number} Maximum DPD
   */
  async getMaxDaysPastDue(userId) {
    try {
      const transactions = await Transaction.find({
        borrowerId: userId,
        type: { $in: ['emi_payment', 'full_repayment'] }
      }).sort({ createdAt: -1 }).limit(12);

      let maxDPD = 0;
      transactions.forEach(t => {
        if (t.dueDate && t.createdAt) {
          const dueDate = new Date(t.dueDate);
          const paymentDate = new Date(t.createdAt);
          const daysDifference = (paymentDate - dueDate) / (24 * 60 * 60 * 1000);
          if (daysDifference > maxDPD) {
            maxDPD = daysDifference;
          }
        }
      });

      return Math.max(0, maxDPD);
    } catch (error) {
      console.error('Error getting max days past due:', error);
      return 0;
    }
  }

  /**
   * Get refinancing count for user in time period
   * @param {string} userId - User ID
   * @param {number} timePeriod - Time period in milliseconds
   * @returns {number} Number of refinancing applications
   */
  async getRefinancingCount(userId, timePeriod) {
    try {
      // This would typically query a refinancing applications collection
      // For now, return 0 as we don't have this data
      return 0;
    } catch (error) {
      console.error('Error getting refinancing count:', error);
      return 0;
    }
  }

  /**
   * Get last refinancing date for user
   * @param {string} userId - User ID
   * @returns {Date|null} Last refinancing date
   */
  async getLastRefinancingDate(userId) {
    try {
      // This would typically query refinancing history
      // For now, return null (no previous refinancing)
      return null;
    } catch (error) {
      console.error('Error getting last refinancing date:', error);
      return null;
    }
  }

  /**
   * Calculate potential savings from refinancing
   * @param {Object} loan - Loan object
   * @param {number} remainingAmount - Remaining loan amount
   * @returns {Object} Potential savings breakdown
   */
  async calculatePotentialSavings(loan, remainingAmount) {
    try {
      // Get current market rate for similar loan
      const marketData = await dynamicInterestService.getMarketConditions();
      const newRate = marketData.averageRate * 0.9; // Assume 10% discount for refinancing

      const currentRate = loan.averageInterestRate;
      const rateReduction = currentRate - newRate;

      // Calculate monthly payment reduction
      const remainingMonths = loan.duration - Math.floor((Date.now() - loan.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000));
      const currentMonthlyPayment = dynamicInterestService.calculateMonthlyPayment(remainingAmount, currentRate, remainingMonths);
      const newMonthlyPayment = dynamicInterestService.calculateMonthlyPayment(remainingAmount, newRate, remainingMonths);

      const monthlySavings = currentMonthlyPayment - newMonthlyPayment;
      const totalSavings = monthlySavings * remainingMonths;

      // Calculate fees
      const processingFee = remainingAmount * this.refinancingFees.processingFee;
      const documentationFee = this.refinancingFees.documentationFee;
      const stampDuty = remainingAmount * this.refinancingFees.stampDuty;
      const totalFees = processingFee + documentationFee + stampDuty;

      // Net savings
      const netSavings = totalSavings - totalFees;
      const breakevenMonths = totalFees / monthlySavings;

      return {
        currentRate: currentRate,
        newRate: newRate,
        rateReduction: rateReduction,
        monthlySavings: Math.round(monthlySavings),
        totalSavings: Math.round(totalSavings),
        totalFees: Math.round(totalFees),
        netSavings: Math.round(netSavings),
        breakevenMonths: Math.round(breakevenMonths * 10) / 10,
        remainingMonths: remainingMonths,
        feesBreakdown: {
          processingFee: Math.round(processingFee),
          documentationFee: documentationFee,
          stampDuty: Math.round(stampDuty)
        }
      };
    } catch (error) {
      console.error('Error calculating potential savings:', error);
      return {
        error: 'Unable to calculate savings',
        currentRate: loan.averageInterestRate,
        estimatedSavings: 0
      };
    }
  }

  /**
   * Submit refinancing application
   * @param {string} loanId - Loan ID to refinance
   * @param {string} userId - User ID
   * @param {Object} refinancingOptions - Refinancing preferences
   * @returns {Object} Application result
   */
  async submitRefinancingApplication(loanId, userId, refinancingOptions = {}) {
    try {
      console.log(`\n=== 📝 SUBMITTING REFINANCING APPLICATION ===`);
      console.log(`Loan ID: ${loanId}, User ID: ${userId}`);

      // Check eligibility first
      const eligibilityCheck = await this.checkRefinancingEligibility(loanId, userId);
      if (!eligibilityCheck.eligible) {
        return {
          success: false,
          error: 'Not eligible for refinancing',
          reasons: eligibilityCheck.ineligibilityReasons
        };
      }

      // Get loan details
      const loan = await Loan.findById(loanId);
      const remainingAmount = loan.totalAmount - (loan.totalRepaidAmount || 0);

      // Calculate new loan terms
      const newLoanTerms = await this.calculateNewLoanTerms(loan, remainingAmount, refinancingOptions);

      // Calculate fees and incentives
      const feesAndIncentives = this.calculateFeesAndIncentives(loan, userId, refinancingOptions);

      // Create refinancing application record
      const refinancingApplication = {
        applicationId: this.generateApplicationId(),
        originalLoanId: loanId,
        borrowerId: userId,
        remainingAmount: remainingAmount,
        currentTerms: {
          interestRate: loan.averageInterestRate,
          remainingMonths: loan.duration - Math.floor((Date.now() - loan.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000)),
          monthlyPayment: eligibilityCheck.potentialSavings ? 0 : 0 // Would calculate current payment
        },
        newTerms: newLoanTerms,
        feesAndIncentives: feesAndIncentives,
        netSavings: newLoanTerms.monthlyPayment < eligibilityCheck.potentialSavings?.currentMonthlyPayment ?
          (eligibilityCheck.potentialSavings.currentMonthlyPayment - newLoanTerms.monthlyPayment) * newLoanTerms.duration : 0,
        applicationDate: new Date(),
        status: 'PENDING',
        documentsRequired: this.getRequiredDocuments(loan),
        estimatedProcessingTime: '3-5 business days'
      };

      // Log the application
      await auditService.logLoanActivity(userId, loanId, 'refinancing_application_submitted', {
        applicationId: refinancingApplication.applicationId,
        remainingAmount: remainingAmount,
        newInterestRate: newLoanTerms.interestRate,
        estimatedSavings: refinancingApplication.netSavings
      });

      console.log(`✅ Refinancing application submitted: ${refinancingApplication.applicationId}`);

      return {
        success: true,
        application: refinancingApplication,
        message: 'Refinancing application submitted successfully',
        nextSteps: [
          'Document verification (2-3 days)',
          'Credit assessment',
          'Loan approval',
          'Agreement signing',
          'Fund disbursement'
        ]
      };

    } catch (error) {
      console.error('Error submitting refinancing application:', error);
      return {
        success: false,
        error: 'Failed to submit refinancing application',
        details: error.message
      };
    }
  }

  /**
   * Calculate new loan terms for refinancing
   * @param {Object} loan - Original loan
   * @param {number} remainingAmount - Remaining amount
   * @param {Object} options - Refinancing options
   * @returns {Object} New loan terms
   */
  async calculateNewLoanTerms(loan, remainingAmount, options = {}) {
    try {
      // Get current market conditions
      const marketData = await dynamicInterestService.getMarketConditions();

      // Base new rate on market conditions with refinancing discount
      let newRate = marketData.averageRate;

      // Apply refinancing incentives
      newRate -= 1.5; // Base refinancing discount

      // Apply additional incentives based on profile
      if (options.digitalApplication) newRate -= this.incentives.digitalChannelBonus * 100;
      if (options.loyalCustomer) newRate -= this.incentives.loyalCustomerDiscount * 100;

      // Ensure reasonable bounds
      newRate = Math.max(6.0, Math.min(newRate, loan.averageInterestRate - 0.5)); // At least 0.5% reduction

      // Determine new duration (can extend or keep same)
      const newDuration = options.extendDuration ?
        Math.max(loan.duration, options.newDuration || loan.duration) : loan.duration;

      // Calculate new monthly payment
      const monthlyPayment = dynamicInterestService.calculateMonthlyPayment(remainingAmount, newRate, newDuration);

      return {
        interestRate: Math.round(newRate * 100) / 100,
        duration: newDuration,
        monthlyPayment: Math.round(monthlyPayment),
        totalAmount: remainingAmount,
        totalInterest: Math.round(monthlyPayment * newDuration - remainingAmount),
        effectiveDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from approval
      };
    } catch (error) {
      console.error('Error calculating new loan terms:', error);
      // Return conservative fallback terms
      return {
        interestRate: Math.max(6.0, loan.averageInterestRate - 1.0),
        duration: loan.duration,
        monthlyPayment: 0, // Would need to calculate
        totalAmount: remainingAmount,
        error: 'Term calculation failed'
      };
    }
  }

  /**
   * Calculate fees and incentives for refinancing
   * @param {Object} loan - Original loan
   * @param {string} userId - User ID
   * @param {Object} options - Refinancing options
   * @returns {Object} Fees and incentives breakdown
   */
  calculateFeesAndIncentives(loan, userId, options = {}) {
    const remainingAmount = loan.totalAmount - (loan.totalRepaidAmount || 0);

    const fees = {
      processingFee: Math.round(remainingAmount * this.refinancingFees.processingFee),
      documentationFee: this.refinancingFees.documentationFee,
      stampDuty: Math.round(remainingAmount * this.refinancingFees.stampDuty),
      prepaymentPenalty: options.earlyClosure ?
        Math.round(remainingAmount * this.refinancingFees.prepaymentPenalty) : 0
    };

    const incentives = {
      loyalCustomerDiscount: options.loyalCustomer ?
        Math.round(remainingAmount * this.incentives.loyalCustomerDiscount) : 0,
      digitalChannelBonus: options.digitalApplication ?
        Math.round(remainingAmount * this.incentives.digitalChannelBonus) : 0,
      timelyPaymentBonus: options.excellentPaymentHistory ?
        Math.round(remainingAmount * this.incentives.timelyPaymentBonus) : 0,
      bulkRefinancingDiscount: options.multipleLoans ?
        Math.round(remainingAmount * this.incentives.bulkRefinancingDiscount) : 0
    };

    const totalFees = Object.values(fees).reduce((sum, fee) => sum + fee, 0);
    const totalIncentives = Object.values(incentives).reduce((sum, incentive) => sum + incentive, 0);
    const netCost = totalFees - totalIncentives;

    return {
      fees: fees,
      incentives: incentives,
      totalFees: totalFees,
      totalIncentives: totalIncentives,
      netCost: netCost
    };
  }

  /**
   * Get required documents for refinancing
   * @param {Object} loan - Original loan
   * @returns {Array} Required documents
   */
  getRequiredDocuments(loan) {
    const baseDocuments = [
      'Updated income proof',
      'Latest credit report',
      'Identity proof (Aadhaar/PAN)',
      'Address proof'
    ];

    // Additional documents based on loan type and amount
    if (loan.amount > 500000) {
      baseDocuments.push('Property documents (if collateral)');
      baseDocuments.push('Business proof (if self-employed)');
    }

    if (loan.sector === 'agriculture') {
      baseDocuments.push('Land records');
      baseDocuments.push('Crop insurance documents');
    }

    return baseDocuments;
  }

  /**
   * Generate unique application ID
   * @returns {string} Application ID
   */
  generateApplicationId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `REF${timestamp}${random}`;
  }

  /**
   * Process refinancing application (admin function)
   * @param {string} applicationId - Application ID
   * @param {string} decision - APPROVE or REJECT
   * @param {Object} reviewDetails - Review details
   * @returns {Object} Processing result
   */
  async processRefinancingApplication(applicationId, decision, reviewDetails = {}) {
    try {
      console.log(`\n=== 🔄 PROCESSING REFINANCING APPLICATION ===`);
      console.log(`Application ID: ${applicationId}, Decision: ${decision}`);

      // In a real implementation, this would update the application record
      // For now, we'll simulate the process

      if (decision === 'APPROVE') {
        // Create new loan terms
        // Update original loan status
        // Transfer remaining balance
        // Set up new payment schedule

        await auditService.logSystemEvent('refinancing_application_approved', {
          applicationId: applicationId,
          reviewDetails: reviewDetails
        }, 'high');

        return {
          success: true,
          applicationId: applicationId,
          status: 'APPROVED',
          message: 'Refinancing application approved',
          nextSteps: [
            'Legal agreement generation',
            'Digital signature collection',
            'Fund transfer setup',
            'New payment schedule activation'
          ]
        };
      } else {
        // Reject application
        await auditService.logSystemEvent('refinancing_application_rejected', {
          applicationId: applicationId,
          reason: reviewDetails.reason,
          reviewDetails: reviewDetails
        }, 'medium');

        return {
          success: true,
          applicationId: applicationId,
          status: 'REJECTED',
          message: 'Refinancing application rejected',
          reason: reviewDetails.reason
        };
      }

    } catch (error) {
      console.error('Error processing refinancing application:', error);
      return {
        success: false,
        error: 'Failed to process refinancing application',
        details: error.message
      };
    }
  }

  /**
   * Get refinancing analytics and insights
   * @param {Object} filters - Filter criteria
   * @returns {Object} Refinancing analytics
   */
  async getRefinancingAnalytics(filters = {}) {
    try {
      // This would analyze refinancing applications and outcomes
      // For now, return placeholder analytics

      return {
        success: true,
        analytics: {
          totalApplications: 0,
          approvalRate: 0,
          averageSavings: 0,
          popularLoanAmounts: {},
          sectorDistribution: {},
          timeToProcess: 0,
          customerSatisfaction: 0
        },
        filters: filters,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Error getting refinancing analytics:', error);
      return {
        success: false,
        error: 'Failed to get refinancing analytics'
      };
    }
  }
}

module.exports = new LoanRefinancingService();
