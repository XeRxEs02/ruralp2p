const Asset = require('../models/Asset');
const User = require('../models/User');
const blockchainService = require('./blockchainService');
const { v4: uuidv4 } = require('uuid');

/**
 * AssetTokenizationService - Handles tokenization of physical assets
 * Creates NFTs for physical assets like gold, land, livestock, etc.
 */
class AssetTokenizationService {
  constructor() {
    this.tokenizedAssets = new Map();
    console.log('🔗 Asset Tokenization Service initialized');
  }

  /**
   * Register a new physical asset
   * @param {Object} assetData - Asset information
   * @param {string} ownerId - Owner user ID
   * @returns {Promise<Object>} Created asset
   */
  async registerAsset(assetData, ownerId) {
    try {
      const { name, type, description, estimatedValue, location, documents, tags } = assetData;

      // Validate required fields
      if (!name || !type || !description || !estimatedValue) {
        throw new Error('Name, type, description, and estimated value are required');
      }

      // Check if user exists
      const owner = await User.findById(ownerId);
      if (!owner) {
        throw new Error('Owner not found');
      }

      // Create new asset
      const asset = new Asset({
        ownerId,
        name,
        type,
        description,
        estimatedValue,
        location,
        documents: documents || [],
        tags: tags || [],
        tokenizationStatus: 'Pending',
      });

      await asset.save();

      console.log(`✅ Asset registered: ${asset.name} (${asset._id})`);
      return {
        success: true,
        asset: asset,
        message: 'Asset registered successfully',
      };

    } catch (error) {
      console.error('Asset registration error:', error);
      throw new Error(`Failed to register asset: ${error.message}`);
    }
  }

  /**
   * Tokenize an asset on blockchain
   * @param {string} assetId - Asset ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} Tokenization result
   */
  async tokenizeAsset(assetId, userId) {
    try {
      const asset = await Asset.findById(assetId);
      if (!asset) {
        throw new Error('Asset not found');
      }

      // Check if user owns the asset
      if (asset.ownerId.toString() !== userId) {
        throw new Error('Unauthorized: You do not own this asset');
      }

      // Check if asset can be tokenized
      if (!asset.canTokenize()) {
        throw new Error('Asset cannot be tokenized. It must be active, verified, and not collateralized');
      }

      // Update status to in progress
      asset.tokenizationStatus = 'InProgress';
      await asset.save();

      // Generate unique token ID
      const tokenId = `ASSET-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`;

      // Create blockchain transaction (mock for now)
      let blockchainResult;
      try {
        // In real implementation, this would create an NFT on blockchain
        blockchainResult = await blockchainService.verifyDocumentHash(
          `asset-${asset._id}-${tokenId}`
        );

        // Update asset with tokenization details
        asset.tokenId = tokenId;
        asset.blockchainTxHash = blockchainResult.txHash;
        asset.tokenizationStatus = 'Completed';

        await asset.save();

        console.log(`✅ Asset tokenized: ${asset.name} -> Token ID: ${tokenId}`);

        return {
          success: true,
          asset: asset,
          tokenId: tokenId,
          blockchainTxHash: blockchainResult.txHash,
          message: 'Asset tokenized successfully',
        };

      } catch (blockchainError) {
        console.error('Blockchain tokenization error:', blockchainError);
        asset.tokenizationStatus = 'Failed';
        await asset.save();
        throw new Error(`Blockchain tokenization failed: ${blockchainError.message}`);
      }

    } catch (error) {
      console.error('Asset tokenization error:', error);
      throw error;
    }
  }

  /**
   * Get asset details with tokenization status
   * @param {string} assetId - Asset ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} Asset details
   */
  async getAssetDetails(assetId, userId) {
    try {
      const asset = await Asset.findById(assetId)
        .populate('ownerId', 'fullName email phone');

      if (!asset) {
        throw new Error('Asset not found');
      }

      // Check if user owns the asset or is admin
      if (asset.ownerId._id.toString() !== userId) {
        throw new Error('Unauthorized: You do not own this asset');
      }

      return {
        success: true,
        asset: asset,
      };

    } catch (error) {
      console.error('Get asset details error:', error);
      throw error;
    }
  }

  /**
   * Get all assets for a user
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} User's assets
   */
  async getUserAssets(userId, filters = {}) {
    try {
      const { type, status, verified } = filters;

      let query = { ownerId: userId };

      if (type) query.type = type;
      if (status) query.status = status;
      if (verified !== undefined) query.verified = verified;

      const assets = await Asset.find(query)
        .sort({ createdAt: -1 });

      return {
        success: true,
        assets: assets,
        count: assets.length,
      };

    } catch (error) {
      console.error('Get user assets error:', error);
      throw error;
    }
  }

  /**
   * Verify an asset (admin/lender function)
   * @param {string} assetId - Asset ID
   * @param {string} verifierId - Verifier user ID
   * @returns {Promise<Object>} Verification result
   */
  async verifyAsset(assetId, verifierId) {
    try {
      const asset = await Asset.findById(assetId);
      if (!asset) {
        throw new Error('Asset not found');
      }

      // Check if verifier is authorized (in real app, check admin/lender role)
      const verifier = await User.findById(verifierId);
      if (!verifier) {
        throw new Error('Verifier not found');
      }

      // Update asset verification
      asset.verified = true;
      asset.verifiedBy = verifierId;
      asset.verifiedAt = new Date();

      await asset.save();

      console.log(`✅ Asset verified: ${asset.name} by ${verifier.fullName}`);

      return {
        success: true,
        asset: asset,
        message: 'Asset verified successfully',
      };

    } catch (error) {
      console.error('Asset verification error:', error);
      throw error;
    }
  }

  /**
   * Create asset-backed loan
   * @param {string} assetId - Asset ID to use as collateral
   * @param {Object} loanData - Loan details
   * @param {string} borrowerId - Borrower user ID
   * @returns {Promise<Object>} Loan creation result
   */
  async createAssetBackedLoan(assetId, loanData, borrowerId) {
    try {
      const asset = await Asset.findById(assetId);
      if (!asset) {
        throw new Error('Asset not found');
      }

      // Check if user owns the asset
      if (asset.ownerId.toString() !== borrowerId) {
        throw new Error('Unauthorized: You do not own this asset');
      }

      // Check if asset can be used as collateral
      if (!asset.canTokenize()) {
        throw new Error('Asset cannot be used as collateral');
      }

      const { totalAmount, duration, interestRate, purpose } = loanData;

      // Calculate maximum loan amount based on asset value (70% LTV)
      const maxLoanAmount = asset.getLoanEligibility(0.7);

      if (totalAmount > maxLoanAmount) {
        throw new Error(`Loan amount exceeds maximum allowed (${maxLoanAmount} based on asset value)`);
      }

      // Create loan with asset backing
      const Loan = require('../models/Loan');
      const loan = new Loan({
        borrowerId,
        totalAmount,
        duration,
        averageInterestRate: interestRate,
        purpose,
        isAssetBacked: true,
        collateralAssets: [{
          assetId: asset._id,
          collateralValue: asset.estimatedValue,
          loanToValueRatio: totalAmount / asset.estimatedValue,
        }],
        status: 'PENDING',
      });

      await loan.save();

      // Mark asset as collateralized
      asset.isCollateralized = true;
      asset.collateralValue = totalAmount;
      asset.loanToValueRatio = totalAmount / asset.estimatedValue;
      await asset.save();

      console.log(`✅ Asset-backed loan created: ₹${totalAmount} against ${asset.name}`);

      return {
        success: true,
        loan: loan,
        asset: asset,
        maxLoanAmount: maxLoanAmount,
        message: 'Asset-backed loan created successfully',
      };

    } catch (error) {
      console.error('Asset-backed loan creation error:', error);
      throw error;
    }
  }

  /**
   * Get asset statistics for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Asset statistics
   */
  async getAssetStatistics(userId) {
    try {
      const assets = await Asset.find({ ownerId: userId });

      const stats = {
        totalAssets: assets.length,
        totalValue: assets.reduce((sum, asset) => sum + asset.estimatedValue, 0),
        tokenizedAssets: assets.filter(asset => asset.tokenId).length,
        collateralizedAssets: assets.filter(asset => asset.isCollateralized).length,
        byType: {},
        byStatus: {},
      };

      // Group by type
      assets.forEach(asset => {
        stats.byType[asset.type] = (stats.byType[asset.type] || 0) + 1;
      });

      // Group by status
      assets.forEach(asset => {
        stats.byStatus[asset.status] = (stats.byStatus[asset.status] || 0) + 1;
      });

      return {
        success: true,
        statistics: stats,
      };

    } catch (error) {
      console.error('Get asset statistics error:', error);
      throw error;
    }
  }

  /**
   * Transfer asset ownership
   * @param {string} assetId - Asset ID
   * @param {string} newOwnerId - New owner user ID
   * @param {string} currentOwnerId - Current owner user ID
   * @returns {Promise<Object>} Transfer result
   */
  async transferAsset(assetId, newOwnerId, currentOwnerId) {
    try {
      const asset = await Asset.findById(assetId);
      if (!asset) {
        throw new Error('Asset not found');
      }

      // Check if user owns the asset
      if (asset.ownerId.toString() !== currentOwnerId) {
        throw new Error('Unauthorized: You do not own this asset');
      }

      // Check if new owner exists
      const newOwner = await User.findById(newOwnerId);
      if (!newOwner) {
        throw new Error('New owner not found');
      }

      // Update ownership
      asset.ownerId = newOwnerId;
      await asset.save();

      console.log(`✅ Asset transferred: ${asset.name} from ${currentOwnerId} to ${newOwnerId}`);

      return {
        success: true,
        asset: asset,
        message: 'Asset ownership transferred successfully',
      };

    } catch (error) {
      console.error('Asset transfer error:', error);
      throw error;
    }
  }

  /**
   * Get available assets for collateral
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Available assets
   */
  async getAvailableCollateralAssets(userId) {
    try {
      const assets = await Asset.find({
        ownerId: userId,
        status: 'Active',
        verified: true,
        isCollateralized: false,
      }).sort({ estimatedValue: -1 });

      return {
        success: true,
        assets: assets,
        count: assets.length,
      };

    } catch (error) {
      console.error('Get available collateral assets error:', error);
      throw error;
    }
  }
}

// Export singleton instance
const assetTokenizationService = new AssetTokenizationService();

module.exports = {
  AssetTokenizationService,
  assetTokenizationService,
  registerAsset: (assetData, ownerId) => assetTokenizationService.registerAsset(assetData, ownerId),
  tokenizeAsset: (assetId, userId) => assetTokenizationService.tokenizeAsset(assetId, userId),
  getAssetDetails: (assetId, userId) => assetTokenizationService.getAssetDetails(assetId, userId),
  getUserAssets: (userId, filters) => assetTokenizationService.getUserAssets(userId, filters),
  verifyAsset: (assetId, verifierId) => assetTokenizationService.verifyAsset(assetId, verifierId),
  createAssetBackedLoan: (assetId, loanData, borrowerId) => assetTokenizationService.createAssetBackedLoan(assetId, loanData, borrowerId),
  getAssetStatistics: (userId) => assetTokenizationService.getAssetStatistics(userId),
  transferAsset: (assetId, newOwnerId, currentOwnerId) => assetTokenizationService.transferAsset(assetId, newOwnerId, currentOwnerId),
  getAvailableCollateralAssets: (userId) => assetTokenizationService.getAvailableCollateralAssets(userId),
};
