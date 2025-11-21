const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const loanController = require('../controllers/loanController');
const { repaymentFSMService } = require('../services/repaymentFSM');
const Loan = require('../models/Loan');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Create loan (Borrower-only)
router.post('/create', authenticateToken, loanController.createLoan);

// Get all loans (Admin only or filtered by user role)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    let query = {};

    if (user.role === 'Borrower') {
      // Borrowers see only their own loans
      query.borrowerId = req.user.id;
    } else if (user.role === 'Lender') {
      // Lenders see loans they're involved in
      query['lenders.lenderId'] = req.user.id;
    }
    // Admin can see all loans (no filter)

    const loans = await Loan.find(query)
      .populate('borrowerId', 'fullName email phone')
      .populate('lenders.lenderId', 'fullName email phone')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: loans,
    });

  } catch (error) {
    console.error('Get loans error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get loans'
    });
  }
});

// Get loan by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id)
      .populate('borrowerId', 'fullName email phone walletAddress')
      .populate('lenders.lenderId', 'fullName email phone walletAddress');

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan not found'
      });
    }

    // Check if user has access to this loan
    const user = await User.findById(req.user.id);
    const isOwner = loan.borrowerId.toString() === req.user.id;
    const isLender = loan.lenders.some(l => l.lenderId.toString() === req.user.id);
    const isAdmin = user.role === 'Admin';

    if (!isOwner && !isLender && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: loan,
    });

  } catch (error) {
    console.error('Get loan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get loan'
    });
  }
});

// Get loans by borrower ID (only borrower themselves or admin)
router.get('/borrower/:borrowerId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const isOwner = req.params.borrowerId === req.user.id;
    const isAdmin = user.role === 'Admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const borrowerLoans = await Loan.find({ borrowerId: req.params.borrowerId })
      .populate('borrowerId', 'fullName email phone')
      .populate('lenders.lenderId', 'fullName email phone')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: borrowerLoans,
    });

  } catch (error) {
    console.error('Get borrower loans error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get borrower loans'
    });
  }
});

// Get loans by lender ID (only lender themselves or admin)
router.get('/lender/:lenderId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const isOwner = req.params.lenderId === req.user.id;
    const isAdmin = user.role === 'Admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const lenderLoans = await Loan.find({ 'lenders.lenderId': req.params.lenderId })
      .populate('borrowerId', 'fullName email phone')
      .populate('lenders.lenderId', 'fullName email phone')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: lenderLoans,
    });

  } catch (error) {
    console.error('Get lender loans error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get lender loans'
    });
  }
});

// Get loan matching status
router.get('/:id/matching', authenticateToken, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan not found'
      });
    }

    // Check if user owns the loan or is a matched lender
    const isOwner = loan.borrowerId.toString() === req.user.id;
    const isLender = loan.lenders.some(l => l.lenderId.toString() === req.user.id);

    if (!isOwner && !isLender) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: {
        loanId: loan._id,
        status: loan.status,
        lenders: loan.lenders,
        matchingScore: loan.matchingScore,
        matchedAt: loan.matchedAt,
        totalAmount: loan.totalAmount,
        averageInterestRate: loan.averageInterestRate,
      },
    });

  } catch (error) {
    console.error('Get matching status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get matching status'
    });
  }
});

// Confirm loan funding (Lender action)
router.post('/:id/confirm-funding', authenticateToken, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    const user = await User.findById(req.user.id);

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan not found'
      });
    }

    if (!user || user.role !== 'Lender') {
      return res.status(403).json({
        success: false,
        error: 'Only lenders can confirm funding'
      });
    }

    // Find the lender in the loan
    const lenderIndex = loan.lenders.findIndex(l => l.lenderId.toString() === user._id.toString());
    if (lenderIndex === -1) {
      return res.status(403).json({
        success: false,
        error: 'You are not matched to this loan'
      });
    }

    // Update lender status
    loan.lenders[lenderIndex].status = 'Active';
    loan.lenders[lenderIndex].disbursedAt = new Date();

    // Check if all lenders have confirmed
    const allConfirmed = loan.lenders.every(l => l.status === 'Active');

    if (allConfirmed) {
      // Transition loan to ACTIVE state
      await repaymentFSMService.transitionLoan(
        loan._id,
        'ACTIVE',
        'All lenders confirmed funding',
        { disbursedAmount: loan.totalAmount }
      );
    }

    await loan.save();

    // Create notifications
    await Notification.create({
      recipientId: loan.borrowerId,
      senderId: user._id,
      type: 'LoanDisbursed',
      title: 'Loan Partially Funded',
      message: `${user.fullName} has confirmed funding of ₹${loan.lenders[lenderIndex].amount}.`,
      relatedLoanId: loan._id,
      priority: 'High',
      channels: {
        email: true,
        sms: true,
        push: true,
        inApp: true,
      },
    });

    res.json({
      success: true,
      message: 'Funding confirmed successfully',
      data: {
        loan,
        allConfirmed,
        remainingLenders: loan.lenders.filter(l => l.status === 'Pending').length,
      },
    });

  } catch (error) {
    console.error('Confirm funding error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to confirm funding'
    });
  }
});

// Enhanced repayment with FSM
router.post('/:id/repay', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const loanId = req.params.id;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid payment amount required'
      });
    }

    // Process repayment through FSM
    const result = await repaymentFSMService.processRepayment(loanId, amount, userId);

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: result,
    });

  } catch (error) {
    console.error('Repay loan error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process payment'
    });
  }
});

// Get loan FSM status
router.get('/:id/fsm-status', authenticateToken, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan not found'
      });
    }

    // Check if user owns the loan or is a lender
    const isOwner = loan.borrowerId.toString() === req.user.id;
    const isLender = loan.lenders.some(l => l.lenderId.toString() === req.user.id);

    if (!isOwner && !isLender) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const fsmStatus = await repaymentFSMService.getLoanStatus(loan._id);

    res.json({
      success: true,
      data: fsmStatus,
    });

  } catch (error) {
    console.error('Get FSM status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get loan status'
    });
  }
});

// Get loans by state (FSM)
router.get('/state/:state', async (req, res) => {
  try {
    const state = req.params.state.toUpperCase();
    const loans = await repaymentFSMService.getLoansByState(state);

    res.json({
      success: true,
      data: loans,
    });

  } catch (error) {
    console.error('Get loans by state error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get loans by state'
    });
  }
});

module.exports = router;
