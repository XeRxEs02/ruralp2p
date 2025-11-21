/**
 * Analytics Controller
 * Provides comprehensive business intelligence and reporting
 * for administrators and stakeholders
 */

const Loan = require('../models/Loan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const auditService = require('../services/auditService');
const dynamicInterestService = require('../services/dynamicInterestService');
const logger = require('../utils/logger');

class AnalyticsController {
  /**
   * Get comprehensive dashboard analytics
   * GET /api/analytics/dashboard
   */
  async getDashboardAnalytics(req, res) {
    try {
      const { period = '30d', compare = true } = req.query;

      // Get date ranges
      const { current, previous } = this.getDateRanges(period);

      // Run all analytics queries in parallel
      const [
        overviewMetrics,
        loanMetrics,
        userMetrics,
        financialMetrics,
        riskMetrics,
        geographicMetrics
      ] = await Promise.all([
        this.getOverviewMetrics(current, previous, compare),
        this.getLoanMetrics(current, previous, compare),
        this.getUserMetrics(current, previous, compare),
        this.getFinancialMetrics(current, previous, compare),
        this.getRiskMetrics(current),
        this.getGeographicMetrics(current)
      ]);

      const analytics = {
        timestamp: new Date(),
        period: period,
        comparison: compare,
        overview: overviewMetrics,
        loans: loanMetrics,
        users: userMetrics,
        financial: financialMetrics,
        risk: riskMetrics,
        geographic: geographicMetrics,
        trends: await this.getTrendAnalysis(current),
        alerts: await this.getSystemAlerts()
      };

      // Log analytics access
      await auditService.logSystemEvent('analytics_dashboard_accessed', {
        userId: req.user?.id,
        period: period,
        compare: compare
      }, 'low');

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.errorWithContext(error, { endpoint: '/api/analytics/dashboard' });
      res.status(500).json({
        success: false,
        error: 'Failed to generate dashboard analytics'
      });
    }
  }

  /**
   * Get loan performance analytics
   * GET /api/analytics/loans
   */
  async getLoanAnalytics(req, res) {
    try {
      const { status, sector, period = '90d' } = req.query;
      const dateRange = this.getDateRange(period);

      let matchConditions = {
        createdAt: { $gte: dateRange.start }
      };

      if (status) matchConditions.status = status;
      if (sector) matchConditions.sector = sector;

      const loans = await Loan.find(matchConditions)
        .populate('borrowerId', 'fullName email')
        .sort({ createdAt: -1 });

      const analytics = {
        totalLoans: loans.length,
        statusDistribution: this.calculateStatusDistribution(loans),
        sectorDistribution: this.calculateSectorDistribution(loans),
        amountDistribution: this.calculateAmountDistribution(loans),
        durationDistribution: this.calculateDurationDistribution(loans),
        performanceMetrics: await this.calculateLoanPerformance(loans),
        defaultRates: await this.calculateDefaultRates(dateRange),
        fundingRates: this.calculateFundingRates(loans),
        repaymentRates: await this.calculateRepaymentRates(loans)
      };

      res.json({
        success: true,
        data: analytics,
        filters: { status, sector, period }
      });

    } catch (error) {
      logger.errorWithContext(error, { endpoint: '/api/analytics/loans' });
      res.status(500).json({
        success: false,
        error: 'Failed to generate loan analytics'
      });
    }
  }

  /**
   * Get user behavior analytics
   * GET /api/analytics/users
   */
  async getUserAnalytics(req, res) {
    try {
      const { role, period = '90d' } = req.query;
      const dateRange = this.getDateRange(period);

      let matchConditions = {
        createdAt: { $gte: dateRange.start }
      };

      if (role) matchConditions.role = role;

      const users = await User.find(matchConditions);

      // Get user activity from audit logs
      const userActivity = await AuditLog.aggregate([
        {
          $match: {
            userId: { $ne: 'system' },
            timestamp: { $gte: dateRange.start }
          }
        },
        {
          $group: {
            _id: '$userId',
            totalActions: { $sum: 1 },
            categories: {
              $push: '$category'
            },
            lastActivity: { $max: '$timestamp' }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $unwind: '$user'
        }
      ]);

      const analytics = {
        totalUsers: users.length,
        userGrowth: this.calculateUserGrowth(users, dateRange),
        roleDistribution: this.calculateRoleDistribution(users),
        activityMetrics: this.calculateActivityMetrics(userActivity),
        engagementMetrics: await this.calculateEngagementMetrics(dateRange),
        retentionMetrics: await this.calculateRetentionMetrics(dateRange),
        kycMetrics: this.calculateKYCMetrics(users)
      };

      res.json({
        success: true,
        data: analytics,
        filters: { role, period }
      });

    } catch (error) {
      logger.errorWithContext(error, { endpoint: '/api/analytics/users' });
      res.status(500).json({
        success: false,
        error: 'Failed to generate user analytics'
      });
    }
  }

  /**
   * Get financial performance analytics
   * GET /api/analytics/financial
   */
  async getFinancialAnalytics(req, res) {
    try {
      const { period = '90d' } = req.query;
      const dateRange = this.getDateRange(period);

      // Get all transactions
      const transactions = await Transaction.find({
        createdAt: { $gte: dateRange.start }
      }).sort({ createdAt: 1 });

      // Calculate financial metrics
      const revenueMetrics = this.calculateRevenueMetrics(transactions);
      const cashFlowMetrics = this.calculateCashFlowMetrics(transactions);
      const profitabilityMetrics = await this.calculateProfitabilityMetrics(dateRange);
      const liquidityMetrics = await this.calculateLiquidityMetrics();

      const analytics = {
        period: period,
        revenue: revenueMetrics,
        cashFlow: cashFlowMetrics,
        profitability: profitabilityMetrics,
        liquidity: liquidityMetrics,
        keyRatios: this.calculateKeyRatios(revenueMetrics, profitabilityMetrics),
        forecasts: await this.generateFinancialForecasts(dateRange)
      };

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.errorWithContext(error, { endpoint: '/api/analytics/financial' });
      res.status(500).json({
        success: false,
        error: 'Failed to generate financial analytics'
      });
    }
  }

  /**
   * Get risk and compliance analytics
   * GET /api/analytics/risk
   */
  async getRiskAnalytics(req, res) {
    try {
      const { period = '90d' } = req.query;
      const dateRange = this.getDateRange(period);

      // Get risk-related data
      const [
        loanDefaults,
        userRiskProfiles,
        securityIncidents,
        complianceViolations
      ] = await Promise.all([
        this.getDefaultAnalytics(dateRange),
        this.getUserRiskProfiles(),
        this.getSecurityIncidents(dateRange),
        this.getComplianceViolations(dateRange)
      ]);

      const analytics = {
        period: period,
        loanRisk: loanDefaults,
        userRisk: userRiskProfiles,
        security: securityIncidents,
        compliance: complianceViolations,
        riskIndicators: this.calculateRiskIndicators(loanDefaults, securityIncidents),
        mitigationStrategies: this.generateRiskMitigationStrategies(analytics)
      };

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.errorWithContext(error, { endpoint: '/api/analytics/risk' });
      res.status(500).json({
        success: false,
        error: 'Failed to generate risk analytics'
      });
    }
  }

  /**
   * Get operational performance metrics
   * GET /api/analytics/operations
   */
  async getOperationalAnalytics(req, res) {
    try {
      const { period = '30d' } = req.query;
      const dateRange = this.getDateRange(period);

      // Get operational metrics from audit logs
      const operationalMetrics = await AuditLog.aggregate([
        {
          $match: {
            timestamp: { $gte: dateRange.start },
            category: { $in: ['system', 'loan', 'payment', 'authentication'] }
          }
        },
        {
          $group: {
            _id: {
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$timestamp'
                }
              },
              category: '$category',
              action: '$action'
            },
            count: { $sum: 1 },
            avgResponseTime: { $avg: '$details.duration' },
            errorCount: {
              $sum: {
                $cond: [{ $eq: ['$severity', 'error'] }, 1, 0]
              }
            }
          }
        },
        {
          $sort: { '_id.date': 1 }
        }
      ]);

      const analytics = {
        period: period,
        systemPerformance: this.analyzeSystemPerformance(operationalMetrics),
        processEfficiency: this.analyzeProcessEfficiency(operationalMetrics),
        errorAnalysis: this.analyzeErrorPatterns(operationalMetrics),
        bottleneckIdentification: this.identifyBottlenecks(operationalMetrics),
        recommendations: this.generateOperationalRecommendations(analytics)
      };

      res.json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.errorWithContext(error, { endpoint: '/api/analytics/operations' });
      res.status(500).json({
        success: false,
        error: 'Failed to generate operational analytics'
      });
    }
  }

  /**
   * Export analytics data
   * GET /api/analytics/export
   */
  async exportAnalytics(req, res) {
    try {
      const { type, format = 'json', period = '90d' } = req.query;
      const dateRange = this.getDateRange(period);

      let data;
      switch (type) {
        case 'loans':
          data = await this.getLoanAnalyticsData(dateRange);
          break;
        case 'users':
          data = await this.getUserAnalyticsData(dateRange);
          break;
        case 'financial':
          data = await this.getFinancialAnalyticsData(dateRange);
          break;
        case 'risk':
          data = await this.getRiskAnalyticsData(dateRange);
          break;
        default:
          data = await this.getDashboardAnalyticsData(dateRange);
      }

      // Format data
      let exportData;
      let contentType;
      let filename;

      switch (format) {
        case 'csv':
          exportData = this.convertToCSV(data);
          contentType = 'text/csv';
          filename = `analytics-${type}-${period}-${Date.now()}.csv`;
          break;
        case 'excel':
          exportData = this.convertToExcel(data);
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          filename = `analytics-${type}-${period}-${Date.now()}.xlsx`;
          break;
        default:
          exportData = JSON.stringify(data, null, 2);
          contentType = 'application/json';
          filename = `analytics-${type}-${period}-${Date.now()}.json`;
      }

      // Log export
      await auditService.logSystemEvent('analytics_data_exported', {
        userId: req.user?.id,
        type: type,
        format: format,
        period: period,
        recordCount: data.length || Object.keys(data).length
      }, 'medium');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(exportData);

    } catch (error) {
      logger.errorWithContext(error, { endpoint: '/api/analytics/export' });
      res.status(500).json({
        success: false,
        error: 'Failed to export analytics data'
      });
    }
  }

  // Helper methods

  getDateRanges(period) {
    const now = new Date();
    const current = this.getDateRange(period);

    // Calculate previous period for comparison
    const periodMs = current.end.getTime() - current.start.getTime();
    const previous = {
      start: new Date(current.start.getTime() - periodMs),
      end: new Date(current.end.getTime() - periodMs)
    };

    return { current, previous };
  }

  getDateRange(period) {
    const now = new Date();
    let start;

    switch (period) {
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { start, end: now };
  }

  async getOverviewMetrics(current, previous, compare) {
    const [currentLoans, previousLoans, currentUsers, previousUsers] = await Promise.all([
      Loan.countDocuments({ createdAt: { $gte: current.start } }),
      compare ? Loan.countDocuments({ createdAt: { $gte: previous.start, $lt: previous.end } }) : 0,
      User.countDocuments({ createdAt: { $gte: current.start } }),
      compare ? User.countDocuments({ createdAt: { $gte: previous.start, $lt: previous.end } }) : 0
    ]);

    return {
      totalLoans: currentLoans,
      totalUsers: currentUsers,
      activeLoans: await Loan.countDocuments({ status: 'ACTIVE' }),
      totalLoanAmount: await this.getTotalLoanAmount(current),
      loanGrowth: compare ? ((currentLoans - previousLoans) / previousLoans * 100) : 0,
      userGrowth: compare ? ((currentUsers - previousUsers) / previousUsers * 100) : 0
    };
  }

  async getLoanMetrics(current, previous, compare) {
    // Implementation for loan metrics
    return {
      approvalRate: 0,
      fundingRate: 0,
      defaultRate: 0,
      averageLoanAmount: 0,
      averageDuration: 0
    };
  }

  async getUserMetrics(current, previous, compare) {
    // Implementation for user metrics
    return {
      totalBorrowers: 0,
      totalLenders: 0,
      activeUsers: 0,
      conversionRate: 0
    };
  }

  async getFinancialMetrics(current, previous, compare) {
    // Implementation for financial metrics
    return {
      totalRevenue: 0,
      totalFees: 0,
      netIncome: 0,
      averageInterestRate: 0
    };
  }

  async getRiskMetrics(current) {
    // Implementation for risk metrics
    return {
      portfolioRiskScore: 0,
      defaultProbability: 0,
      concentrationRisk: 0
    };
  }

  async getGeographicMetrics(current) {
    // Implementation for geographic metrics
    return {
      topRegions: [],
      regionalDistribution: {},
      ruralVsUrban: { rural: 0, urban: 0 }
    };
  }

  async getTrendAnalysis(current) {
    // Implementation for trend analysis
    return {
      loanVolumeTrend: [],
      userGrowthTrend: [],
      defaultRateTrend: []
    };
  }

  async getSystemAlerts() {
    // Implementation for system alerts
    return {
      critical: [],
      warnings: [],
      info: []
    };
  }

  async getTotalLoanAmount(range) {
    const result = await Loan.aggregate([
      { $match: { createdAt: { $gte: range.start } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    return result.length > 0 ? result[0].total : 0;
  }

  // Additional helper methods would be implemented here
  calculateStatusDistribution(loans) {
    const distribution = {};
    loans.forEach(loan => {
      distribution[loan.status] = (distribution[loan.status] || 0) + 1;
    });
    return distribution;
  }

  calculateSectorDistribution(loans) {
    const distribution = {};
    loans.forEach(loan => {
      distribution[loan.sector] = (distribution[loan.sector] || 0) + 1;
    });
    return distribution;
  }

  calculateAmountDistribution(loans) {
    const buckets = { '0-25k': 0, '25k-50k': 0, '50k-1L': 0, '1L+': 0 };
    loans.forEach(loan => {
      const amount = loan.totalAmount;
      if (amount < 25000) buckets['0-25k']++;
      else if (amount < 50000) buckets['25k-50k']++;
      else if (amount < 100000) buckets['50k-1L']++;
      else buckets['1L+']++;
    });
    return buckets;
  }

  calculateDurationDistribution(loans) {
    const buckets = { '3-6m': 0, '6-12m': 0, '12-24m': 0, '24m+': 0 };
    loans.forEach(loan => {
      const duration = loan.duration;
      if (duration <= 6) buckets['3-6m']++;
      else if (duration <= 12) buckets['6-12m']++;
      else if (duration <= 24) buckets['12-24m']++;
      else buckets['24m+']++;
    });
    return buckets;
  }

  // Placeholder implementations for remaining methods
  async calculateLoanPerformance(loans) { return {}; }
  async calculateDefaultRates(range) { return {}; }
  calculateFundingRates(loans) { return {}; }
  async calculateRepaymentRates(loans) { return {}; }
  calculateUserGrowth(users, range) { return {}; }
  calculateRoleDistribution(users) { return {}; }
  calculateActivityMetrics(activity) { return {}; }
  async calculateEngagementMetrics(range) { return {}; }
  async calculateRetentionMetrics(range) { return {}; }
  calculateKYCMetrics(users) { return {}; }
  calculateRevenueMetrics(transactions) { return {}; }
  calculateCashFlowMetrics(transactions) { return {}; }
  async calculateProfitabilityMetrics(range) { return {}; }
  async calculateLiquidityMetrics() { return {}; }
  calculateKeyRatios(revenue, profitability) { return {}; }
  async generateFinancialForecasts(range) { return {}; }
  async getDefaultAnalytics(range) { return {}; }
  async getUserRiskProfiles() { return {}; }
  async getSecurityIncidents(range) { return {}; }
  async getComplianceViolations(range) { return {}; }
  calculateRiskIndicators(defaults, incidents) { return {}; }
  generateRiskMitigationStrategies(analytics) { return {}; }
  analyzeSystemPerformance(metrics) { return {}; }
  analyzeProcessEfficiency(metrics) { return {}; }
  analyzeErrorPatterns(metrics) { return {}; }
  identifyBottlenecks(metrics) { return {}; }
  generateOperationalRecommendations(analytics) { return {}; }
  async getLoanAnalyticsData(range) { return []; }
  async getUserAnalyticsData(range) { return []; }
  async getFinancialAnalyticsData(range) { return {}; }
  async getRiskAnalyticsData(range) { return {}; }
  async getDashboardAnalyticsData(range) { return {}; }
  convertToCSV(data) { return ''; }
  convertToExcel(data) { return Buffer.alloc(0); }
}

module.exports = new AnalyticsController();
