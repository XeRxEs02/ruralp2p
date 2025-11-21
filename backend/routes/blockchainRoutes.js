const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const blockchainService = require('../services/blockchainService');

// Get blockchain network info
router.get('/network-info', (req, res) => {
  try {
    const networkInfo = blockchainService.getNetworkInfo();
    res.json({
      success: true,
      data: networkInfo,
    });
  } catch (error) {
    console.error('Get network info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get network info'
    });
  }
});

// Get loan counter from blockchain
router.get('/loan-counter', async (req, res) => {
  try {
    const counter = await blockchainService.getLoanCounter();
    res.json({
      success: true,
      data: { counter },
    });
  } catch (error) {
    console.error('Get loan counter error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get loan counter'
    });
  }
});

// Get loan details from blockchain
router.get('/loan/:loanId', async (req, res) => {
  try {
    const loanDetails = await blockchainService.getLoanDetails(req.params.loanId);
    res.json({
      success: true,
      data: loanDetails,
    });
  } catch (error) {
    console.error('Get loan details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get loan details'
    });
  }
});

// Check document verification status on blockchain
router.get('/document-check/:hash', async (req, res) => {
  try {
    const isVerified = await blockchainService.checkDocumentHash(req.params.hash);
    res.json({
      success: true,
      data: { verified: isVerified },
    });
  } catch (error) {
    console.error('Check document error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check document'
    });
  }
});

// Verify document on blockchain (admin/lender only)
router.post('/verify-document', authenticateToken, async (req, res) => {
  try {
    const { documentHash } = req.body;

    if (!documentHash) {
      return res.status(400).json({
        success: false,
        error: 'Document hash required'
      });
    }

    const result = await blockchainService.verifyDocumentHash(documentHash);
    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    console.error('Verify document error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify document on blockchain'
    });
  }
});

// Get transaction receipt
router.get('/transaction/:txHash', async (req, res) => {
  try {
    const receipt = await blockchainService.getTransactionReceipt(req.params.txHash);
    res.json({
      success: true,
      data: receipt,
    });
  } catch (error) {
    console.error('Get transaction receipt error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get transaction receipt'
    });
  }
});

// Get current gas price
router.get('/gas-price', async (req, res) => {
  try {
    const gasPrice = await blockchainService.getGasPrice();
    res.json({
      success: true,
      data: { gasPrice },
    });
  } catch (error) {
    console.error('Get gas price error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get gas price'
    });
  }
});

module.exports = router;
