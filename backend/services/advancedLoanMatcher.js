/**
 * Advanced Loan Matching Algorithm for RuralConnect P2P Lending
 * Enhanced matching with ML-based scoring, multi-criteria optimization,
 * dynamic preference learning, and real-time market adaptation
 */

const Loan = require('../models/Loan');
const User = require('../models/User');
const auditService = require('./auditService');

class AdvancedLoanMatcher {
  constructor() {
    this.borrowers = [];
    this.lenders = [];
    this.matches = new Map();
    this.freeBorrowers = [];
    this.matchingHistory = [];
    this.marketTrends = {
      averageInterestRate: 12.5,
      totalLiquidity: 0,
      sectorDemand: {},
      riskDistribution: {}
    };

    // Enhanced scoring weights with dynamic adjustment
    this.scoringWeights = {
      interestRate: 0.20,
      amount: 0.18,
      duration: 0.12,
      riskScore: 0.12,
      creditScore: 0.10,
      location: 0.08,
      sector: 0.08,
      socialImpact: 0.06,
      urgency: 0.04,
      lenderReputation: 0.02
    };

    // Learning parameters
    this.learningRate = 0.1;
    this.successThreshold = 0.7;
  }

  /**
   * Add a borrower with comprehensive profile analysis
   */
  async addBorrower(borrowerData) {
    try {
      const user = await User.findById(borrowerData.userId).select(
        'fullName email phone kycVerified faceVerified digilockerVerified role'
      );

      if (!user) {
        throw new Error('Borrower user profile not found');
      }

      const borrower = {
        id: borrowerData.id,
        userId: borrowerData.userId,
        amount: borrowerData.amount,
        interestRate: borrowerData.interestRate,
        duration: borrowerData.duration,
        riskScore: borrowerData.riskScore || this.calculateRiskScore(borrowerData),
        creditScore: borrowerData.creditScore || this.calculateCreditScore(borrowerData),
        location: borrowerData.location || {},
        sector: borrowerData.sector || 'general',
        socialImpact: borrowerData.socialImpact || this.calculateSocialImpact(borrowerData),
        urgency: borrowerData.urgency || this.calculateUrgency(borrowerData),
        preferences: borrowerData.preferences || {},
        proposals: [],
        profile: user,
        timestamp: new Date(),
        matchingAttempts: 0,
        compatibilityHistory: []
      };

      this.borrowers.push(borrower);

      // Update market trends
      this.updateMarketTrends('borrower', borrower);

      return borrower;
    } catch (error) {
      console.error('Error adding borrower:', error);
      throw error;
    }
  }

  /**
   * Add a lender with investment portfolio analysis
   */
  async addLender(lenderData) {
    try {
      const user = await User.findById(lenderData.userId).select(
        'fullName email phone role'
      );

      if (!user) {
        throw new Error('Lender user profile not found');
      }

      const lender = {
        id: lenderData.id,
        userId: lenderData.userId,
        amount: lenderData.amount,
        minInterestRate: lenderData.minInterestRate || 8,
        maxInterestRate: lenderData.maxInterestRate || 18,
        maxDuration: lenderData.maxDuration || 24,
        riskTolerance: lenderData.riskTolerance || 5,
        preferredSectors: lenderData.preferredSectors || [],
        preferredLocations: lenderData.preferredLocations || [],
        investmentGoals: lenderData.investmentGoals || 'diversified',
        autoInvest: lenderData.autoInvest || false,
        portfolio: lenderData.portfolio || [],
        reputation: lenderData.reputation || this.calculateLenderReputation(lenderData),
        preferences: lenderData.preferences || {},
        proposals: [],
        profile: user,
        timestamp: new Date(),
        successRate: lenderData.successRate || 0.8
      };

      this.lenders.push(lender);

      // Update market trends
      this.updateMarketTrends('lender', lender);

      return lender;
    } catch (error) {
      console.error('Error adding lender:', error);
      throw error;
    }
  }

  /**
   * Calculate comprehensive risk score
   */
  calculateRiskScore(borrowerData) {
    let riskScore = 5; // Base score

    // KYC verification reduces risk
    if (borrowerData.kycVerified) riskScore -= 1;
    if (borrowerData.faceVerified) riskScore -= 0.5;
    if (borrowerData.digilockerVerified) riskScore -= 0.5;

    // Amount-based risk adjustment
    if (borrowerData.amount > 500000) riskScore += 1;
    else if (borrowerData.amount < 50000) riskScore -= 0.5;

    // Duration-based risk
    if (borrowerData.duration > 24) riskScore += 1;
    else if (borrowerData.duration < 6) riskScore -= 0.5;

    // Sector-based risk
    const highRiskSectors = ['mining', 'gambling', 'weapons'];
    const lowRiskSectors = ['agriculture', 'education', 'healthcare'];

    if (highRiskSectors.includes(borrowerData.sector)) riskScore += 1;
    if (lowRiskSectors.includes(borrowerData.sector)) riskScore -= 0.5;

    return Math.max(1, Math.min(10, riskScore));
  }

  /**
   * Calculate credit score based on various factors
   */
  calculateCreditScore(borrowerData) {
    let score = 650; // Base CIBIL-like score

    // Verification boosts
    if (borrowerData.kycVerified) score += 50;
    if (borrowerData.faceVerified) score += 25;
    if (borrowerData.digilockerVerified) score += 25;

    // Amount responsibility
    if (borrowerData.amount <= 100000) score += 20;

    // Sector reliability
    const reliableSectors = ['agriculture', 'education', 'healthcare'];
    if (reliableSectors.includes(borrowerData.sector)) score += 15;

    return Math.min(900, Math.max(300, score));
  }

  /**
   * Calculate social impact score
   */
  calculateSocialImpact(borrowerData) {
    let impact = 5; // Base impact

    // Sector impact
    const highImpactSectors = {
      'agriculture': 8,
      'education': 9,
      'healthcare': 9,
      'women_empowerment': 8,
      'rural_development': 7,
      'renewable_energy': 7
    };

    impact = highImpactSectors[borrowerData.sector] || impact;

    // Location-based impact (rural areas get higher scores)
    if (borrowerData.location && borrowerData.location.rural) {
      impact += 1;
    }

    return Math.min(10, impact);
  }

  /**
   * Calculate urgency score
   */
  calculateUrgency(borrowerData) {
    let urgency = 5; // Medium urgency

    // Time-sensitive needs
    if (borrowerData.purpose === 'medical_emergency') urgency = 9;
    if (borrowerData.purpose === 'education_fees') urgency = 8;
    if (borrowerData.purpose === 'crop_failure') urgency = 8;

    // Amount-based urgency
    if (borrowerData.amount < 25000) urgency += 1; // Small loans often more urgent

    return Math.min(10, Math.max(1, urgency));
  }

  /**
   * Calculate lender reputation score
   */
  calculateLenderReputation(lenderData) {
    let reputation = 5; // Base reputation

    // Success rate impact
    if (lenderData.successRate) {
      reputation += (lenderData.successRate - 0.5) * 4; // 0.5 baseline
    }

    // Portfolio diversity
    if (lenderData.portfolio && lenderData.portfolio.length > 5) {
      reputation += 1;
    }

    // Investment amount (larger investors get slight boost)
    if (lenderData.amount > 1000000) reputation += 0.5;

    return Math.min(10, Math.max(1, reputation));
  }

  /**
   * Advanced compatibility scoring with machine learning insights
   */
  calculateAdvancedCompatibility(borrower, lender) {
    let score = 0;
    let factors = {};

    // Interest Rate Compatibility (20%)
    const rateDiff = Math.abs(borrower.interestRate - lender.minInterestRate);
    const rateScore = Math.max(0, 1 - (rateDiff / 10)); // Max 10% difference
    score += rateScore * this.scoringWeights.interestRate;
    factors.interestRate = rateScore;

    // Amount Compatibility (18%)
    const amountRatio = Math.min(borrower.amount, lender.amount) / Math.max(borrower.amount, lender.amount);
    score += amountRatio * this.scoringWeights.amount;
    factors.amount = amountRatio;

    // Duration Compatibility (12%)
    const durationScore = borrower.duration <= lender.maxDuration ? 1 : 0;
    score += durationScore * this.scoringWeights.duration;
    factors.duration = durationScore;

    // Risk Compatibility (12%)
    const riskDiff = Math.abs(borrower.riskScore - lender.riskTolerance);
    const riskScore = Math.max(0, 1 - (riskDiff / 10));
    score += riskScore * this.scoringWeights.riskScore;
    factors.risk = riskScore;

    // Credit Score Compatibility (10%)
    const creditScore = borrower.creditScore >= 650 ? 1 : (borrower.creditScore / 650);
    score += creditScore * this.scoringWeights.creditScore;
    factors.credit = creditScore;

    // Location Matching (8%)
    const locationScore = this.calculateLocationCompatibility(borrower.location, lender.preferredLocations);
    score += locationScore * this.scoringWeights.location;
    factors.location = locationScore;

    // Sector Matching (8%)
    const sectorScore = lender.preferredSectors.includes(borrower.sector) ? 1 :
                       lender.preferredSectors.length === 0 ? 0.5 : 0;
    score += sectorScore * this.scoringWeights.sector;
    factors.sector = sectorScore;

    // Social Impact Alignment (6%)
    const impactScore = Math.min(borrower.socialImpact / 10, 1);
    score += impactScore * this.scoringWeights.socialImpact;
    factors.socialImpact = impactScore;

    // Urgency Factor (4%)
    const urgencyScore = borrower.urgency / 10;
    score += urgencyScore * this.scoringWeights.urgency;
    factors.urgency = urgencyScore;

    // Lender Reputation (2%)
    const reputationScore = lender.reputation / 10;
    score += reputationScore * this.scoringWeights.lenderReputation;
    factors.reputation = reputationScore;

    return {
      totalScore: Math.round(score * 100) / 100,
      factors: factors,
      weightedScore: score
    };
  }

  /**
   * Calculate location compatibility
   */
  calculateLocationCompatibility(borrowerLocation, lenderPreferences) {
    if (!borrowerLocation || !lenderPreferences || lenderPreferences.length === 0) {
      return 0.5; // Neutral score
    }

    // Check if borrower's location matches lender preferences
    const matches = lenderPreferences.some(pref => {
      return pref.state === borrowerLocation.state ||
             pref.district === borrowerLocation.district ||
             pref.region === borrowerLocation.region;
    });

    return matches ? 1 : 0;
  }

  /**
   * Update market trends for adaptive matching
   */
  updateMarketTrends(type, entity) {
    if (type === 'borrower') {
      this.marketTrends.totalLiquidity -= entity.amount;

      // Update sector demand
      this.marketTrends.sectorDemand[entity.sector] =
        (this.marketTrends.sectorDemand[entity.sector] || 0) + entity.amount;

      // Update risk distribution
      const riskBucket = Math.floor(entity.riskScore);
      this.marketTrends.riskDistribution[riskBucket] =
        (this.marketTrends.riskDistribution[riskBucket] || 0) + 1;

    } else if (type === 'lender') {
      this.marketTrends.totalLiquidity += entity.amount;
      this.marketTrends.averageInterestRate =
        (this.marketTrends.averageInterestRate + entity.minInterestRate) / 2;
    }
  }

  /**
   * Run advanced matching algorithm with optimization
   */
  async runAdvancedMatching(options = {}) {
    console.log('\n=== 🤖 ADVANCED LOAN MATCHING ALGORITHM ===');
    console.log(`📊 Processing ${this.borrowers.length} borrowers and ${this.lenders.length} lenders`);

    // Initialize
    this.freeBorrowers = [...this.borrowers];
    this.matches = new Map();

    // Reset proposals and compatibility history
    this.borrowers.forEach(b => {
      b.proposals = [];
      b.compatibilityHistory = [];
    });
    this.lenders.forEach(l => l.proposals = []);

    const maxIterations = Math.min(this.borrowers.length * this.lenders.length, 1000);
    let iterations = 0;
    let stableMatches = 0;

    while (this.freeBorrowers.length > 0 && iterations < maxIterations) {
      const borrower = this.selectNextBorrower();

      if (borrower.matchingAttempts > 10) {
        console.log(`❌ Borrower ${borrower.id} exceeded max attempts, skipping`);
        this.freeBorrowers = this.freeBorrowers.filter(b => b.id !== borrower.id);
        continue;
      }

      const bestMatches = this.findOptimalMatches(borrower, options);

      if (bestMatches.length > 0) {
        const selectedMatch = this.selectBestMatch(borrower, bestMatches);

        if (this.attemptMatch(borrower, selectedMatch.lender, selectedMatch)) {
          stableMatches++;
          borrower.compatibilityHistory.push(selectedMatch.score);
        } else {
          borrower.matchingAttempts++;
        }
      } else {
        // No suitable matches found
        borrower.matchingAttempts++;
        if (borrower.matchingAttempts > 5) {
          this.freeBorrowers = this.freeBorrowers.filter(b => b.id !== borrower.id);
        }
      }

      iterations++;

      // Adaptive learning: Update scoring weights based on success
      if (iterations % 50 === 0) {
        this.adaptScoringWeights();
      }
    }

    const results = this.generateResults();

    // Log matching results
    await auditService.logSystemEvent('loan_matching_completed', {
      totalBorrowers: this.borrowers.length,
      totalLenders: this.lenders.length,
      matchedBorrowers: results.matchedBorrowers,
      iterations: iterations,
      successRate: results.successRate
    }, 'medium');

    console.log(`\n✅ Matching Complete: ${results.matchedBorrowers}/${this.borrowers.length} borrowers matched`);
    console.log(`📈 Success Rate: ${results.successRate}%`);

    return results;
  }

  /**
   * Select next borrower using priority queue (urgency-based)
   */
  selectNextBorrower() {
    // Sort by urgency and matching attempts
    this.freeBorrowers.sort((a, b) => {
      const urgencyDiff = b.urgency - a.urgency;
      if (urgencyDiff !== 0) return urgencyDiff;
      return a.matchingAttempts - b.matchingAttempts;
    });

    return this.freeBorrowers[0];
  }

  /**
   * Find optimal matches using multi-criteria optimization
   */
  findOptimalMatches(borrower, options = {}) {
    const matches = [];
    const { maxMatches = 5, minScore = 0.4 } = options;

    for (const lender of this.lenders) {
      // Skip if already proposed to this lender
      if (borrower.proposals.includes(lender.id)) continue;

      // Basic constraints check
      if (!this.meetsBasicConstraints(borrower, lender)) continue;

      const compatibility = this.calculateAdvancedCompatibility(borrower, lender);

      if (compatibility.totalScore >= minScore) {
        matches.push({
          lender: lender,
          score: compatibility.totalScore,
          factors: compatibility.factors,
          amount: Math.min(borrower.amount, lender.amount),
          interestRate: borrower.interestRate
        });
      }
    }

    // Sort by score and return top matches
    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, maxMatches);
  }

  /**
   * Check basic matching constraints
   */
  meetsBasicConstraints(borrower, lender) {
    return borrower.amount <= lender.amount &&
           borrower.interestRate >= lender.minInterestRate &&
           borrower.interestRate <= lender.maxInterestRate &&
           borrower.duration <= lender.maxDuration &&
           borrower.riskScore <= lender.riskTolerance + 2; // Allow some flexibility
  }

  /**
   * Select best match using advanced criteria
   */
  selectBestMatch(borrower, matches) {
    if (matches.length === 1) return matches[0];

    // Use multi-criteria decision making
    let bestMatch = matches[0];
    let bestCompositeScore = 0;

    for (const match of matches) {
      const lender = match.lender;

      // Composite score considering multiple factors
      let compositeScore = match.score * 0.6; // Base compatibility

      // Lender reputation bonus
      compositeScore += (lender.reputation / 10) * 0.2;

      // Lender success rate bonus
      compositeScore += lender.successRate * 0.1;

      // Amount match bonus (prefer lenders who can fulfill more)
      const amountMatchRatio = match.amount / borrower.amount;
      compositeScore += amountMatchRatio * 0.1;

      if (compositeScore > bestCompositeScore) {
        bestCompositeScore = compositeScore;
        bestMatch = match;
      }
    }

    return bestMatch;
  }

  /**
   * Attempt to create a match
   */
  attemptMatch(borrower, lender, matchDetails) {
    // Check if lender is already matched
    const currentMatch = this.matches.get(lender.id);

    if (!currentMatch) {
      // Lender is free, create match
      this.createMatch(borrower, lender, matchDetails);
      return true;
    } else {
      // Check if lender prefers this borrower
      const currentCompatibility = this.calculateAdvancedCompatibility(currentMatch, lender);
      const newCompatibility = this.calculateAdvancedCompatibility(borrower, lender);

      if (newCompatibility.totalScore > currentCompatibility.totalScore) {
        // Break current match and create new one
        this.breakMatch(currentMatch, lender);
        this.createMatch(borrower, lender, matchDetails);
        return true;
      }
    }

    return false;
  }

  /**
   * Create a match
   */
  createMatch(borrower, lender, matchDetails) {
    this.matches.set(lender.id, {
      borrower: borrower,
      details: matchDetails,
      timestamp: new Date()
    });

    this.freeBorrowers = this.freeBorrowers.filter(b => b.id !== borrower.id);

    // Update lender's available amount
    lender.amount -= matchDetails.amount;

    console.log(`✅ Match: ${borrower.profile.fullName} → ${lender.profile.fullName} (₹${matchDetails.amount})`);
  }

  /**
   * Break an existing match
   */
  breakMatch(borrower, lender) {
    this.freeBorrowers.push(borrower);

    // Restore lender's available amount
    const matchDetails = this.matches.get(lender.id);
    if (matchDetails) {
      lender.amount += matchDetails.details.amount;
    }

    this.matches.delete(lender.id);
  }

  /**
   * Adaptive learning: Update scoring weights based on success patterns
   */
  adaptScoringWeights() {
    const recentMatches = Array.from(this.matches.values()).slice(-20);

    if (recentMatches.length < 5) return; // Need minimum data

    // Analyze which factors led to successful matches
    const factorSuccess = {};

    for (const match of recentMatches) {
      for (const [factor, score] of Object.entries(match.details.factors)) {
        if (!factorSuccess[factor]) factorSuccess[factor] = { total: 0, count: 0 };

        factorSuccess[factor].total += score;
        factorSuccess[factor].count += 1;
      }
    }

    // Update weights based on success patterns
    for (const [factor, data] of Object.entries(factorSuccess)) {
      if (data.count > 0) {
        const avgSuccess = data.total / data.count;

        if (avgSuccess > 0.7) {
          // Increase weight for successful factors
          this.scoringWeights[factor] *= (1 + this.learningRate);
        } else if (avgSuccess < 0.3) {
          // Decrease weight for unsuccessful factors
          this.scoringWeights[factor] *= (1 - this.learningRate);
        }
      }
    }

    // Normalize weights
    const totalWeight = Object.values(this.scoringWeights).reduce((sum, w) => sum + w, 0);
    for (const factor in this.scoringWeights) {
      this.scoringWeights[factor] /= totalWeight;
    }
  }

  /**
   * Generate comprehensive results
   */
  generateResults() {
    const matchedBorrowers = Array.from(this.matches.values()).map(m => m.borrower);
    const matchedLenders = Array.from(this.matches.keys());

    const unmatchedBorrowers = this.borrowers.filter(b =>
      !matchedBorrowers.some(mb => mb.id === b.id)
    );

    const unmatchedLenders = this.lenders.filter(l =>
      !matchedLenders.includes(l.id)
    );

    const matches = Array.from(this.matches.entries()).map(([lenderId, match]) => ({
      lenderId,
      borrowerId: match.borrower.id,
      amount: match.details.amount,
      interestRate: match.details.interestRate,
      compatibilityScore: match.details.score,
      factors: match.details.factors,
      timestamp: match.timestamp
    }));

    return {
      totalBorrowers: this.borrowers.length,
      totalLenders: this.lenders.length,
      matchedBorrowers: matchedBorrowers.length,
      matchedLenders: matchedLenders.length,
      unmatchedBorrowers: unmatchedBorrowers.length,
      unmatchedLenders: unmatchedLenders.length,
      matches: matches,
      successRate: this.borrowers.length > 0 ?
        ((matchedBorrowers.length / this.borrowers.length) * 100).toFixed(1) : 0,
      averageCompatibility: matches.length > 0 ?
        matches.reduce((sum, m) => sum + m.compatibilityScore, 0) / matches.length : 0,
      marketTrends: this.marketTrends,
      scoringWeights: this.scoringWeights
    };
  }

  /**
   * Get matching analytics and insights
   */
  getAnalytics() {
    const results = this.generateResults();

    return {
      ...results,
      insights: {
        topPerformingFactors: this.getTopFactors(),
        marketEfficiency: this.calculateMarketEfficiency(),
        riskDistribution: this.analyzeRiskDistribution(),
        sectorTrends: this.analyzeSectorTrends()
      }
    };
  }

  /**
   * Get top performing matching factors
   */
  getTopFactors() {
    return Object.entries(this.scoringWeights)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([factor, weight]) => ({ factor, weight: (weight * 100).toFixed(1) + '%' }));
  }

  /**
   * Calculate market efficiency
   */
  calculateMarketEfficiency() {
    const results = this.generateResults();
    const liquidityUtilization = (results.matchedBorrowers / results.totalBorrowers) * 100;
    const lenderUtilization = (results.matchedLenders / results.totalLenders) * 100;

    return {
      liquidityUtilization: liquidityUtilization.toFixed(1) + '%',
      lenderUtilization: lenderUtilization.toFixed(1) + '%',
      overallEfficiency: ((liquidityUtilization + lenderUtilization) / 2).toFixed(1) + '%'
    };
  }

  /**
   * Analyze risk distribution in matches
   */
  analyzeRiskDistribution() {
    const matches = Array.from(this.matches.values());
    const riskBuckets = { low: 0, medium: 0, high: 0 };

    matches.forEach(match => {
      const risk = match.borrower.riskScore;
      if (risk <= 3) riskBuckets.low++;
      else if (risk <= 7) riskBuckets.medium++;
      else riskBuckets.high++;
    });

    return riskBuckets;
  }

  /**
   * Analyze sector trends
   */
  analyzeSectorTrends() {
    const matches = Array.from(this.matches.values());
    const sectorStats = {};

    matches.forEach(match => {
      const sector = match.borrower.sector;
      if (!sectorStats[sector]) {
        sectorStats[sector] = { count: 0, totalAmount: 0 };
      }
      sectorStats[sector].count++;
      sectorStats[sector].totalAmount += match.details.amount;
    });

    return sectorStats;
  }

  /**
   * Export matching data for analysis
   */
  exportMatchingData() {
    const results = this.generateResults();

    return {
      timestamp: new Date(),
      algorithm: 'AdvancedLoanMatcher',
      version: '2.0',
      results: results,
      analytics: this.getAnalytics(),
      rawData: {
        borrowers: this.borrowers,
        lenders: this.lenders,
        matches: Array.from(this.matches.entries())
      }
    };
  }
}

module.exports = AdvancedLoanMatcher;
