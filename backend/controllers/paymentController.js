const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const razorpayService = require('../services/razorpayService');
const blockchainService = require('../services/blockchainService');
const Transaction = require('../models/Transaction');
const eventBus = require('../utils/eventBus');

/**
 * PaymentController - Handles all payment-related operations
 * Integrates Razorpay payments with blockchain transactions and notifications
 * Supports loan disbursement, EMI payments, and full repayments
 */
class PaymentController {
  
  /**
   * Initiate a new payment order
   * POST /api/payments/initiate
   */
  static async initiatePayment(req, res) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        loanId,
        borrowerId,
        lenderId,
        amount,
        paymentType = 'emi_payment',
        currency = 'INR',
        metadata = {}
      } = req.body;

      // Generate unique receipt ID
      const receiptId = `rcpt_${loanId}_${paymentType}_${Date.now()}`;

      // Create Razorpay order
      const orderData = {
        amount: amount,
        currency: currency,
        receipt: receiptId,
        notes: {
          loanId: loanId.toString(),
          borrowerId: borrowerId.toString(),
          lenderId: lenderId.toString(),
          paymentType,
          platform: 'RuralConnect'
        }
      };

      const razorpayOrder = await razorpayService.createOrder(orderData);

      // Create transaction record in database
      const transactionData = {
        transactionId: uuidv4(),
        loanId,
        borrowerId,
        lenderId,
        amount,
        currency,
        type: paymentType,
        razorpayOrderId: razorpayOrder.id,
        status: 'pending',
        metadata: {
          paymentMethod: 'razorpay',
          deviceInfo: {
            userAgent: req.get('User-Agent'),
            ipAddress: req.ip,
          },
          ...metadata
        }
      };

      const transaction = new Transaction(transactionData);
      await transaction.save();

      // Emit payment initiation event
      eventBus.emitEvent('payment.initiated', {
        orderId: razorpayOrder.id,
        transactionId: transaction.transactionId,
        loanId,
        borrowerId,
        lenderId,
        amount,
        paymentType,
        currency
      }, {
        source: 'payment_controller',
        userId: borrowerId
      });

      // Prepare response
      const response = {
        success: true,
        message: 'Payment order created successfully',
        data: {
          orderId: razorpayOrder.id,
          transactionId: transaction.transactionId,
          amount: razorpayOrder.amount / 100, // Convert back to rupees
          currency: razorpayOrder.currency,
          receipt: razorpayOrder.receipt,
          status: razorpayOrder.status,
          loanId,
          paymentType,
          // Include test credentials for frontend integration
          testCredentials: razorpayService.getTestCredentials(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes expiry
        }
      };

      res.status(201).json(response);

    } catch (error) {
      console.error('Error initiating payment:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to initiate payment',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Confirm payment after successful Razorpay transaction
   * POST /api/payments/confirm
   */
  static async confirmPayment(req, res) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        transactionId
      } = req.body;

      // Find transaction in database
      const transaction = await Transaction.findOne({
        $or: [
          { transactionId },
          { razorpayOrderId: razorpay_order_id }
        ]
      }).populate('loanId borrowerId lenderId');

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      // Check if already confirmed
      if (transaction.status === 'confirmed') {
        return res.status(400).json({
          success: false,
          message: 'Transaction already confirmed'
        });
      }

      // Verify payment with Razorpay
      const paymentVerification = await razorpayService.verifyPayment({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      });

      if (!paymentVerification.verified) {
        // Mark transaction as failed
        transaction.status = 'failed';
        transaction.failureReason = 'Payment verification failed';
        await transaction.save();

        eventBus.emitEvent('payment.failed', {
          orderId: razorpay_order_id,
          transactionId: transaction.transactionId,
          error: 'Payment verification failed'
        });

        return res.status(400).json({
          success: false,
          message: 'Payment verification failed'
        });
      }

      // Update transaction with payment details
      transaction.razorpayPaymentId = razorpay_payment_id;
      transaction.razorpaySignature = razorpay_signature;
      transaction.status = 'processing';
      transaction.metadata.paymentMethod = paymentVerification.method;
      transaction.metadata.bank = paymentVerification.bank;
      transaction.metadata.wallet = paymentVerification.wallet;
      await transaction.save();

      // Process blockchain transaction
      let blockchainResult = null;
      try {
        if (transaction.type === 'emi_payment' || transaction.type === 'full_repayment') {
          // Record repayment on blockchain
          blockchainResult = await blockchainService.processRepayment({
            loanId: transaction.loanId,
            amount: transaction.amount,
            borrowerAddress: transaction.borrowerId.walletAddress,
            paymentId: razorpay_payment_id
          });
        }
      } catch (blockchainError) {
        console.error('Blockchain transaction failed:', blockchainError);
        // Continue with payment confirmation even if blockchain fails
        // The blockchain transaction can be retried later
      }

      // Update transaction with blockchain details
      if (blockchainResult && blockchainResult.success) {
        transaction.txnHash = blockchainResult.txHash;
        transaction.gasUsed = blockchainResult.gasUsed;
        transaction.smartContractAddress = blockchainResult.contractAddress;
      }

      // Mark as confirmed
      await transaction.markAsConfirmed(blockchainResult?.txHash);

      // Emit payment success event
      eventBus.emitEvent('payment.successful', {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        loanId: transaction.loanId,
        borrowerId: transaction.borrowerId,
        lenderId: transaction.lenderId,
        txnHash: blockchainResult?.txHash
      }, {
        source: 'payment_controller',
        userId: transaction.borrowerId
      });

      // Prepare response
      const response = {
        success: true,
        message: 'Payment confirmed successfully',
        data: {
          transactionId: transaction.transactionId,
          paymentId: razorpay_payment_id,
          orderId: razorpay_order_id,
          amount: transaction.amount,
          status: transaction.status,
          txnHash: transaction.txnHash,
          confirmedAt: transaction.confirmedAt,
          blockchain: blockchainResult ? {
            success: blockchainResult.success,
            txHash: blockchainResult.txHash,
            network: blockchainService.getNetworkInfo().currentNetwork
          } : null,
          payment: {
            method: paymentVerification.method,
            bank: paymentVerification.bank,
            wallet: paymentVerification.wallet,
            fee: paymentVerification.fee,
            tax: paymentVerification.tax
          }
        }
      };

      res.status(200).json(response);

    } catch (error) {
      console.error('Error confirming payment:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to confirm payment',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Process loan repayment
   * POST /api/payments/repayment
   */
  static async processRepayment(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const {
        loanId,
        amount,
        repaymentType = 'emi_payment',
        emiNumber,
        autoDebit = false
      } = req.body;

      // This endpoint typically would be called by a scheduler for EMI reminders
      // or by the borrower for manual repayments

      // Find loan details (assuming loan model exists)
      // For now, we'll simulate loan data
      const loanData = {
        borrowerId: req.body.borrowerId || '507f1f77bcf86cd799439011',
        lenderId: req.body.lenderId || '507f1f77bcf86cd799439012',
        amount: req.body.loanAmount || amount * 10,
        status: 'active'
      };

      if (autoDebit) {
        // For auto-debit, we would integrate with bank APIs
        // For now, we'll simulate the process
        
        // Create automatic payment order
        const paymentResult = await PaymentController._processAutoDebit({
          loanId,
          borrowerId: loanData.borrowerId,
          lenderId: loanData.lenderId,
          amount,
          repaymentType,
          emiNumber
        });

        return res.status(200).json({
          success: true,
          message: 'Auto-debit repayment processed',
          data: paymentResult
        });
      }

      // For manual repayment, create payment order for user to complete
      const orderData = {
        amount,
        currency: 'INR',
        receipt: `repay_${loanId}_${emiNumber || Date.now()}`,
        notes: {
          loanId: loanId.toString(),
          repaymentType,
          emiNumber: emiNumber?.toString(),
          autoGenerated: 'true'
        }
      };

      const razorpayOrder = await razorpayService.createOrder(orderData);

      // Create transaction record
      const transaction = new Transaction({
        transactionId: uuidv4(), // Explicitly generate transaction ID
        loanId,
        borrowerId: loanData.borrowerId,
        lenderId: loanData.lenderId,
        amount,
        type: repaymentType,
        razorpayOrderId: razorpayOrder.id,
        status: 'pending',
        metadata: {
          emiNumber,
          paymentMethod: 'razorpay',
          autoGenerated: true
        }
      });

      await transaction.save();

      // Emit repayment initiation event
      eventBus.emitEvent('loan.repayment_initiated', {
        loanId,
        transactionId: transaction.transactionId,
        amount,
        emiNumber,
        repaymentType,
        borrowerId: loanData.borrowerId,
        orderId: razorpayOrder.id
      });

      res.status(200).json({
        success: true,
        message: 'Repayment order created',
        data: {
          orderId: razorpayOrder.id,
          transactionId: transaction.transactionId,
          amount,
          loanId,
          emiNumber,
          repaymentType,
          paymentUrl: `${process.env.FRONTEND_URL}/payment/${razorpayOrder.id}`,
          // Include test credentials for frontend integration
          testCredentials: razorpayService.getTestCredentials(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours for repayment
        }
      });

    } catch (error) {
      console.error('Error processing repayment:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to process repayment',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get transaction status
   * GET /api/payments/status/:transactionId
   */
  static async getTransactionStatus(req, res) {
    try {
      const { transactionId } = req.params;

      const transaction = await Transaction.findOne({
        $or: [
          { transactionId },
          { _id: transactionId }
        ]
      }).populate('loanId borrowerId lenderId');

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
      }

      // Get additional details from Razorpay if payment exists
      let razorpayDetails = null;
      if (transaction.razorpayPaymentId) {
        try {
          razorpayDetails = await razorpayService.getPaymentDetails(transaction.razorpayPaymentId);
        } catch (error) {
          console.error('Error fetching Razorpay details:', error);
        }
      }

      // Get blockchain transaction details if exists
      let blockchainDetails = null;
      if (transaction.txnHash) {
        try {
          blockchainDetails = await blockchainService.getTransactionReceipt(transaction.txnHash);
        } catch (error) {
          console.error('Error fetching blockchain details:', error);
        }
      }

      res.status(200).json({
        success: true,
        data: {
          transaction: {
            id: transaction.transactionId,
            loanId: transaction.loanId,
            amount: transaction.amount,
            currency: transaction.currency,
            type: transaction.type,
            status: transaction.status,
            initiatedAt: transaction.initiatedAt,
            confirmedAt: transaction.confirmedAt,
            failureReason: transaction.failureReason,
            metadata: transaction.metadata
          },
          razorpay: razorpayDetails,
          blockchain: blockchainDetails ? {
            txnHash: transaction.txnHash,
            blockNumber: blockchainDetails.blockNumber,
            gasUsed: blockchainDetails.gasUsed,
            network: blockchainService.getNetworkInfo().currentNetwork
          } : null,
          notifications: transaction.notificationsSent
        }
      });

    } catch (error) {
      console.error('Error getting transaction status:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to get transaction status',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get payment history for a loan
   * GET /api/payments/history/:loanId
   */
  static async getPaymentHistory(req, res) {
    try {
      const { loanId } = req.params;
      const { page = 1, limit = 10, status } = req.query;

      const query = { loanId };
      if (status) {
        query.status = status;
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { initiatedAt: -1 },
        populate: ['borrowerId', 'lenderId']
      };

      const transactions = await Transaction.paginate(query, options);

      res.status(200).json({
        success: true,
        data: {
          transactions: transactions.docs,
          pagination: {
            currentPage: transactions.page,
            totalPages: transactions.totalPages,
            totalTransactions: transactions.totalDocs,
            hasNextPage: transactions.hasNextPage,
            hasPrevPage: transactions.hasPrevPage
          }
        }
      });

    } catch (error) {
      console.error('Error getting payment history:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to get payment history',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Handle Razorpay webhook
   * POST /api/payments/webhook
   */
  static async handleWebhook(req, res) {
    try {
      const signature = req.get('X-Razorpay-Signature');
      const body = JSON.stringify(req.body);

      // Verify webhook signature
      const isValid = razorpayService.verifyWebhookSignature(body, signature);
      
      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid webhook signature'
        });
      }

      const event = req.body;
      const { entity, event: eventType } = event;

      console.log(`Received Razorpay webhook: ${eventType}`, entity);

      // Handle different webhook events
      switch (eventType) {
        case 'payment.captured':
          await PaymentController._handlePaymentCaptured(entity.payload.payment.entity);
          break;
        
        case 'payment.failed':
          await PaymentController._handlePaymentFailed(entity.payload.payment.entity);
          break;
        
        case 'order.paid':
          await PaymentController._handleOrderPaid(entity.payload.order.entity);
          break;
        
        default:
          console.log(`Unhandled webhook event: ${eventType}`);
      }

      res.status(200).json({ success: true });

    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Webhook processing failed'
      });
    }
  }

  // Private helper methods

  /**
   * Process auto-debit payment
   * @private
   */
  static async _processAutoDebit(repaymentData) {
    // In a real implementation, this would integrate with bank APIs
    // For now, we'll simulate the process
    
    const mockSuccess = Math.random() > 0.1; // 90% success rate
    
    if (mockSuccess) {
      // Create mock successful transaction
      const transaction = new Transaction({
        transactionId: uuidv4(), // Explicitly generate transaction ID
        ...repaymentData,
        type: repaymentData.repaymentType,
        status: 'confirmed',
        razorpayPaymentId: `pay_auto_${Date.now()}`,
        metadata: {
          paymentMethod: 'auto_debit',
          autoDebit: true
        }
      });
      
      await transaction.save();
      
      eventBus.emitEvent('payment.successful', {
        transactionId: transaction.transactionId,
        paymentId: transaction.razorpayPaymentId,
        amount: transaction.amount,
        loanId: transaction.loanId,
        method: 'auto_debit'
      });
      
      return {
        transactionId: transaction.transactionId,
        status: 'success',
        method: 'auto_debit'
      };
    } else {
      // Simulate failure
      throw new Error('Auto-debit failed: Insufficient funds');
    }
  }

  /**
   * Handle payment captured webhook
   * @private
   */
  static async _handlePaymentCaptured(payment) {
    try {
      const transaction = await Transaction.findOne({
        razorpayPaymentId: payment.id
      });

      if (transaction && transaction.status !== 'confirmed') {
        await transaction.markAsConfirmed();
        
        eventBus.emitEvent('payment.captured', {
          transactionId: transaction.transactionId,
          paymentId: payment.id,
          amount: payment.amount / 100
        });
      }
    } catch (error) {
      console.error('Error handling payment captured:', error);
    }
  }

  /**
   * Handle payment failed webhook
   * @private
   */
  static async _handlePaymentFailed(payment) {
    try {
      const transaction = await Transaction.findOne({
        razorpayOrderId: payment.order_id
      });

      if (transaction) {
        await transaction.markAsFailed(payment.error_description || 'Payment failed');
        
        eventBus.emitEvent('payment.failed', {
          transactionId: transaction.transactionId,
          orderId: payment.order_id,
          error: payment.error_description
        });
      }
    } catch (error) {
      console.error('Error handling payment failed:', error);
    }
  }

  /**
   * Handle order paid webhook
   * @private
   */
  static async _handleOrderPaid(order) {
    try {
      console.log(`Order paid: ${order.id} for amount ${order.amount}`);
      
      eventBus.emitEvent('order.paid', {
        orderId: order.id,
        amount: order.amount / 100,
        currency: order.currency
      });
    } catch (error) {
      console.error('Error handling order paid:', error);
    }
  }
}

// Validation middleware
PaymentController.validateInitiatePayment = [
  body('loanId').isMongoId().withMessage('Valid loan ID is required'),
  body('borrowerId').isMongoId().withMessage('Valid borrower ID is required'),
  body('lenderId').isMongoId().withMessage('Valid lender ID is required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('paymentType').optional().isIn(['loan_disbursement', 'emi_payment', 'full_repayment', 'penalty']),
  body('currency').optional().isIn(['INR', 'USD']).withMessage('Invalid currency')
];

PaymentController.validateConfirmPayment = [
  body('razorpay_order_id').notEmpty().withMessage('Razorpay order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Razorpay payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Razorpay signature is required'),
  body('transactionId').optional().isUUID().withMessage('Invalid transaction ID')
];

PaymentController.validateRepayment = [
  body('loanId').isMongoId().withMessage('Valid loan ID is required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('repaymentType').optional().isIn(['emi_payment', 'full_repayment', 'penalty']),
  body('emiNumber').optional().isInt({ min: 1 }).withMessage('EMI number must be positive integer'),
  body('autoDebit').optional().isBoolean()
];

module.exports = PaymentController;
