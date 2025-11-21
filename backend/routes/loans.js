const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Loan = require('../models/Loan');
const User = require('../models/User');
const axios = require('axios');
const blockchainService = require('../services/blockchainService');
const { enhancedMatching, Borrower, Lender } = require('../utils/matching');
const { LoanFSM } = require('../utils/loanFSM');

const payuKey = process.env.PAYU_KEY;
const payuSalt = process.env.PAYU_SALT;
const payuMerchantId = process.env.PAYU_MERCHANT_ID;

// Create loan (Borrower-only)
router.post('/create', authenticateToken, async (req, res) => {
  const { amount, duration, interestRate, purpose } = req.body;
  const userId = req.user.id;

  if (!amount || !duration || !interestRate || !purpose) {
    return res.status(400).json({ success: false, error: 'All fields are required' });
  }

  const user = await User.findById(userId);
  if (!user || user.role !== 'Borrower') {
    return res.status(403).json({ success: false, error: 'Only borrowers can create loans' });
  }

  if (!user.kycVerified || !user.aadharHash) {
    return res.status(400).json({ success: false, error: 'User must be KYC verified to create loans' });
  }

  const newLoan = new Loan({
    borrowerId: userId,
    amount,
    duration,
    interestRate,
    purpose,
  });

  await newLoan.save();

  // Blockchain integration
  let blockchainResult;
  try {
    const dueDate = Math.floor(Date.now() / 1000) + (duration * 30 * 24 * 60 * 60); // duration in months
    const borrowerAddress = user.walletAddress || '0x0000000000000000000000000000000000000000';
    const lenderAddress = '0x0000000000000000000000000000000000000000'; // To be updated when funded

    blockchainResult = await blockchainService.createLoan({
      borrowerAddress,
      lenderAddress,
      amount: blockchainService.web3.utils.toWei(amount.toString(), 'ether'),
      dueDate,
      docHash: user.aadharHash
    });

    console.log('✅ Loan created on blockchain:', blockchainResult.txHash);
  } catch (blockchainError) {
    console.error('❌ Blockchain loan creation failed:', blockchainError.message);
    // Don't fail the entire process, but log it
    blockchainResult = { success: false, error: blockchainError.message };
  }

  res.json({
    success: true,
    data: newLoan,
    blockchain: {
      verified: blockchainResult.success,
      txHash: blockchainResult.txHash,
      contractAddress: blockchainResult.contractAddress,
      network: blockchainResult.network
    }
  });
});

// Get all loans (Role-based filtering)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, borrowerId } = req.query;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    let query = {};

    // Role-based data filtering
    if (user.role === 'Borrower') {
      // Borrowers can only see their own loans
      query.borrowerId = user._id;
    } else if (user.role === 'Lender') {
      // Lenders can only see loans they're involved in (as lender or matched lender)
      query.$or = [
        { lenderId: user._id }, // Single lender loans
        { 'lenders.lenderId': user._id } // Multi-lender loans
      ];
    }
    // Admin role could see all loans if implemented

    // Additional filters
    if (status) query.status = status;
    if (borrowerId && user.role !== 'Borrower') {
      // Only non-borrowers can filter by borrowerId
      query.borrowerId = borrowerId;
    }

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
router.get('/:id', async (req, res) => {
  const loan = await Loan.findById(req.params.id).populate('borrowerId', 'fullName email');
  if (!loan) {
    return res.status(404).json({ success: false, error: 'Loan not found' });
  }

  res.json({
    success: true,
    data: loan,
  });
});

// Get loans by borrower ID
router.get('/borrower/:borrowerId', async (req, res) => {
  const borrowerLoans = await Loan.find({ borrowerId: req.params.borrowerId }).populate('borrowerId', 'fullName email');
  res.json({
    success: true,
    data: borrowerLoans,
  });
});

// Disburse loan (PayU payment) - Lender only
router.post('/:id/disburse', authenticateToken, async (req, res) => {
  const loan = await Loan.findById(req.params.id);
  const user = await User.findById(req.user.id);

  if (!user || user.role !== 'Lender') {
    return res.status(403).json({ success: false, error: 'Only lenders can disburse loans' });
  }
  if (!loan || loan.status !== 'Pending') {
    return res.status(400).json({ success: false, error: 'Invalid loan' });
  }

  const hash = require('crypto').createHash('sha512').update(`${payuKey}|${loan._id}|${loan.amount}|Loan Disbursement|Borrower|borrower@example.com|||||||||||${payuSalt}`).digest('hex');

  const response = await axios.post('https://test.payu.in/_payment', {
    key: payuKey,
    txnid: loan._id,
    amount: loan.amount,
    productinfo: 'Loan Disbursement',
    firstname: 'Borrower',
    email: 'borrower@example.com',
    phone: '9999999999',
    hash,
    surl: 'http://localhost:8080/success',
    furl: 'http://localhost:8080/failure',
  });

  loan.paymentStatus = 'Disbursed';
  loan.status = 'Active';
  await loan.save();

  res.json({ success: true, paymentUrl: response.data });
});

// Repay loan (PayU payment) - Borrower only
router.post('/:id/repay-payment', authenticateToken, async (req, res) => {
  const { amount } = req.body;
  const loan = await Loan.findById(req.params.id);
  const user = await User.findById(req.user.id);

  if (!user || user.role !== 'Borrower') {
    return res.status(403).json({ success: false, error: 'Only borrowers can make repayment payments' });
  }
  if (!loan || loan.status !== 'Active') {
    return res.status(400).json({ success: false, error: 'Loan not active' });
  }

  const hash = require('crypto').createHash('sha512').update(`${payuKey}|${loan._id}_repay|${amount}|Loan Repayment|Borrower|borrower@example.com|||||||||||${payuSalt}`).digest('hex');

  const response = await axios.post('https://test.payu.in/_payment', {
    key: payuKey,
    txnid: `${loan._id}_repay`,
    amount,
    productinfo: 'Loan Repayment',
    firstname: 'Borrower',
    email: 'borrower@example.com',
    phone: '9999999999',
    hash,
    surl: 'http://localhost:8080/success',
    furl: 'http://localhost:8080/failure',
  });

  loan.repaidAmount += amount;
  const totalOwed = loan.amount + (loan.amount * loan.interestRate / 100);
  if (loan.repaidAmount >= totalOwed) {
    loan.status = 'Completed';
    loan.paymentStatus = 'Repaid';
  }

  await loan.save();
  res.json({ success: true, paymentUrl: response.data });
});

// Repay loan (Borrower-only)
router.post('/:id/repay', authenticateToken, async (req, res) => {
  const { amount } = req.body;
  const loan = await Loan.findById(req.params.id);
  const user = await User.findById(req.user.id);

  if (!loan) {
    return res.status(404).json({ success: false, error: 'Loan not found' });
  }
  if (!user || user.role !== 'Borrower') {
    return res.status(403).json({ success: false, error: 'Only borrowers can repay loans' });
  }

  loan.repaidAmount += amount;

  const totalOwed = loan.amount + (loan.amount * loan.interestRate / 100);
  if (loan.repaidAmount >= totalOwed) {
    loan.status = 'Completed';
  }

  await loan.save();
  res.json({
    success: true,
    data: loan,
  });
});

// Fund loan (Lender-only, minimal stub)
router.post('/:id/fund', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'Lender') {
      return res.status(403).json({ success: false, error: 'Only lenders can fund loans' });
    }

    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({ success: false, error: 'Loan not found' });
    }
    if (loan.status !== 'Pending') {
      return res.status(400).json({ success: false, error: 'Loan must be Pending to fund' });
    }

    loan.lenderId = user._id; // record lender association
    await loan.save();

    return res.json({
      success: true,
      message: 'Funding recorded. Awaiting payment integration.',
      data: loan,
    });
  } catch (e) {
    console.error('Fund loan error:', e);
    return res.status(500).json({ success: false, error: 'Failed to record funding' });
  }
});

module.exports = router;
