/**
 * Secondary Market Service
 * Enables trading of loan portions between investors
 * Provides liquidity and risk diversification for lenders
 */

const Loan = require('../models/Loan');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const auditService = require('./auditService');
const eventBus = require('../utils/eventBus');

class SecondaryMarketService {
  constructor() {
    // Trading parameters
    this.tradingFees = {
      listingFee: 0.005,    // 0.5% of loan portion value
      transactionFee: 0.01, // 1% of transaction value
      platformFee: 0.002    // 0.2% platform fee
    };

    // Market regulations
    this.regulations = {
      minimumHoldingPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
      maximumDiscount: 0.3, // Maximum 30% discount
      minimumTradeValue: 5000, // ₹5,000 minimum
      kycRequired: true,
      accreditedInvestorMinimum: 100000 // ₹1 lakh minimum investment
    };

    // Market analytics
    this.marketStats = {
      totalListings: 0,
      totalVolume: 0,
      averageDiscount: 0,
      activeTraders: 0,
      sectorPerformance: {}
    };
  }

  /**
   * List a loan portion for sale on secondary market
   * @param {string} loanId - Loan ID
   * @param {string} sellerId - Seller (lender) ID
   * @param {Object} listingDetails - Listing details
   * @returns {Object} Listing result
   */
  async createListing(loanId, sellerId, listingDetails) {
    try {
      console.log(`\n=== 📈 CREATING SECONDARY MARKET LISTING ===`);
      console.log(`Loan ID: ${loanId}, Seller: ${sellerId}`);

      // Validate listing eligibility
      const eligibilityCheck = await this.checkListingEligibility(loanId, sellerId, listingDetails);
      if (!eligibilityCheck.eligible) {
        return {
          success: false,
          error: 'Not eligible for listing',
          reasons: eligibilityCheck.reasons
        };
      }

      // Get loan and seller details
      const loan = await Loan.findById(loanId).populate('lenders.lenderId');
      const seller = await User.findById(sellerId);

      // Find seller's portion in the loan
      const sellerPortion = loan.lenders.find(l => l.lenderId._id.toString() === sellerId);
      if (!sellerPortion) {
        return { success: false, error: 'Seller does not have a portion in this loan' };
      }

      // Calculate listing parameters
      const remainingValue = (sellerPortion.amount * (1 - (loan.totalRepaidAmount || 0) / loan.totalAmount));
      const minimumPrice = remainingValue * (1 - this.regulations.maximumDiscount);
      const listingPrice = Math.max(listingDetails.price || remainingValue, minimumPrice);

      // Calculate fees
      const listingFee = remainingValue * this.tradingFees.listingFee;

      // Create listing
      const listing = {
        listingId: this.generateListingId(),
        loanId: loanId,
        sellerId: sellerId,
        originalAmount: sellerPortion.amount,
        remainingValue: remainingValue,
        listingPrice: listingPrice,
        discountPercentage: ((remainingValue - listingPrice) / remainingValue) * 100,
        expectedYield: this.calculateExpectedYield(loan, sellerPortion),
        loanDetails: {
          sector: loan.sector,
          interestRate: loan.averageInterestRate,
          duration: loan.duration,
          remainingTerm: this.calculateRemainingTerm(loan),
          riskScore: loan.riskScore || 5,
          borrowerCreditScore: loan.borrowerId?.creditScore || 650
        },
        listingDate: new Date(),
        expiryDate: new Date(Date.now() + (listingDetails.duration || 30) * 24 * 60 * 60 * 1000), // Default 30 days
        status: 'ACTIVE',
        visibility: listingDetails.visibility || 'public', // public, private, institutional
        minimumInvestment: listingDetails.minimumInvestment || this.regulations.minimumTradeValue,
        fees: {
          listingFee: listingFee,
          estimatedTransactionFee: listingPrice * this.tradingFees.transactionFee,
          platformFee: listingPrice * this.tradingFees.platformFee
        },
        analytics: {
          views: 0,
          inquiries: 0,
          offers: 0
        }
      };

      // Deduct listing fee from seller's account (in real implementation)
      console.log(`Listing fee: ₹${listingFee.toLocaleString()}`);

      // Log the listing creation
      await auditService.logLoanActivity(sellerId, loanId, 'secondary_market_listing_created', {
        listingId: listing.listingId,
        listingPrice: listingPrice,
        discountPercentage: listing.discountPercentage
      });

      // Emit market event
      eventBus.emitEvent('market.listing_created', {
        listingId: listing.listingId,
        loanId: loanId,
        sellerId: sellerId,
        listingPrice: listingPrice,
        sector: loan.sector
      });

      console.log(`✅ Listing created: ${listing.listingId} for ₹${listingPrice.toLocaleString()}`);

      return {
        success: true,
        listing: listing,
        message: 'Loan portion listed successfully on secondary market',
        nextSteps: [
          'Listing goes live on marketplace',
          'Interested investors can view and make offers',
          'Seller can accept/reject offers',
          'Upon acceptance, transfer process begins'
        ]
      };

    } catch (error) {
      console.error('Error creating listing:', error);
      return {
        success: false,
        error: 'Failed to create listing',
        details: error.message
      };
    }
  }

  /**
   * Check if a loan portion can be listed for sale
   * @param {string} loanId - Loan ID
   * @param {string} sellerId - Seller ID
   * @param {Object} listingDetails - Listing details
   * @returns {Object} Eligibility result
   */
  async checkListingEligibility(loanId, sellerId, listingDetails = {}) {
    try {
      const loan = await Loan.findById(loanId).populate('borrowerId');
      if (!loan) {
        return { eligible: false, reasons: ['Loan not found'] };
      }

      const reasons = [];

      // Check loan status
      if (!['ACTIVE', 'FUNDED'].includes(loan.status)) {
        reasons.push(`Loan status ${loan.status} not eligible for secondary trading`);
      }

      // Check minimum holding period
      const holdingPeriod = Date.now() - loan.createdAt.getTime();
      if (holdingPeriod < this.regulations.minimumHoldingPeriod) {
        const daysRemaining = Math.ceil((this.regulations.minimumHoldingPeriod - holdingPeriod) / (24 * 60 * 60 * 1000));
        reasons.push(`Minimum holding period not met (${daysRemaining} days remaining)`);
      }

      // Check seller's portion
      const sellerPortion = loan.lenders.find(l => l.lenderId._id.toString() === sellerId);
      if (!sellerPortion) {
        reasons.push('Seller does not own a portion of this loan');
      } else {
        const remainingValue = sellerPortion.amount * (1 - (loan.totalRepaidAmount || 0) / loan.totalAmount);
        if (remainingValue < this.regulations.minimumTradeValue) {
          reasons.push(`Remaining value too low (minimum ₹${this.regulations.minimumTradeValue.toLocaleString()} required)`);
        }
      }

      // Check seller KYC status
      const seller = await User.findById(sellerId);
      if (this.regulations.kycRequired && !seller?.kycVerified) {
        reasons.push('Seller KYC verification required for secondary market trading');
      }

      // Check for any outstanding issues
      if (loan.status === 'DEFAULTED') {
        reasons.push('Cannot list defaulted loans on secondary market');
      }

      return {
        eligible: reasons.length === 0,
        reasons: reasons,
        loanStatus: loan.status,
        holdingPeriod: holdingPeriod,
        remainingValue: sellerPortion ? sellerPortion.amount * (1 - (loan.totalRepaidAmount || 0) / loan.totalAmount) : 0
      };

    } catch (error) {
      console.error('Error checking listing eligibility:', error);
      return {
        eligible: false,
        reasons: ['Eligibility check failed'],
        error: error.message
      };
    }
  }

  /**
   * Submit an offer for a listed loan portion
   * @param {string} listingId - Listing ID
   * @param {string} buyerId - Buyer ID
   * @param {Object} offerDetails - Offer details
   * @returns {Object} Offer result
   */
  async submitOffer(listingId, buyerId, offerDetails) {
    try {
      console.log(`\n=== 💰 SUBMITTING OFFER ===`);
      console.log(`Listing: ${listingId}, Buyer: ${buyerId}, Price: ₹${offerDetails.price}`);

      // Validate offer
      const validation = await this.validateOffer(listingId, buyerId, offerDetails);
      if (!validation.valid) {
        return {
          success: false,
          error: 'Offer validation failed',
          reasons: validation.reasons
        };
      }

      // Get listing details (in real implementation, this would be from a database)
      const listing = await this.getListingById(listingId);
      if (!listing) {
        return { success: false, error: 'Listing not found' };
      }

      // Create offer
      const offer = {
        offerId: this.generateOfferId(),
        listingId: listingId,
        buyerId: buyerId,
        offeredPrice: offerDetails.price,
        quantity: offerDetails.quantity || 1, // Portion of listing to buy (0-1)
        offerType: offerDetails.offerType || 'firm', // firm, indicative
        conditions: offerDetails.conditions || [],
        expiryDate: new Date(Date.now() + (offerDetails.validityDays || 7) * 24 * 60 * 60 * 1000),
        status: 'PENDING',
        submittedAt: new Date(),
        analytics: {
          timeToSubmit: Date.now() - listing.listingDate.getTime(),
          discountOffered: ((listing.listingPrice - offerDetails.price) / listing.listingPrice) * 100
        }
      };

      // Log the offer
      await auditService.logLoanActivity(buyerId, listing.loanId, 'secondary_market_offer_submitted', {
        offerId: offer.offerId,
        listingId: listingId,
        offeredPrice: offerDetails.price,
        discountPercentage: offer.analytics.discountOffered
      });

      // Notify seller
      eventBus.emitEvent('market.offer_received', {
        listingId: listingId,
        offerId: offer.offerId,
        sellerId: listing.sellerId,
        buyerId: buyerId,
        offeredPrice: offerDetails.price
      });

      console.log(`✅ Offer submitted: ${offer.offerId} for ₹${offerDetails.price.toLocaleString()}`);

      return {
        success: true,
        offer: offer,
        message: 'Offer submitted successfully',
        estimatedSettlement: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // T+2 settlement
      };

    } catch (error) {
      console.error('Error submitting offer:', error);
      return {
        success: false,
        error: 'Failed to submit offer',
        details: error.message
      };
    }
  }

  /**
   * Validate an offer before submission
   * @param {string} listingId - Listing ID
   * @param {string} buyerId - Buyer ID
   * @param {Object} offerDetails - Offer details
   * @returns {Object} Validation result
   */
  async validateOffer(listingId, buyerId, offerDetails) {
    try {
      const reasons = [];

      // Get listing (in real implementation)
      const listing = await this.getListingById(listingId);
      if (!listing) {
        return { valid: false, reasons: ['Listing not found'] };
      }

      // Check if listing is still active
      if (listing.status !== 'ACTIVE' || listing.expiryDate < new Date()) {
        reasons.push('Listing is no longer active');
      }

      // Check buyer eligibility
      const buyer = await User.findById(buyerId);
      if (!buyer) {
        reasons.push('Buyer account not found');
      } else {
        if (this.regulations.kycRequired && !buyer.kycVerified) {
          reasons.push('Buyer KYC verification required');
        }

        // Check minimum investment requirement
        if (offerDetails.price < this.regulations.accreditedInvestorMinimum) {
          reasons.push(`Minimum investment amount is ₹${this.regulations.accreditedInvestorMinimum.toLocaleString()}`);
        }
      }

      // Check offer price
      const minPrice = listing.remainingValue * (1 - this.regulations.maximumDiscount);
      if (offerDetails.price < minPrice) {
        reasons.push(`Offer price too low (minimum ₹${minPrice.toLocaleString()})`);
      }

      // Check offer amount
      if (offerDetails.price < listing.minimumInvestment) {
        reasons.push(`Offer below minimum investment (₹${listing.minimumInvestment.toLocaleString()})`);
      }

      return {
        valid: reasons.length === 0,
        reasons: reasons,
        minPrice: minPrice,
        maxDiscount: this.regulations.maximumDiscount * 100
      };

    } catch (error) {
      console.error('Error validating offer:', error);
      return {
        valid: false,
        reasons: ['Offer validation failed'],
        error: error.message
      };
    }
  }

  /**
   * Accept or reject an offer
   * @param {string} offerId - Offer ID
   * @param {string} sellerId - Seller ID
   * @param {string} decision - ACCEPT or REJECT
   * @param {Object} decisionDetails - Additional details
   * @returns {Object} Decision result
   */
  async processOfferDecision(offerId, sellerId, decision, decisionDetails = {}) {
    try {
      console.log(`\n=== ✅ PROCESSING OFFER DECISION ===`);
      console.log(`Offer: ${offerId}, Decision: ${decision}`);

      // Get offer details (in real implementation)
      const offer = await this.getOfferById(offerId);
      if (!offer) {
        return { success: false, error: 'Offer not found' };
      }

      // Verify seller authorization
      const listing = await this.getListingById(offer.listingId);
      if (listing.sellerId !== sellerId) {
        return { success: false, error: 'Unauthorized to process this offer' };
      }

      if (decision === 'ACCEPT') {
        // Execute the trade
        const tradeResult = await this.executeTrade(offer, listing);

        if (tradeResult.success) {
          // Update offer status
          offer.status = 'ACCEPTED';
          offer.acceptedAt = new Date();
          offer.decisionDetails = decisionDetails;

          // Log the acceptance
          await auditService.logLoanActivity(sellerId, listing.loanId, 'secondary_market_offer_accepted', {
            offerId: offerId,
            tradeId: tradeResult.tradeId,
            tradeValue: offer.offeredPrice
          });

          // Notify buyer
          eventBus.emitEvent('market.offer_accepted', {
            offerId: offerId,
            buyerId: offer.buyerId,
            sellerId: sellerId,
            tradeValue: offer.offeredPrice,
            settlementDate: tradeResult.settlementDate
          });

          console.log(`✅ Offer accepted and trade executed: ${tradeResult.tradeId}`);

          return {
            success: true,
            decision: 'ACCEPTED',
            trade: tradeResult,
            message: 'Offer accepted and trade executed successfully'
          };
        } else {
          return {
            success: false,
            error: 'Trade execution failed',
            details: tradeResult.error
          };
        }

      } else if (decision === 'REJECT') {
        // Reject the offer
        offer.status = 'REJECTED';
        offer.rejectedAt = new Date();
        offer.decisionDetails = decisionDetails;

        // Log the rejection
        await auditService.logLoanActivity(sellerId, listing.loanId, 'secondary_market_offer_rejected', {
          offerId: offerId,
          reason: decisionDetails.reason || 'Seller decision'
        });

        // Notify buyer
        eventBus.emitEvent('market.offer_rejected', {
          offerId: offerId,
          buyerId: offer.buyerId,
          sellerId: sellerId,
          reason: decisionDetails.reason
        });

        console.log(`❌ Offer rejected: ${offerId}`);

        return {
          success: true,
          decision: 'REJECTED',
          message: 'Offer rejected successfully'
        };
      }

    } catch (error) {
      console.error('Error processing offer decision:', error);
      return {
        success: false,
        error: 'Failed to process offer decision',
        details: error.message
      };
    }
  }

  /**
   * Execute a trade between buyer and seller
   * @param {Object} offer - Offer details
   * @param {Object} listing - Listing details
   * @returns {Object} Trade execution result
   */
  async executeTrade(offer, listing) {
    try {
      console.log(`\n=== 🔄 EXECUTING TRADE ===`);
      console.log(`Value: ₹${offer.offeredPrice.toLocaleString()}`);

      // Calculate fees
      const transactionFee = offer.offeredPrice * this.tradingFees.transactionFee;
      const platformFee = offer.offeredPrice * this.tradingFees.platformFee;
      const totalFees = transactionFee + platformFee;

      // Net amount to seller
      const sellerProceeds = offer.offeredPrice - totalFees;

      // Create trade record
      const trade = {
        tradeId: this.generateTradeId(),
        offerId: offer.offerId,
        listingId: listing.listingId,
        loanId: listing.loanId,
        buyerId: offer.buyerId,
        sellerId: listing.sellerId,
        tradeValue: offer.offeredPrice,
        netSellerProceeds: sellerProceeds,
        fees: {
          transactionFee: transactionFee,
          platformFee: platformFee,
          totalFees: totalFees
        },
        settlementDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // T+2 settlement
        status: 'SETTLEMENT_PENDING',
        executedAt: new Date(),
        analytics: {
          discountAchieved: listing.discountPercentage,
          holdingPeriod: (Date.now() - listing.listingDate.getTime()) / (24 * 60 * 60 * 1000),
          yieldRealized: this.calculateYieldRealized(listing, offer.offeredPrice)
        }
      };

      // Update loan ownership (transfer portion from seller to buyer)
      const transferResult = await this.transferLoanPortion(listing, offer.buyerId, offer.offeredPrice);

      if (!transferResult.success) {
        return {
          success: false,
          error: 'Loan portion transfer failed',
          details: transferResult.error
        };
      }

      // Update market statistics
      this.updateMarketStats(trade);

      // Log the trade
      await auditService.logSystemEvent('secondary_market_trade_executed', {
        tradeId: trade.tradeId,
        tradeValue: offer.offeredPrice,
        buyerId: offer.buyerId,
        sellerId: listing.sellerId
      }, 'high');

      console.log(`✅ Trade executed: ${trade.tradeId}`);

      return {
        success: true,
        trade: trade,
        settlementDate: trade.settlementDate,
        message: 'Trade executed successfully, settlement pending'
      };

    } catch (error) {
      console.error('Error executing trade:', error);
      return {
        success: false,
        error: 'Trade execution failed',
        details: error.message
      };
    }
  }

  /**
   * Transfer loan portion ownership
   * @param {Object} listing - Listing details
   * @param {string} newOwnerId - New owner ID
   * @param {number} transferValue - Transfer value
   * @returns {Object} Transfer result
   */
  async transferLoanPortion(listing, newOwnerId, transferValue) {
    try {
      const loan = await Loan.findById(listing.loanId);

      // Find seller's portion
      const sellerIndex = loan.lenders.findIndex(l => l.lenderId.toString() === listing.sellerId);
      if (sellerIndex === -1) {
        return { success: false, error: 'Seller portion not found' };
      }

      // Calculate portion size based on transfer value
      const portionRatio = transferValue / listing.remainingValue;
      const transferAmount = listing.originalAmount * portionRatio;

      // Update seller's portion
      loan.lenders[sellerIndex].amount -= transferAmount;

      // Remove seller if portion becomes zero
      if (loan.lenders[sellerIndex].amount <= 0) {
        loan.lenders.splice(sellerIndex, 1);
      }

      // Add buyer as new lender
      const existingBuyerIndex = loan.lenders.findIndex(l => l.lenderId.toString() === newOwnerId);
      if (existingBuyerIndex >= 0) {
        // Buyer already has a portion, add to it
        loan.lenders[existingBuyerIndex].amount += transferAmount;
      } else {
        // Add buyer as new lender
        loan.lenders.push({
          lenderId: newOwnerId,
          amount: transferAmount,
          status: 'ACTIVE',
          joinedAt: new Date()
        });
      }

      await loan.save();

      return {
        success: true,
        transferredAmount: transferAmount,
        portionRatio: portionRatio,
        message: 'Loan portion transferred successfully'
      };

    } catch (error) {
      console.error('Error transferring loan portion:', error);
      return {
        success: false,
        error: 'Loan portion transfer failed',
        details: error.message
      };
    }
  }

  /**
   * Get secondary market analytics
   * @param {Object} filters - Filter criteria
   * @returns {Object} Market analytics
   */
  async getMarketAnalytics(filters = {}) {
    try {
      // In a real implementation, this would query actual market data
      // For now, return simulated analytics

      const analytics = {
        marketOverview: {
          totalListings: this.marketStats.totalListings,
          activeListings: Math.floor(this.marketStats.totalListings * 0.7),
          totalVolume: this.marketStats.totalVolume,
          averageDiscount: this.marketStats.averageDiscount,
          activeTraders: this.marketStats.activeTraders
        },
        sectorPerformance: {
          agriculture: { listings: 45, avgYield: 12.5, avgDiscount: 5.2 },
          manufacturing: { listings: 23, avgYield: 11.8, avgDiscount: 7.1 },
          services: { listings: 67, avgYield: 10.9, avgDiscount: 6.8 },
          retail: { listings: 34, avgYield: 13.2, avgDiscount: 4.9 }
        },
        yieldAnalysis: {
          averageYield: 12.1,
          yieldDistribution: {
            '8-10%': 25,
            '10-12%': 35,
            '12-14%': 28,
            '14-16%': 12
          }
        },
        tradingActivity: {
          dailyTrades: 12,
          weeklyTrades: 78,
          monthlyTrades: 342,
          averageTradeSize: 45000
        },
        riskMetrics: {
          defaultRate: 2.1,
          recoveryRate: 68.5,
          averageRiskScore: 6.2
        }
      };

      return {
        success: true,
        analytics: analytics,
        filters: filters,
        timestamp: new Date(),
        disclaimer: 'Analytics based on simulated market data'
      };

    } catch (error) {
      console.error('Error getting market analytics:', error);
      return {
        success: false,
        error: 'Failed to get market analytics'
      };
    }
  }

  /**
   * Get listings with filtering and pagination
   * @param {Object} filters - Filter criteria
   * @param {Object} options - Query options
   * @returns {Object} Listings result
   */
  async getListings(filters = {}, options = {}) {
    try {
      // In a real implementation, this would query the listings database
      // For now, return empty result with proper structure

      return {
        success: true,
        listings: [],
        pagination: {
          currentPage: options.page || 1,
          totalPages: 0,
          totalListings: 0,
          hasNextPage: false,
          hasPrevPage: false
        },
        filters: filters,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Error getting listings:', error);
      return {
        success: false,
        error: 'Failed to get listings'
      };
    }
  }

  // Utility methods

  generateListingId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `LST${timestamp}${random}`;
  }

  generateOfferId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `OFR${timestamp}${random}`;
  }

  generateTradeId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TRD${timestamp}${random}`;
  }

  calculateExpectedYield(loan, sellerPortion) {
    const remainingTerm = this.calculateRemainingTerm(loan);
    const monthlyRate = loan.averageInterestRate / 12 / 100;
    const remainingPayments = sellerPortion.amount * (monthlyRate * Math.pow(1 + monthlyRate, remainingTerm)) /
                             (Math.pow(1 + monthlyRate, remainingTerm) - 1);

    return (remainingPayments / sellerPortion.amount) * 12 * 100; // Annualized yield
  }

  calculateRemainingTerm(loan) {
    const elapsedMonths = Math.floor((Date.now() - loan.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000));
    return Math.max(1, loan.duration - elapsedMonths);
  }

  calculateYieldRealized(listing, salePrice) {
    const holdingPeriod = (Date.now() - listing.listingDate.getTime()) / (365 * 24 * 60 * 60 * 1000); // Years
    const capitalGain = salePrice - listing.originalAmount;
    return (capitalGain / listing.originalAmount) / holdingPeriod * 100; // Annualized return
  }

  updateMarketStats(trade) {
    this.marketStats.totalListings += 1;
    this.marketStats.totalVolume += trade.tradeValue;
    this.marketStats.activeTraders = Math.max(this.marketStats.activeTraders, 150); // Simulated
  }

  // Placeholder methods for database operations
  async getListingById(listingId) {
    // In real implementation, query database
    return null;
  }

  async getOfferById(offerId) {
    // In real implementation, query database
    return null;
  }
}

module.exports = new SecondaryMarketService();
