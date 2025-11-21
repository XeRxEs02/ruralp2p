const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  registerAsset,
  tokenizeAsset,
  getAssetDetails,
  getUserAssets,
  verifyAsset,
  createAssetBackedLoan,
  getAssetStatistics,
  transferAsset,
  getAvailableCollateralAssets,
} = require('../services/assetTokenizationService');

// Register a new asset
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const assetData = req.body;
    const userId = req.user.id;

    const result = await registerAsset(assetData, userId);
    res.status(201).json(result);
  } catch (error) {
    console.error('Register asset error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to register asset'
    });
  }
});

// Tokenize an asset
router.post('/:assetId/tokenize', authenticateToken, async (req, res) => {
  try {
    const { assetId } = req.params;
    const userId = req.user.id;

    const result = await tokenizeAsset(assetId, userId);
    res.json(result);
  } catch (error) {
    console.error('Tokenize asset error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to tokenize asset'
    });
  }
});

// Get asset details
router.get('/:assetId', authenticateToken, async (req, res) => {
  try {
    const { assetId } = req.params;
    const userId = req.user.id;

    const result = await getAssetDetails(assetId, userId);
    res.json(result);
  } catch (error) {
    console.error('Get asset details error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get asset details'
    });
  }
});

// Get user's assets
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const filters = req.query;

    const result = await getUserAssets(userId, filters);
    res.json(result);
  } catch (error) {
    console.error('Get user assets error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get user assets'
    });
  }
});

// Get asset statistics
router.get('/user/statistics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await getAssetStatistics(userId);
    res.json(result);
  } catch (error) {
    console.error('Get asset statistics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get asset statistics'
    });
  }
});

// Get available collateral assets
router.get('/collateral/available', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await getAvailableCollateralAssets(userId);
    res.json(result);
  } catch (error) {
    console.error('Get available collateral assets error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get available collateral assets'
    });
  }
});

// Create asset-backed loan
router.post('/:assetId/loan', authenticateToken, async (req, res) => {
  try {
    const { assetId } = req.params;
    const loanData = req.body;
    const borrowerId = req.user.id;

    const result = await createAssetBackedLoan(assetId, loanData, borrowerId);
    res.status(201).json(result);
  } catch (error) {
    console.error('Create asset-backed loan error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create asset-backed loan'
    });
  }
});

// Transfer asset ownership (admin/lender only)
router.post('/:assetId/transfer', authenticateToken, async (req, res) => {
  try {
    const { assetId } = req.params;
    const { newOwnerId } = req.body;
    const currentOwnerId = req.user.id;

    const result = await transferAsset(assetId, newOwnerId, currentOwnerId);
    res.json(result);
  } catch (error) {
    console.error('Transfer asset error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to transfer asset'
    });
  }
});

// Verify asset (admin/lender only)
router.post('/:assetId/verify', authenticateToken, async (req, res) => {
  try {
    const { assetId } = req.params;
    const verifierId = req.user.id;

    const result = await verifyAsset(assetId, verifierId);
    res.json(result);
  } catch (error) {
    console.error('Verify asset error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify asset'
    });
  }
});

module.exports = router;
