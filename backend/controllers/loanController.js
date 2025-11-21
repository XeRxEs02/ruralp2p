const Loan = require('../models/Loan');
const User = require('../models/User');
const Notification = require('../models/Notification');
const blockchainService = require('../services/blockchainService');
const smsService = require('../services/smsService');
const pushService = require('../services/pushService');
const { enhancedMatching, generateSampleData, Borrower, Lender } = require('../algorithms/galeShapleyMatch');
const { repaymentFSMService } = require('../services/repaymentFSM');

// Create a new loan request with enhanced matching
const createLoan = async (req, res) => {
  try {
    const { totalAmount, duration, averageInterestRate, purpose } = req.body;
    const userId = req.user.id;

    // Validation
    if (!totalAmount || !duration || !averageInterestRate || !purpose) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // Check if user is a borrower
    const user = await User.findById(userId);
    if (!user || user.role !== 'Borrower') {
      return res.status(403).json({
        success: false,
        error: 'Only borrowers can create loans'
      });
    }

    // Check if user is KYC verified
    if (!user.kycVerified || !user.aadharHash) {
      return res.status(400).json({
        success: false,
        error: 'User must be KYC verified to create loans'
      });
    }

    // Create loan with initial structure
    const newLoan = new Loan({
      borrowerId: userId,
      totalAmount,
      duration,
      averageInterestRate,
      purpose,
      status: 'PENDING',
      stateHistory: [{
        state: 'PENDING',
        timestamp: new Date(),
        reason: 'Loan request created',
      }],
    });

    await newLoan.save();

    // Run enhanced matching algorithm
    let matchingResult;
    try {
      // Get all available lenders
      const availableLenders = await User.find({ role: 'Lender' }).select('_id fullName walletAddress');
      const activeLoans = await Loan.find({ status: { $in: ['PENDING', 'ACTIVE'] } });

      // Create borrower and lender objects for matching
      const borrower = new Borrower(
        user._id.toString(),
        user.fullName,
        totalAmount,
        averageInterestRate,
        0.3 // Default risk score, can be calculated based on user data
      );

      const lenders = availableLenders.map(lender => new Lender(
        lender._id.toString(),
        lender.fullName,
        100000, // Default available amount, should be calculated from user profile
        averageInterestRate + 2, // Default preferred rate
        0.5 // Default risk tolerance
      ));

      // Run enhanced matching
      matchingResult = enhancedMatching([borrower], lenders);

      if (matchingResult.matchedPairs.length > 0) {
        const match = matchingResult.matchedPairs[0];

        // Update loan with matched lenders
        newLoan.lenders = match.lenders.map(lender => ({
          lenderId: lender.lenderId,
          amount: lender.amount,
          interestRate: lender.interestRate,
          status: 'Pending',
        }));

        newLoan.averageInterestRate = match.averageInterestRate;
        newLoan.matchingScore = match.overallCompatibility;
        newLoan.matchedAt = new Date();
        newLoan.status = 'PENDING'; // Still pending until lenders confirm

        await newLoan.save();

        console.log(`✅ Loan matched with ${match.lenders.length} lenders`);
      }

    } catch (matchingError) {
      console.error('❌ Loan matching failed:', matchingError.message);
      matchingResult = { success: false, error: matchingError.message };
    }

    // Blockchain integration for split loans
    let blockchainResults = [];
    let blockchainSuccess = false;
    try {
      const dueDate = Math.floor(Date.now() / 1000) + (duration * 30 * 24 * 60 * 60);
      const borrowerAddress = user.walletAddress || '0x0000000000000000000000000000000000000000';

      if (matchingResult.matchedPairs.length > 0 && newLoan.lenders.length > 0) {
        // Create blockchain loan for each lender portion
        for (let i = 0; i < newLoan.lenders.length; i++) {
          const lender = newLoan.lenders[i];
          const lenderUser = await User.findById(lender.lenderId);
          const lenderAddress = lenderUser?.walletAddress || '0x0000000000000000000000000000000000000000';

          console.log(`🔗 Creating blockchain loan for lender ${lenderUser?.fullName} - ₹${lender.amount}`);

          const blockchainResult = await blockchainService.createLoan({
            borrowerAddress,
            lenderAddress,
            amount: blockchainService.web3.utils.toWei(lender.amount.toString(), 'ether'),
            dueDate,
            docHash: user.aadharHash,
            purpose: newLoan.purpose,
            interestRate: Math.floor(lender.interestRate * 100) // Convert to basis points
          });

          // Update lender with blockchain info
          newLoan.lenders[i].blockchainTxHash = blockchainResult.txHash;
          newLoan.lenders[i].loanIdOnChain = blockchainResult.loanId;

          blockchainResults.push({
            lenderId: lender.lenderId,
            amount: lender.amount,
            ...blockchainResult
          });

          console.log(`✅ Blockchain loan created for lender portion: ${blockchainResult.txHash}`);
        }

        // Update main loan with first blockchain info for reference
        newLoan.blockchainTxHash = blockchainResults[0].txHash;
        newLoan.loanIdOnChain = blockchainResults[0].loanId;
        newLoan.documentHash = user.aadharHash;
        await newLoan.save();
        blockchainSuccess = true;

        console.log(`✅ All ${blockchainResults.length} blockchain loans created for split loan`);
      } else {
        // Single loan fallback (though matching should handle split)
        const lenderAddress = '0x0000000000000000000000000000000000000000';
        const blockchainResult = await blockchainService.createLoan({
          borrowerAddress,
          lenderAddress,
          amount: blockchainService.web3.utils.toWei(totalAmount.toString(), 'ether'),
          dueDate,
          docHash: user.aadharHash,
          purpose: newLoan.purpose,
          interestRate: Math.floor(averageInterestRate * 100)
        });

        newLoan.blockchainTxHash = blockchainResult.txHash;
        newLoan.loanIdOnChain = blockchainResult.loanId;
        newLoan.documentHash = user.aadharHash;
        await newLoan.save();
        blockchainSuccess = true;

        blockchainResults = [blockchainResult];
        console.log('✅ Single loan created on blockchain:', blockchainResult.txHash);
      }
    } catch (blockchainError) {
      console.error('❌ Blockchain loan creation failed:', blockchainError.message);
      blockchainResults = [{ success: false, error: blockchainError.message }];
      blockchainSuccess = false;
      // Continue without blockchain - loan can still be processed off-chain
    }

    // Create and send notifications
    try {
      const notificationController = require('./notificationController');
      const mockReq = {
        body: {
          userId,
          type: 'LoanRequest',
          title: 'Loan Request Submitted',
          message: `Your loan request for ₹${totalAmount} has been submitted and is being matched with lenders.`,
          channels: {
            email: true,
            sms: false,
            push: true,
            inApp: true,
          },
          priority: 'Medium',
          metadata: {
            relatedLoanId: newLoan._id,
            source: 'loan_creation'
          }
        },
        user: { id: userId }
      };
      const mockRes = {
        status: () => ({ json: () => {} }),
        json: () => {}
      };

      await notificationController.sendNotification(mockReq, mockRes);
    } catch (notificationError) {
      console.error('Notification sending failed:', notificationError.message);
      // Continue with loan creation even if notification fails
    }

    // Notify matched lenders
    if (matchingResult.matchedPairs.length > 0) {
      for (const lender of newLoan.lenders) {
        try {
          const lenderNotificationReq = {
            body: {
              userId: lender.lenderId,
              type: 'LoanRequest',
              title: 'Loan Funding Opportunity',
              message: `You have been matched to fund a loan of ₹${lender.amount}. Please review and confirm.`,
              channels: {
                email: true,
                sms: true,
                push: true,
                inApp: true,
              },
              priority: 'High',
              metadata: {
                relatedLoanId: newLoan._id,
                source: 'loan_matching'
              }
            },
            user: { id: lender.lenderId }
          };
          const lenderNotificationRes = {
            status: () => ({ json: () => {} }),
            json: () => {}
          };
          await notificationController.sendNotification(lenderNotificationReq, lenderNotificationRes);
        } catch (notificationError) {
          console.error('Lender notification failed:', notificationError.message);
        }
      }
    }

    res.status(201).json({
      success: true,
      data: newLoan,
      matching: {
        matched: matchingResult.matchedPairs.length > 0,
        lenders: newLoan.lenders.length,
        compatibilityScore: newLoan.matchingScore,
      },
      blockchain: {
        success: blockchainSuccess,
        results: blockchainResults,
        message: blockchainSuccess ? 'Blockchain loans created successfully' : 'Loans created without blockchain integration'
      }
    });

  } catch (error) {
    console.error('Create loan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create loan'
    });
  }
};

// Get all loans
const getAllLoans = async (req, res) => {
  try {
    const { status, borrowerId } = req.query;
    let query = {};

    if (status) query.status = status;
    if (borrowerId) query.borrowerId = borrowerId;

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
};

// Get loan by ID
const getLoanById = async (req, res) => {
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
};

// Get loans by borrower
const getLoansByBorrower = async (req, res) => {
  try {
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
};

// Fund a loan (Lender action) - supports split loans
const fundLoan = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'Lender') {
      return res.status(403).json({
        success: false,
        error: 'Only lenders can fund loans'
      });
    }

    const loan = await Loan.findById(req.params.id);
    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan not found'
      });
    }

    // Find the lender's portion in the split loan
    const lenderIndex = loan.lenders.findIndex(l => l.lenderId.toString() === user._id.toString());
    if (lenderIndex === -1) {
      return res.status(403).json({
        success: false,
        error: 'You are not assigned to fund this loan'
      });
    }

    const lenderPortion = loan.lenders[lenderIndex];
    if (lenderPortion.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        error: 'Your portion has already been funded'
      });
    }

    // Blockchain approval/funding
    let blockchainResult;
    try {
      console.log(`🔗 Approving blockchain loan for lender ${user.fullName} - loanId: ${lenderPortion.loanIdOnChain}`);

      blockchainResult = await blockchainService.approveLoan(
        lenderPortion.loanIdOnChain,
        user.walletAddress || '0x0000000000000000000000000000000000000000'
      );

      console.log(`✅ Blockchain loan approved: ${blockchainResult.txHash}`);
    } catch (blockchainError) {
      console.error('❌ Blockchain loan approval failed:', blockchainError.message);
      return res.status(500).json({
        success: false,
        error: 'Blockchain funding failed: ' + blockchainError.message
      });
    }

    // Update lender portion status
    loan.lenders[lenderIndex].status = 'Active';
    loan.lenders[lenderIndex].disbursedAt = new Date();
    loan.lenders[lenderIndex].blockchainTxHash = blockchainResult.txHash;

    // Check if all lenders have funded
    const allFunded = loan.lenders.every(l => l.status === 'Active');
    if (allFunded) {
      loan.status = 'ACTIVE';
      loan.disbursedAt = new Date();
      loan.stateHistory.push({
        state: 'ACTIVE',
        timestamp: new Date(),
        reason: 'All lenders have funded the loan',
      });
    }

    await loan.save();

    // Create and send notifications
    try {
      const notificationController = require('./notificationController');
      const lenderNotificationReq = {
        body: {
          userId: user._id,
          type: 'LoanDisbursed',
          title: 'Loan Portion Funded',
          message: `You have successfully funded ₹${lenderPortion.amount} of the loan.`,
          channels: {
            email: true,
            sms: false,
            push: true,
            inApp: true,
          },
          priority: 'Medium',
          metadata: {
            relatedLoanId: loan._id,
            source: 'loan_funding'
          }
        },
        user: { id: user._id }
      };
      const lenderNotificationRes = {
        status: () => ({ json: () => {} }),
        json: () => {}
      };
      await notificationController.sendNotification(lenderNotificationReq, lenderNotificationRes);
    } catch (notificationError) {
      console.error('Lender funding notification failed:', notificationError.message);
    }

    // If all funded, notify borrower
    if (allFunded) {
      try {
        const borrower = await User.findById(loan.borrowerId);
        const notificationController = require('./notificationController');

        const borrowerNotificationReq = {
          body: {
            userId: loan.borrowerId,
            type: 'LoanApproved',
            title: 'Loan Fully Approved & Funded',
            message: `Your loan request for ₹${loan.totalAmount} has been fully approved and funded by ${loan.lenders.length} lenders.`,
            channels: {
              email: true,
              sms: true,
              push: true,
              inApp: true,
            },
            priority: 'High',
            metadata: {
              relatedLoanId: loan._id,
              source: 'loan_fully_funded'
            }
          },
          user: { id: loan.borrowerId }
        };
        const borrowerNotificationRes = {
          status: () => ({ json: () => {} }),
          json: () => {}
        };
        await notificationController.sendNotification(borrowerNotificationReq, borrowerNotificationRes);
      } catch (notificationError) {
        console.error('Borrower funding notification failed:', notificationError.message);
      }
    }

    // Send push notification for loan funded (to lender)
    if (user.firebaseToken) {
      await pushService.sendPushNotification(
        user.firebaseToken,
        'Loan Portion Funded',
        `You have successfully funded ₹${lenderPortion.amount} of the loan`
      );
    }

    res.json({
      success: true,
      message: allFunded ? 'Loan fully funded successfully' : 'Loan portion funded successfully',
      data: loan,
      blockchain: blockchainResult,
      allFunded: allFunded,
    });

  } catch (error) {
    console.error('Fund loan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fund loan'
    });
  }
};

// Repay loan - supports split loans
const repayLoan = async (req, res) => {
  try {
    const { amount } = req.body;
    const loan = await Loan.findById(req.params.id);
    const user = await User.findById(req.user.id);

    if (!loan) {
      return res.status(404).json({
        success: false,
        error: 'Loan not found'
      });
    }

    if (!user || user.role !== 'Borrower' || loan.borrowerId.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Only the borrower can repay this loan'
      });
    }

    // Update repayment
    loan.totalRepaidAmount += amount;
    const totalOwed = loan.totalAmount + (loan.totalAmount * loan.averageInterestRate / 100);

    // Blockchain repayment
    let blockchainResults = [];
    try {
      if (loan.lenders && loan.lenders.length > 0) {
        // For split loans, mark repaid on each blockchain loan
        for (const lenderPortion of loan.lenders) {
          if (lenderPortion.loanIdOnChain && lenderPortion.status === 'Active') {
            console.log(`🔗 Marking repayment on blockchain for loan portion: ${lenderPortion.loanIdOnChain}`);

            const blockchainResult = await blockchainService.markRepaid(
              lenderPortion.loanIdOnChain,
              Math.floor(amount * (lenderPortion.amount / loan.totalAmount)) // Proportional repayment
            );

            blockchainResults.push({
              lenderId: lenderPortion.lenderId,
              loanIdOnChain: lenderPortion.loanIdOnChain,
              ...blockchainResult
            });

            console.log(`✅ Blockchain repayment marked: ${blockchainResult.txHash}`);
          }
        }
      } else if (loan.loanIdOnChain) {
        // Single loan fallback
        const blockchainResult = await blockchainService.markRepaid(loan.loanIdOnChain, amount);
        blockchainResults = [blockchainResult];
        console.log(`✅ Single loan repayment marked on blockchain: ${blockchainResult.txHash}`);
      }
    } catch (blockchainError) {
      console.error('❌ Blockchain repayment failed:', blockchainError.message);
      // Continue with database update even if blockchain fails
    }

    if (loan.totalRepaidAmount >= totalOwed) {
      loan.status = 'REPAID';
      loan.completedAt = new Date();
      loan.stateHistory.push({
        state: 'REPAID',
        timestamp: new Date(),
        reason: 'Loan fully repaid',
      });
    }

    await loan.save();

    // Create and send notifications for all lenders
    if (loan.lenders && loan.lenders.length > 0) {
      for (const lenderPortion of loan.lenders) {
        try {
          const lenderNotificationReq = {
            body: {
              userId: lenderPortion.lenderId,
              type: 'PaymentReceived',
              title: 'Payment Received',
              message: `Payment of ₹${amount} received for your loan portion of ₹${lenderPortion.amount}.`,
              channels: {
                email: true,
                sms: false,
                push: true,
                inApp: true,
              },
              priority: 'Medium',
              metadata: {
                relatedLoanId: loan._id,
                senderId: user._id,
                source: 'loan_repayment'
              }
            },
            user: { id: lenderPortion.lenderId }
          };
          const lenderNotificationRes = {
            status: () => ({ json: () => {} }),
            json: () => {}
          };
          await notificationController.sendNotification(lenderNotificationReq, lenderNotificationRes);
        } catch (notificationError) {
          console.error('Lender repayment notification failed:', notificationError.message);
        }
      }
    } else if (loan.lenderId) {
      // Fallback for single lender
      try {
        const lenderNotificationReq = {
          body: {
            userId: loan.lenderId,
            type: 'PaymentReceived',
            title: 'Payment Received',
            message: `Payment of ₹${amount} received for loan #${loan._id}.`,
            channels: {
              email: true,
              sms: false,
              push: true,
              inApp: true,
            },
            priority: 'Medium',
            metadata: {
              relatedLoanId: loan._id,
              senderId: user._id,
              source: 'loan_repayment'
            }
          },
          user: { id: loan.lenderId }
        };
        const lenderNotificationRes = {
          status: () => ({ json: () => {} }),
          json: () => {}
        };
        await notificationController.sendNotification(lenderNotificationReq, lenderNotificationRes);
      } catch (notificationError) {
        console.error('Single lender repayment notification failed:', notificationError.message);
      }
    }

    // Notify borrower of successful repayment
    try {
      const borrowerNotificationReq = {
        body: {
          userId: user._id,
          type: 'PaymentMade',
          title: 'Payment Successful',
          message: `Your payment of ₹${amount} has been successfully processed.`,
          channels: {
            email: true,
            sms: true,
            push: true,
            inApp: true,
          },
          priority: 'Medium',
          metadata: {
            relatedLoanId: loan._id,
            source: 'loan_repayment'
          }
        },
        user: { id: user._id }
      };
      const borrowerNotificationRes = {
        status: () => ({ json: () => {} }),
        json: () => {}
      };
      await notificationController.sendNotification(borrowerNotificationReq, borrowerNotificationRes);
    } catch (notificationError) {
      console.error('Borrower repayment notification failed:', notificationError.message);
    }

    res.json({
      success: true,
      data: loan,
      message: 'Payment recorded successfully',
      blockchain: blockchainResults.length > 0 ? blockchainResults : null,
    });

  } catch (error) {
    console.error('Repay loan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record payment'
    });
  }
};

module.exports = {
  createLoan,
  getAllLoans,
  getLoanById,
  getLoansByBorrower,
  fundLoan,
  repayLoan,
};
