/**
 * Dynamic Interest Rate Service
 * Implements adaptive interest rate calculation based on market conditions,
 * borrower risk, lender preferences, and real-time economic factors
 */

const Loan = require('../models/Loan');
const User = require('../models/User');
const auditService = require('./auditService');

class DynamicInterestService {
  constructor() {
    // Base interest rates by risk category
    this.baseRates = {
      low: 8.0,      // Prime borrowers
      medium: 12.0,  // Average risk
      high: 18.0,    // High risk
      very_high: 24.0 // Subprime
    };

    // Market adjustment factors
    this.marketFactors = {
      inflation: 0.06,      // 6% inflation adjustment
      liquidity: 0.02,      // Liquidity premium
      competition: -0.015,  // Competition discount
      economic_cycle: 0.01  // Economic cycle adjustment
    };

    // Borrower-specific adjustments
    this.borrowerAdjustments = {
      kyc_verified: -0.5,
      face_verified: -0.25,
      digilocker_verified: -0.25,
      existing_customer: -0.3,
      timely_repayments: -0.4,
      late_payments: 1.0,
      defaults: 2.5
    };

    // Loan-specific adjustments
    this.loanAdjustments = {
      duration: {
        '3': 0.5,   // 3 months: +0.5%
        '6': 0.0,   // 6 months: baseline
        '12': -0.3, // 12 months: -0.3%
        '24': -0.6  // 24 months: -0.6%
      },
      amount: {
        '25000': 1.0,    // Under 25k: +1%
        '50000': 0.5,    // Under 50k: +0.5%
        '100000': 0.0,   // Under 100k: baseline
        '500000': -0.3,  // Under 500k: -0.3%
        '1000000': -0.5  // Over 1M: -0.5%
      },
      sector: {
        'agriculture': -0.8,
        'education': -0.6,
        'healthcare': -0.6,
        'manufacturing': -0.2,
        'services': 0.0,
        'retail': 0.2,
        'construction': 0.4,
        'mining': 1.0
      }
    };

    // Seasonal adjustments (monthly)
    this.seasonalAdjustments = {
      1: 0.1,   // January - Post-festival demand
      2: 0.0,   // February
      3: 0.2,   // March - Financial year end
      4: 0.1,   // April - New financial year
      5: 0.0,   // May
      6: 0.3,   // June - Monsoon preparation
      7: 0.4,   // July - Peak agriculture
      8: 0.3,   // August - Harvest season
      9: 0.1,   // September
      10: 0.2,  // October - Festival season
      11: 0.4,  // November - Wedding season
      12: 0.5   // December - Holiday demand
    };

    // Lender-specific factors
    this.lenderFactors = {
      reputation_bonus: -0.2,    // Per reputation point
      volume_discount: -0.1,     // For large lenders
      relationship_bonus: -0.15  // Long-term relationship
    };
  }

  /**
   * Calculate dynamic interest rate for a loan application
   * @param {Object} loanData - Loan application data
   * @param {Object} borrowerData - Borrower profile data
   * @param {Object} marketData - Current market conditions
   * @returns {Object} Calculated interest rate with breakdown
   */
  async calculateDynamicRate(loanData, borrowerData = {}, marketData = {}) {
    try {
      console.log('\n=== 🔄 DYNAMIC INTEREST RATE CALCULATION ===');

      // Start with base rate based on risk category
      const riskCategory = this.determineRiskCategory(borrowerData);
      let rate = this.baseRates[riskCategory];

      console.log(`📊 Base Rate for ${riskCategory} risk: ${rate}%`);

      // Apply market adjustments
      const marketAdjustment = this.calculateMarketAdjustment(marketData);
      rate += marketAdjustment;
      console.log(`📈 Market Adjustment: ${marketAdjustment > 0 ? '+' : ''}${marketAdjustment}%`);

      // Apply borrower-specific adjustments
      const borrowerAdjustment = this.calculateBorrowerAdjustment(borrowerData);
      rate += borrowerAdjustment;
      console.log(`👤 Borrower Adjustment: ${borrowerAdjustment > 0 ? '+' : ''}${borrowerAdjustment}%`);

      // Apply loan-specific adjustments
      const loanAdjustment = this.calculateLoanAdjustment(loanData);
      rate += loanAdjustment;
      console.log(`💰 Loan Adjustment: ${loanAdjustment > 0 ? '+' : ''}${loanAdjustment}%`);

      // Apply seasonal adjustments
      const seasonalAdjustment = this.calculateSeasonalAdjustment();
      rate += seasonalAdjustment;
      console.log(`🌤️ Seasonal Adjustment: ${seasonalAdjustment > 0 ? '+' : ''}${seasonalAdjustment}%`);

      // Apply lender-specific factors (if lender data available)
      let lenderAdjustment = 0;
      if (marketData.lenderProfile) {
        lenderAdjustment = this.calculateLenderAdjustment(marketData.lenderProfile);
        rate += lenderAdjustment;
        console.log(`🏦 Lender Adjustment: ${lenderAdjustment > 0 ? '+' : ''}${lenderAdjustment}%`);
      }

      // Ensure rate is within reasonable bounds
      const finalRate = this.applyRateBounds(rate, loanData);

      console.log(`✅ Final Interest Rate: ${finalRate}%`);

      // Calculate additional metrics
      const monthlyRate = finalRate / 12 / 100;
      const estimatedMonthlyPayment = this.calculateMonthlyPayment(loanData.amount, finalRate, loanData.duration);

      const result = {
        interestRate: finalRate,
        breakdown: {
          baseRate: this.baseRates[riskCategory],
          riskCategory: riskCategory,
          marketAdjustment: marketAdjustment,
          borrowerAdjustment: borrowerAdjustment,
          loanAdjustment: loanAdjustment,
          seasonalAdjustment: seasonalAdjustment,
          lenderAdjustment: lenderAdjustment
        },
        metrics: {
          monthlyPayment: estimatedMonthlyPayment,
          totalInterest: estimatedMonthlyPayment * loanData.duration - loanData.amount,
          totalPayment: estimatedMonthlyPayment * loanData.duration
        },
        factors: {
          marketConditions: marketData,
          borrowerProfile: borrowerData,
          loanCharacteristics: loanData
        },
        timestamp: new Date(),
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) // Valid for 24 hours
      };

      // Log the rate calculation
      await auditService.logSystemEvent('interest_rate_calculated', {
        loanId: loanData.id,
        borrowerId: borrowerData.userId,
        finalRate: finalRate,
        riskCategory: riskCategory
      }, 'low');

      return result;

    } catch (error) {
      console.error('Error calculating dynamic interest rate:', error);
      // Return fallback rate
      return {
        interestRate: 12.0, // Fallback rate
        breakdown: { error: 'Calculation failed, using fallback rate' },
        error: error.message
      };
    }
  }

  /**
   * Determine risk category based on borrower profile
   * @param {Object} borrowerData - Borrower profile
   * @returns {string} Risk category
   */
  determineRiskCategory(borrowerData) {
    let riskScore = 5; // Neutral starting point

    // Verification factors
    if (borrowerData.kycVerified) riskScore -= 1;
    if (borrowerData.faceVerified) riskScore -= 0.5;
    if (borrowerData.digilockerVerified) riskScore -= 0.5;

    // Credit history factors
    if (borrowerData.existingLoans) {
      const onTimePayments = borrowerData.onTimePaymentRate || 0.8;
      riskScore -= (onTimePayments - 0.5) * 2; // Better payments = lower risk
    }

    // Income stability
    if (borrowerData.incomeStability) {
      riskScore -= borrowerData.incomeStability * 0.5;
    }

    // Determine category
    if (riskScore <= 3) return 'low';
    if (riskScore <= 6) return 'medium';
    if (riskScore <= 8) return 'high';
    return 'very_high';
  }

  /**
   * Calculate market adjustment based on current conditions
   * @param {Object} marketData - Market conditions
   * @returns {number} Market adjustment percentage
   */
  calculateMarketAdjustment(marketData = {}) {
    let adjustment = 0;

    // Inflation adjustment
    const inflation = marketData.inflation || this.marketFactors.inflation;
    adjustment += inflation * 0.5; // 50% of inflation rate

    // Liquidity adjustment
    const liquidityRatio = marketData.liquidityRatio || 1.0;
    if (liquidityRatio < 0.8) {
      adjustment += this.marketFactors.liquidity * 1.5; // Higher premium when liquidity is low
    } else if (liquidityRatio > 1.2) {
      adjustment -= this.marketFactors.liquidity * 0.5; // Discount when liquidity is high
    }

    // Competition adjustment
    const competitionIndex = marketData.competitionIndex || 1.0;
    adjustment += this.marketFactors.competition * competitionIndex;

    // Economic cycle adjustment
    const economicCycle = marketData.economicCycle || 0; // -1 to 1 scale
    adjustment += this.marketFactors.economic_cycle * economicCycle;

    return adjustment;
  }

  /**
   * Calculate borrower-specific adjustments
   * @param {Object} borrowerData - Borrower profile
   * @returns {number} Borrower adjustment percentage
   */
  calculateBorrowerAdjustment(borrowerData = {}) {
    let adjustment = 0;

    // Verification bonuses
    if (borrowerData.kycVerified) adjustment += this.borrowerAdjustments.kyc_verified;
    if (borrowerData.faceVerified) adjustment += this.borrowerAdjustments.face_verified;
    if (borrowerData.digilockerVerified) adjustment += this.borrowerAdjustments.digilocker_verified;

    // Relationship bonuses
    if (borrowerData.existingCustomer) adjustment += this.borrowerAdjustments.existing_customer;

    // Payment history adjustments
    if (borrowerData.paymentHistory) {
      const onTimeRate = borrowerData.onTimePaymentRate || 0;
      const lateRate = borrowerData.latePaymentRate || 0;
      const defaultRate = borrowerData.defaultRate || 0;

      adjustment += this.borrowerAdjustments.timely_repayments * onTimeRate;
      adjustment += this.borrowerAdjustments.late_payments * lateRate;
      adjustment += this.borrowerAdjustments.defaults * defaultRate;
    }

    // Credit score adjustment
    if (borrowerData.creditScore) {
      if (borrowerData.creditScore >= 750) adjustment -= 0.5;
      else if (borrowerData.creditScore >= 650) adjustment -= 0.2;
      else if (borrowerData.creditScore < 550) adjustment += 0.8;
    }

    return adjustment;
  }

  /**
   * Calculate loan-specific adjustments
   * @param {Object} loanData - Loan details
   * @returns {number} Loan adjustment percentage
   */
  calculateLoanAdjustment(loanData) {
    let adjustment = 0;

    // Duration adjustment
    const durationKey = loanData.duration.toString();
    adjustment += this.loanAdjustments.duration[durationKey] || 0;

    // Amount adjustment
    const amount = loanData.amount;
    if (amount < 25000) adjustment += this.loanAdjustments.amount['25000'];
    else if (amount < 50000) adjustment += this.loanAdjustments.amount['50000'];
    else if (amount < 100000) adjustment += this.loanAdjustments.amount['100000'];
    else if (amount < 500000) adjustment += this.loanAdjustments.amount['500000'];
    else adjustment += this.loanAdjustments.amount['1000000'];

    // Sector adjustment
    const sector = loanData.sector || 'services';
    adjustment += this.loanAdjustments.sector[sector] || 0;

    // Purpose adjustment
    if (loanData.purpose) {
      const priorityPurposes = ['education', 'healthcare', 'agriculture'];
      if (priorityPurposes.includes(loanData.purpose)) {
        adjustment -= 0.3;
      }
    }

    return adjustment;
  }

  /**
   * Calculate seasonal adjustment
   * @returns {number} Seasonal adjustment percentage
   */
  calculateSeasonalAdjustment() {
    const currentMonth = new Date().getMonth() + 1; // getMonth() returns 0-11
    return this.seasonalAdjustments[currentMonth] || 0;
  }

  /**
   * Calculate lender-specific adjustments
   * @param {Object} lenderProfile - Lender profile
   * @returns {number} Lender adjustment percentage
   */
  calculateLenderAdjustment(lenderProfile = {}) {
    let adjustment = 0;

    // Reputation bonus
    if (lenderProfile.reputation) {
      adjustment += this.lenderFactors.reputation_bonus * lenderProfile.reputation;
    }

    // Volume discount for large lenders
    if (lenderProfile.totalInvested > 1000000) {
      adjustment += this.lenderFactors.volume_discount;
    }

    // Relationship bonus
    if (lenderProfile.relationshipYears > 2) {
      adjustment += this.lenderFactors.relationship_bonus;
    }

    return adjustment;
  }

  /**
   * Apply reasonable bounds to the calculated rate
   * @param {number} rate - Calculated rate
   * @param {Object} loanData - Loan details
   * @returns {number} Bounded rate
   */
  applyRateBounds(rate, loanData) {
    // Set absolute bounds
    const minRate = 6.0;  // Minimum 6%
    const maxRate = 36.0; // Maximum 36%

    let boundedRate = Math.max(minRate, Math.min(maxRate, rate));

    // Additional bounds based on loan amount
    if (loanData.amount < 50000) {
      boundedRate = Math.min(boundedRate, 28.0); // Lower cap for small loans
    }

    // Round to nearest 0.25%
    boundedRate = Math.round(boundedRate * 4) / 4;

    return boundedRate;
  }

  /**
   * Calculate estimated monthly payment
   * @param {number} principal - Loan amount
   * @param {number} annualRate - Annual interest rate
   * @param {number} months - Loan duration in months
   * @returns {number} Monthly payment
   */
  calculateMonthlyPayment(principal, annualRate, months) {
    const monthlyRate = annualRate / 12 / 100;
    const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) /
                   (Math.pow(1 + monthlyRate, months) - 1);
    return Math.round(payment * 100) / 100;
  }

  /**
   * Get market conditions for rate calculation
   * @returns {Object} Current market conditions
   */
  async getMarketConditions() {
    try {
      // Get recent loan data for market analysis
      const recentLoans = await Loan.find({
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      }).select('amount interestRate duration sector');

      const avgRate = recentLoans.reduce((sum, loan) => sum + loan.interestRate, 0) / recentLoans.length;
      const totalVolume = recentLoans.reduce((sum, loan) => sum + loan.amount, 0);

      // Calculate sector demand
      const sectorStats = {};
      recentLoans.forEach(loan => {
        sectorStats[loan.sector] = (sectorStats[loan.sector] || 0) + loan.amount;
      });

      return {
        averageRate: avgRate || 12.5,
        totalVolume: totalVolume || 0,
        loanCount: recentLoans.length,
        sectorDemand: sectorStats,
        liquidityRatio: 1.0, // Placeholder - would come from actual liquidity data
        competitionIndex: 1.0, // Placeholder - would come from competitor analysis
        economicCycle: 0.1, // Placeholder - would come from economic indicators
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Error getting market conditions:', error);
      return {
        averageRate: 12.5,
        totalVolume: 0,
        loanCount: 0,
        liquidityRatio: 1.0,
        competitionIndex: 1.0,
        economicCycle: 0.1
      };
    }
  }

  /**
   * Update interest rates for existing loans (annual review)
   * @param {string} loanId - Loan ID
   * @returns {Object} Rate update result
   */
  async reviewLoanRate(loanId) {
    try {
      const loan = await Loan.findById(loanId).populate('borrowerId', 'kycVerified faceVerified digilockerVerified');

      if (!loan) {
        return { success: false, error: 'Loan not found' };
      }

      const borrowerData = {
        userId: loan.borrowerId._id,
        kycVerified: loan.borrowerId.kycVerified,
        faceVerified: loan.borrowerId.faceVerified,
        digilockerVerified: loan.borrowerId.digilockerVerified
      };

      const marketData = await this.getMarketConditions();

      const newRateCalculation = await this.calculateDynamicRate({
        id: loanId,
        amount: loan.totalAmount,
        duration: loan.duration,
        sector: loan.sector
      }, borrowerData, marketData);

      const rateChange = newRateCalculation.interestRate - loan.averageInterestRate;
      const maxAllowedChange = 2.0; // Maximum 2% change per review

      let finalNewRate = loan.averageInterestRate + Math.max(-maxAllowedChange, Math.min(maxAllowedChange, rateChange));

      // Update loan with new rate
      loan.averageInterestRate = finalNewRate;
      loan.lastRateReview = new Date();
      await loan.save();

      // Log the rate review
      await auditService.logSystemEvent('loan_rate_reviewed', {
        loanId: loanId,
        oldRate: loan.averageInterestRate - rateChange,
        newRate: finalNewRate,
        rateChange: rateChange,
        maxAllowedChange: maxAllowedChange
      }, 'medium');

      return {
        success: true,
        loanId: loanId,
        oldRate: loan.averageInterestRate - rateChange,
        newRate: finalNewRate,
        rateChange: rateChange,
        appliedChange: Math.max(-maxAllowedChange, Math.min(maxAllowedChange, rateChange)),
        nextReviewDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
      };

    } catch (error) {
      console.error('Error reviewing loan rate:', error);
      return {
        success: false,
        error: 'Failed to review loan rate'
      };
    }
  }

  /**
   * Get interest rate trends and analytics
   * @param {Object} filters - Filter criteria
   * @returns {Object} Rate analytics
   */
  async getRateAnalytics(filters = {}) {
    try {
      const query = {};

      // Date range filter
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
      }

      // Sector filter
      if (filters.sector) {
        query.sector = filters.sector;
      }

      const loans = await Loan.find(query).select('averageInterestRate amount duration sector createdAt');

      const analytics = {
        totalLoans: loans.length,
        averageRate: loans.reduce((sum, loan) => sum + loan.averageInterestRate, 0) / loans.length,
        rateDistribution: this.calculateRateDistribution(loans),
        sectorAverages: this.calculateSectorAverages(loans),
        amountRanges: this.calculateAmountRanges(loans),
        trends: this.calculateRateTrends(loans)
      };

      return {
        success: true,
        analytics: analytics,
        filters: filters,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Error getting rate analytics:', error);
      return {
        success: false,
        error: 'Failed to get rate analytics'
      };
    }
  }

  /**
   * Calculate rate distribution
   * @param {Array} loans - Loan data
   * @returns {Object} Rate distribution
   */
  calculateRateDistribution(loans) {
    const buckets = { '6-8': 0, '8-10': 0, '10-12': 0, '12-15': 0, '15-20': 0, '20+': 0 };

    loans.forEach(loan => {
      const rate = loan.averageInterestRate;
      if (rate < 8) buckets['6-8']++;
      else if (rate < 10) buckets['8-10']++;
      else if (rate < 12) buckets['10-12']++;
      else if (rate < 15) buckets['12-15']++;
      else if (rate < 20) buckets['15-20']++;
      else buckets['20+']++;
    });

    return buckets;
  }

  /**
   * Calculate sector averages
   * @param {Array} loans - Loan data
   * @returns {Object} Sector averages
   */
  calculateSectorAverages(loans) {
    const sectorStats = {};

    loans.forEach(loan => {
      if (!sectorStats[loan.sector]) {
        sectorStats[loan.sector] = { total: 0, count: 0 };
      }
      sectorStats[loan.sector].total += loan.averageInterestRate;
      sectorStats[loan.sector].count++;
    });

    const averages = {};
    Object.keys(sectorStats).forEach(sector => {
      averages[sector] = sectorStats[sector].total / sectorStats[sector].count;
    });

    return averages;
  }

  /**
   * Calculate amount range statistics
   * @param {Array} loans - Loan data
   * @returns {Object} Amount range stats
   */
  calculateAmountRanges(loans) {
    const ranges = {
      'small': { min: 0, max: 50000, loans: [], avgRate: 0 },
      'medium': { min: 50000, max: 200000, loans: [], avgRate: 0 },
      'large': { min: 200000, max: 1000000, loans: [], avgRate: 0 },
      'xl': { min: 1000000, max: Infinity, loans: [], avgRate: 0 }
    };

    loans.forEach(loan => {
      let range;
      if (loan.amount <= 50000) range = 'small';
      else if (loan.amount <= 200000) range = 'medium';
      else if (loan.amount <= 1000000) range = 'large';
      else range = 'xl';

      ranges[range].loans.push(loan);
    });

    Object.keys(ranges).forEach(range => {
      const loans = ranges[range].loans;
      if (loans.length > 0) {
        ranges[range].avgRate = loans.reduce((sum, loan) => sum + loan.averageInterestRate, 0) / loans.length;
        ranges[range].count = loans.length;
      }
    });

    return ranges;
  }

  /**
   * Calculate rate trends over time
   * @param {Array} loans - Loan data
   * @returns {Object} Rate trends
   */
  calculateRateTrends(loans) {
    // Sort loans by date
    const sortedLoans = loans.sort((a, b) => a.createdAt - b.createdAt);

    // Group by month
    const monthlyStats = {};
    sortedLoans.forEach(loan => {
      const monthKey = loan.createdAt.toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = { total: 0, count: 0 };
      }
      monthlyStats[monthKey].total += loan.averageInterestRate;
      monthlyStats[monthKey].count++;
    });

    const trends = {};
    Object.keys(monthlyStats).forEach(month => {
      trends[month] = monthlyStats[month].total / monthlyStats[month].count;
    });

    return trends;
  }
}

module.exports = new DynamicInterestService();
