const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  createSeasonalRepayment,
  processSeasonalPayment,
  deferSeasonalPayment,
  getSeasonalRepaymentStatus,
  checkUpcomingSeasonalPayments,
  generateSeasonalSchedule,
  getSeasonalAnalytics,
} = require('../services/seasonalRepaymentService');

// Create seasonal repayment schedule
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { loanId, seasonalData } = req.body;
    const createdBy = req.user.id;

    const result = await createSeasonalRepayment(loanId, seasonalData, createdBy);
    res.status(201).json(result);
  } catch (error) {
    console.error('Create seasonal repayment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create seasonal repayment schedule'
    });
  }
});

// Process seasonal payment
router.post('/payment', authenticateToken, async (req, res) => {
  try {
    const { loanId, installmentNumber, amount } = req.body;
    const payerId = req.user.id;

    const result = await processSeasonalPayment(loanId, installmentNumber, amount, payerId);
    res.json(result);
  } catch (error) {
    console.error('Process seasonal payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process seasonal payment'
    });
  }
});

// Defer seasonal payment
router.post('/defer', authenticateToken, async (req, res) => {
  try {
    const { loanId, installmentNumber, newDueDate, reason } = req.body;
    const userId = req.user.id;

    const result = await deferSeasonalPayment(loanId, installmentNumber, newDueDate, reason, userId);
    res.json(result);
  } catch (error) {
    console.error('Defer seasonal payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to defer seasonal payment'
    });
  }
});

// Get seasonal repayment status
router.get('/status/:loanId', authenticateToken, async (req, res) => {
  try {
    const { loanId } = req.params;

    const result = await getSeasonalRepaymentStatus(loanId);
    res.json(result);
  } catch (error) {
    console.error('Get seasonal repayment status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get seasonal repayment status'
    });
  }
});

// Check upcoming seasonal payments
router.get('/upcoming/:daysAhead', authenticateToken, async (req, res) => {
  try {
    const { daysAhead } = req.params;

    const result = await checkUpcomingSeasonalPayments(parseInt(daysAhead));
    res.json(result);
  } catch (error) {
    console.error('Check upcoming seasonal payments error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check upcoming seasonal payments'
    });
  }
});

// Generate seasonal schedule
router.post('/generate-schedule', authenticateToken, async (req, res) => {
  try {
    const { totalAmount, durationMonths, seasonType, harvestDate } = req.body;

    const schedule = generateSeasonalSchedule(totalAmount, durationMonths, seasonType, new Date(harvestDate));
    res.json({
      success: true,
      schedule: schedule,
      totalAmount: totalAmount,
      durationMonths: durationMonths,
      seasonType: seasonType,
    });
  } catch (error) {
    console.error('Generate seasonal schedule error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate seasonal schedule'
    });
  }
});

// Get seasonal analytics
router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;

    const result = await getSeasonalAnalytics(userId);
    res.json(result);
  } catch (error) {
    console.error('Get seasonal analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get seasonal analytics'
    });
  }
});

module.exports = router;
