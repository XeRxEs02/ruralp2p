const EventEmitter = require('eventemitter3');

/**
 * EventBus - Central event management system for RuralConnect P2P platform
 * Enables decoupled communication between different modules
 * Handles payment events, notification triggers, and blockchain updates
 */
class EventBusManager extends EventEmitter {
  constructor() {
    super();
    
    this.eventHistory = new Map(); // Store recent events for debugging
    this.eventStats = new Map(); // Track event frequency
    this.maxHistorySize = 1000; // Limit history size to prevent memory leaks
    
    // Initialize event handlers
    this.setupDefaultHandlers();
    
    console.log('EventBus initialized with default handlers');
  }

  /**
   * Setup default event handlers for core system events
   * @private
   */
  setupDefaultHandlers() {
    // Transaction Events
    this.on('transaction.created', this.handleTransactionCreated.bind(this));
    this.on('transaction.confirmed', this.handleTransactionConfirmed.bind(this));
    this.on('transaction.failed', this.handleTransactionFailed.bind(this));
    
    // Payment Events
    this.on('payment.initiated', this.handlePaymentInitiated.bind(this));
    this.on('payment.successful', this.handlePaymentSuccessful.bind(this));
    this.on('payment.failed', this.handlePaymentFailed.bind(this));
    
    // Loan Events
    this.on('loan.created', this.handleLoanCreated.bind(this));
    this.on('loan.approved', this.handleLoanApproved.bind(this));
    this.on('loan.rejected', this.handleLoanRejected.bind(this));
    this.on('loan.repayment_due', this.handleRepaymentDue.bind(this));
    this.on('loan.completed', this.handleLoanCompleted.bind(this));
    this.on('loan.update_repayment_status', this.handleLoanRepaymentStatusUpdate.bind(this));
    
    // Document Events
    this.on('document.uploaded', this.handleDocumentUploaded.bind(this));
    this.on('document.verified', this.handleDocumentVerified.bind(this));
    this.on('document.rejected', this.handleDocumentRejected.bind(this));
    
    // Notification Events
    this.on('notification.created', this.handleNotificationCreated.bind(this));
    this.on('notification.sent', this.handleNotificationSent.bind(this));
    this.on('notification.delivered', this.handleNotificationDelivered.bind(this));
    this.on('notification.failed', this.handleNotificationFailed.bind(this));
    this.on('notification.send', this.handleNotificationSend.bind(this));
    this.on('notification.send_multi', this.handleNotificationSendMulti.bind(this));
    
    // Blockchain Events
    this.on('blockchain.transaction_confirmed', this.handleBlockchainConfirmation.bind(this));
    this.on('blockchain.transaction_failed', this.handleBlockchainFailure.bind(this));
    this.on('blockchain.record_transaction', this.handleBlockchainRecordTransaction.bind(this));
    this.on('blockchain.create_loan', this.handleBlockchainCreateLoan.bind(this));
    this.on('blockchain.store_document', this.handleBlockchainStoreDocument.bind(this));
    this.on('blockchain.verify_identity', this.handleBlockchainVerifyIdentity.bind(this));
    this.on('blockchain.tokenize_asset', this.handleBlockchainTokenizeAsset.bind(this));
    
    // User Events
    this.on('user.registered', this.handleUserRegistered.bind(this));
    this.on('user.kyc_completed', this.handleKYCCompleted.bind(this));
    this.on('user.login', this.handleUserLogin.bind(this));
    
    // System Events
    this.on('system.sync_requested', this.handleSyncRequested.bind(this));
    this.on('system.offline_event_queued', this.handleOfflineEventQueued.bind(this));
    this.on('system.connection_restored', this.handleConnectionRestored.bind(this));
  }

  /**
   * Emit an event with metadata and tracking
   * @param {string} eventName - Name of the event
   * @param {Object} data - Event data payload
   * @param {Object} options - Additional options
   * @returns {boolean} Success status
   */
  emitEvent(eventName, data = {}, options = {}) {
    try {
      const eventId = this.generateEventId();
      const timestamp = new Date();
      
      // Create enhanced event data
      const enhancedData = {
        ...data,
        _metadata: {
          eventId,
          timestamp,
          source: options.source || 'system',
          priority: options.priority || 'medium',
          retryable: options.retryable !== false,
          correlationId: options.correlationId || this.generateCorrelationId(),
          userId: options.userId,
          sessionId: options.sessionId
        }
      };

      // Store in history
      this.addToHistory(eventName, enhancedData);
      
      // Update statistics
      this.updateStats(eventName);
      
      // Emit the event
      const success = super.emit(eventName, enhancedData);
      
      // Log the event
      this.logEvent(eventName, enhancedData, success);
      
      return success;
      
    } catch (error) {
      console.error(`Error emitting event ${eventName}:`, error);
      return false;
    }
  }

  /**
   * Add event listener with metadata
   * @param {string} eventName - Event name to listen for
   * @param {Function} handler - Event handler function
   * @param {Object} options - Listener options
   * @returns {EventBusManager} This instance for chaining
   */
  addListener(eventName, handler, options = {}) {
    const wrappedHandler = async (data) => {
      try {
        const startTime = Date.now();
        
        // Execute the handler
        await handler(data);
        
        const executionTime = Date.now() - startTime;
        
        // Log successful execution
        if (options.logExecution !== false) {
          console.log(`Event handler for '${eventName}' executed in ${executionTime}ms`);
        }
        
      } catch (error) {
        console.error(`Error in event handler for '${eventName}':`, error);
        
        // Emit error event if handler fails
        this.emitEvent('system.handler_error', {
          originalEvent: eventName,
          error: error.message,
          handlerName: handler.name || 'anonymous'
        });
        
        // Retry if enabled
        if (options.retryOnError && data._metadata?.retryable) {
          setTimeout(() => {
            this.emitEvent(eventName, data, { retryAttempt: true });
          }, options.retryDelay || 5000);
        }
      }
    };

    return super.on(eventName, wrappedHandler);
  }

  // Default Event Handlers

  /**
   * Handle transaction creation events
   */
  async handleTransactionCreated(data) {
    console.log(`Transaction created: ${data.transactionId} for loan ${data.loanId}`);
    
    // Trigger blockchain recording if enabled
    if (data.recordOnBlockchain) {
      this.emitEvent('blockchain.record_transaction', {
        transactionId: data.transactionId,
        loanId: data.loanId,
        amount: data.amount,
        type: data.type
      });
    }
  }

  /**
   * Handle transaction confirmation events
   */
  async handleTransactionConfirmed(data) {
    console.log(`Transaction confirmed: ${data.transactionId} with hash ${data.txnHash}`);

    // Send notifications to both parties with remaining balance info
    this.emitEvent('notification.send_multi', {
      recipients: [
        {
          userId: data.borrowerId,
          userType: 'borrower',
          title: 'Payment Confirmed',
          message: `Your payment of ₹${data.amount} for Loan ${data.loanId} has been confirmed. Transaction ID: ${data.transactionId}. Remaining balance will be updated shortly.`
        },
        {
          userId: data.lenderId,
          userType: 'lender',
          title: 'Payment Received',
          message: `You have received ₹${data.amount} payment for Loan ${data.loanId}. Transaction ID: ${data.transactionId}.`
        }
      ],
      type: 'PaymentReceived',
      variables: {
        amount: data.amount,
        loanId: data.loanId,
        transactionId: data.transactionId
      }
    });

    // Update loan status if this was a repayment
    if (data.type === 'emi_payment' || data.type === 'full_repayment') {
      this.emitEvent('loan.update_repayment_status', {
        loanId: data.loanId,
        amount: data.amount,
        transactionId: data.transactionId,
        txnHash: data.txnHash
      });
    }
  }

  /**
   * Handle transaction failure events
   */
  async handleTransactionFailed(data) {
    console.log(`Transaction failed: ${data.transactionId} - ${data.failureReason}`);
    
    // Send failure notifications
    this.emitEvent('notification.send', {
      userId: data.borrowerId,
      type: 'payment_failed',
      variables: {
        amount: data.amount || 'N/A',
        loanId: data.loanId,
        transactionId: data.transactionId,
        reason: data.failureReason
      }
    });
  }

  /**
   * Handle payment initiation events
   */
  async handlePaymentInitiated(data) {
    console.log(`Payment initiated: ${data.orderId} for ₹${data.amount}`);
    
    // Create transaction record
    this.emitEvent('transaction.create', {
      loanId: data.loanId,
      borrowerId: data.borrowerId,
      lenderId: data.lenderId,
      amount: data.amount,
      type: data.paymentType || 'emi_payment',
      razorpayOrderId: data.orderId,
      status: 'pending'
    });
  }

  /**
   * Handle successful payment events
   */
  async handlePaymentSuccessful(data) {
    console.log(`Payment successful: ${data.paymentId} for order ${data.orderId}`);

    // Confirm transaction
    this.emitEvent('transaction.confirm', {
      transactionId: data.transactionId,
      razorpayPaymentId: data.paymentId,
      amount: data.amount
    });

    // Send payment success notification to borrower
    this.emitEvent('notification.send', {
      userId: data.borrowerId,
      type: 'PaymentReceived',
      title: 'Payment Successful',
      message: `Your payment of ₹${data.amount} for Loan ${data.loanId} has been processed successfully. Transaction ID: ${data.transactionId}`,
      variables: {
        amount: data.amount,
        loanId: data.loanId,
        transactionId: data.transactionId
      }
    });

    // Send notification to lender as well
    if (data.lenderId) {
      this.emitEvent('notification.send', {
        userId: data.lenderId,
        type: 'PaymentReceived',
        title: 'Payment Received',
        message: `You have received ₹${data.amount} payment for Loan ${data.loanId}. Transaction ID: ${data.transactionId}`,
        variables: {
          amount: data.amount,
          loanId: data.loanId,
          transactionId: data.transactionId
        }
      });
    }
  }

  /**
   * Handle failed payment events
   */
  async handlePaymentFailed(data) {
    console.log(`Payment failed: ${data.orderId} - ${data.error}`);
    
    // Mark transaction as failed
    this.emitEvent('transaction.fail', {
      transactionId: data.transactionId,
      failureReason: data.error
    });
  }

  /**
   * Handle loan creation events
   */
  async handleLoanCreated(data) {
    console.log(`Loan created: ${data.loanId} by borrower ${data.borrowerId}`);
    
    // Send notification to borrower
    this.emitEvent('notification.send', {
      userId: data.borrowerId,
      type: 'loan_application_submitted',
      variables: {
        loanId: data.loanId,
        amount: data.amount
      }
    });
  }

  /**
   * Handle loan approval events
   */
  async handleLoanApproved(data) {
    console.log(`Loan approved: ${data.loanId} by lender ${data.lenderId}`);
    
    // Send notifications
    this.emitEvent('notification.send_multi', {
      recipients: [
        { userId: data.borrowerId, userType: 'borrower' },
        { userId: data.lenderId, userType: 'lender' }
      ],
      type: 'loan_approved',
      variables: {
        loanId: data.loanId,
        amount: data.amount
      }
    });
    
    // Create blockchain loan record
    this.emitEvent('blockchain.create_loan', {
      loanId: data.loanId,
      borrowerAddress: data.borrowerAddress,
      lenderAddress: data.lenderAddress,
      amount: data.amount,
      interestRate: data.interestRate,
      duration: data.duration
    });
  }

  /**
   * Handle loan rejection events
   */
  async handleLoanRejected(data) {
    console.log(`Loan rejected: ${data.loanId}`);
    
    this.emitEvent('notification.send', {
      userId: data.borrowerId,
      type: 'loan_rejected',
      variables: {
        loanId: data.loanId,
        amount: data.amount,
        reason: data.rejectionReason
      }
    });
  }

  /**
   * Handle repayment due reminders
   */
  async handleRepaymentDue(data) {
    console.log(`Repayment due reminder: ${data.loanId} - ₹${data.amount}`);
    
    this.emitEvent('notification.send', {
      userId: data.borrowerId,
      type: 'repayment_due',
      variables: {
        loanId: data.loanId,
        amount: data.amount,
        dueDate: data.dueDate
      },
      scheduledFor: new Date(data.reminderDate)
    });
  }

  /**
   * Handle loan completion events
   */
  async handleLoanCompleted(data) {
    console.log(`Loan completed: ${data.loanId}`);

    // Send completion notifications
    this.emitEvent('notification.send_multi', {
      recipients: [
        { userId: data.borrowerId, userType: 'borrower' },
        { userId: data.lenderId, userType: 'lender' }
      ],
      type: 'loan_completed',
      variables: {
        loanId: data.loanId,
        totalAmount: data.totalAmount
      }
    });
  }

  /**
   * Handle loan repayment status updates
   */
  async handleLoanRepaymentStatusUpdate(data) {
    try {
      console.log(`Updating loan repayment status: ${data.loanId} - ₹${data.amount}`);

      const Loan = require('../models/Loan');
      const loan = await Loan.findById(data.loanId).populate('lenders.lenderId');

      if (!loan) {
        console.error('Loan not found for repayment status update');
        return;
      }

      // Calculate remaining balance
      const totalOwed = loan.totalAmount + (loan.totalAmount * loan.averageInterestRate / 100);
      const repaidAmount = (loan.totalRepaidAmount || 0) + data.amount;
      const remainingBalance = Math.max(0, totalOwed - repaidAmount);

      // Update loan repayment amount
      loan.totalRepaidAmount = repaidAmount;
      await loan.save();

      console.log(`Loan ${data.loanId} updated - Remaining balance: ₹${remainingBalance}`);

      // Send notifications with updated balance information
      const borrowerMessage = `Payment of ₹${data.amount} processed successfully for Loan ${data.loanId.slice(-6)}. Remaining balance: ₹${remainingBalance.toLocaleString()}. Transaction ID: ${data.transactionId}`;

      this.emitEvent('notification.send', {
        userId: loan.borrowerId,
        type: 'PaymentReceived',
        title: 'Loan Balance Updated',
        message: borrowerMessage,
        variables: {
          loanId: data.loanId,
          amount: data.amount,
          remainingBalance: remainingBalance,
          transactionId: data.transactionId
        }
      });

      // Send notifications to all lenders
      if (loan.lenders && loan.lenders.length > 0) {
        for (const lenderInfo of loan.lenders) {
          if (lenderInfo.lenderId && lenderInfo.status === 'ACTIVE') {
            const lenderMessage = `Received ₹${data.amount} payment from Loan ${data.loanId.slice(-6)}. Your portion: ₹${(data.amount * lenderInfo.amount / loan.totalAmount).toFixed(2)}. Transaction ID: ${data.transactionId}`;

            this.emitEvent('notification.send', {
              userId: lenderInfo.lenderId._id,
              type: 'PaymentReceived',
              title: 'Payment Received',
              message: lenderMessage,
              variables: {
                loanId: data.loanId,
                amount: data.amount,
                lenderPortion: (data.amount * lenderInfo.amount / loan.totalAmount),
                transactionId: data.transactionId
              }
            });
          }
        }
      }

      // Check if loan is fully repaid
      if (remainingBalance <= 0) {
        console.log(`Loan ${data.loanId} is now fully repaid!`);
        loan.status = 'COMPLETED';
        await loan.save();

        // Send loan completion notifications
        this.emitEvent('loan.completed', {
          loanId: data.loanId,
          borrowerId: loan.borrowerId,
          lenderId: loan.lenders?.[0]?.lenderId?._id,
          totalAmount: totalOwed
        });
      }

    } catch (error) {
      console.error('Error updating loan repayment status:', error);
    }
  }

  /**
   * Handle document upload events
   */
  async handleDocumentUploaded(data) {
    console.log(`Document uploaded: ${data.documentId} by user ${data.userId}`);
    
    // Store document hash on blockchain
    this.emitEvent('blockchain.store_document', {
      documentHash: data.documentHash,
      ownerAddress: data.userAddress,
      documentType: data.documentType
    });
  }

  /**
   * Handle document verification events
   */
  async handleDocumentVerified(data) {
    console.log(`Document verified: ${data.documentId}`);
    
    this.emitEvent('notification.send', {
      userId: data.userId,
      type: 'document_verified',
      variables: {
        documentType: data.documentType,
        loanId: data.loanId
      }
    });
  }

  /**
   * Handle document rejection events
   */
  async handleDocumentRejected(data) {
    console.log(`Document rejected: ${data.documentId} - ${data.rejectionReason}`);
    
    this.emitEvent('notification.send', {
      userId: data.userId,
      type: 'document_rejected',
      variables: {
        documentType: data.documentType,
        loanId: data.loanId,
        reason: data.rejectionReason
      }
    });
  }

  /**
   * Handle notification creation
   */
  async handleNotificationCreated(data) {
    console.log(`Notification created: ${data.notificationId} for user ${data.userId}`);
  }

  /**
   * Handle notification sent events
   */
  async handleNotificationSent(data) {
    console.log(`Notification sent: ${data.notificationId} via ${data.channel}`);
  }

  /**
   * Handle notification delivery confirmation
   */
  async handleNotificationDelivered(data) {
    console.log(`Notification delivered: ${data.notificationId} to ${data.recipient}`);
  }

  /**
   * Handle notification failures
   */
  async handleNotificationFailed(data) {
    console.log(`Notification failed: ${data.notificationId} - ${data.error}`);

    // Retry if appropriate
    if (data.retryable) {
      setTimeout(() => {
        this.emitEvent('notification.retry', {
          notificationId: data.notificationId,
          channel: data.channel
        });
      }, 5000);
    }
  }

  /**
   * Handle single notification send
   */
  async handleNotificationSend(data) {
    try {
      console.log(`Sending notification to user ${data.userId}: ${data.type}`);

      const NotificationController = require('../controllers/notificationController');

      // Create a mock request object for the controller
      const mockReq = {
        body: {
          userId: data.userId,
          userType: data.userType || 'borrower',
          type: data.type,
          title: data.title,
          message: data.message,
          channels: data.channels || { sms: true, push: true, inApp: true },
          priority: data.priority || 'medium',
          templateVariables: data.variables || {},
          metadata: {
            source: 'event_bus',
            triggeredBy: data._metadata?.source || 'system'
          }
        },
        user: { id: 'system' } // System user
      };

      // Create a mock response object
      const mockRes = {
        status: (code) => ({
          json: (data) => {
            console.log(`Notification send response (${code}):`, data);
            return data;
          }
        })
      };

      // Call the notification controller
      await NotificationController.sendNotification(mockReq, mockRes);

    } catch (error) {
      console.error('Error sending notification via EventBus:', error);
      this.emitEvent('notification.failed', {
        userId: data.userId,
        type: data.type,
        error: error.message,
        retryable: true
      });
    }
  }

  /**
   * Handle bulk notification send
   */
  async handleNotificationSendMulti(data) {
    try {
      console.log(`Sending bulk notifications to ${data.recipients?.length || 0} recipients: ${data.type}`);

      const NotificationController = require('../controllers/notificationController');

      // Create a mock request object for the controller
      const mockReq = {
        body: {
          recipients: data.recipients || [],
          type: data.type,
          title: data.title,
          message: data.message,
          channels: data.channels || { sms: true, push: true, inApp: true },
          priority: data.priority || 'medium',
          templateVariables: data.variables || {},
          batchSize: data.batchSize || 50
        },
        user: { id: 'system' } // System user
      };

      // Create a mock response object
      const mockRes = {
        status: (code) => ({
          json: (data) => {
            console.log(`Bulk notification send response (${code}):`, data);
            return data;
          }
        })
      };

      // Call the notification controller
      await NotificationController.sendBulkNotifications(mockReq, mockRes);

    } catch (error) {
      console.error('Error sending bulk notifications via EventBus:', error);
      this.emitEvent('notification.bulk_failed', {
        recipients: data.recipients,
        type: data.type,
        error: error.message
      });
    }
  }

  /**
   * Handle blockchain confirmation
   */
  async handleBlockchainConfirmation(data) {
    console.log(`Blockchain transaction confirmed: ${data.txnHash}`);
  }

  /**
   * Handle blockchain failures
   */
  async handleBlockchainFailure(data) {
    console.log(`Blockchain transaction failed: ${data.error}`);
  }

  /**
   * Handle blockchain transaction recording
   */
  async handleBlockchainRecordTransaction(data) {
    try {
      console.log(`🔗 Recording transaction on blockchain: ${data.transactionId}`);

      const blockchainService = require('../services/blockchainService');
      const result = await blockchainService.markRepaid(data.loanId, data.amount);

      if (result.success) {
        this.emitEvent('blockchain.transaction_confirmed', {
          txnHash: result.txHash,
          transactionId: data.transactionId,
          loanId: data.loanId,
          amount: data.amount
        });
      } else {
        this.emitEvent('blockchain.transaction_failed', {
          transactionId: data.transactionId,
          error: result.error || 'Unknown blockchain error'
        });
      }

    } catch (error) {
      console.error('❌ Error recording transaction on blockchain:', error);
      this.emitEvent('blockchain.transaction_failed', {
        transactionId: data.transactionId,
        error: error.message
      });
    }
  }

  /**
   * Handle blockchain loan creation
   */
  async handleBlockchainCreateLoan(data) {
    try {
      console.log(`🔗 Creating loan on blockchain: ${data.loanId}`);

      const blockchainService = require('../services/blockchainService');
      const result = await blockchainService.createLoan({
        borrowerAddress: data.borrowerAddress,
        lenderAddress: data.lenderAddress,
        amount: data.amount,
        dueDate: Math.floor(Date.now() / 1000) + (6 * 30 * 24 * 60 * 60), // 6 months from now
        docHash: data.documentHash || '0x0000000000000000000000000000000000000000000000000000000000000000'
      });

      if (result.success) {
        this.emitEvent('blockchain.transaction_confirmed', {
          txnHash: result.txHash,
          loanId: data.loanId,
          operation: 'create_loan'
        });
      } else {
        this.emitEvent('blockchain.transaction_failed', {
          loanId: data.loanId,
          error: result.error || 'Unknown blockchain error'
        });
      }

    } catch (error) {
      console.error('❌ Error creating loan on blockchain:', error);
      this.emitEvent('blockchain.transaction_failed', {
        loanId: data.loanId,
        error: error.message
      });
    }
  }

  /**
   * Handle blockchain document storage
   */
  async handleBlockchainStoreDocument(data) {
    try {
      console.log(`🔗 Storing document on blockchain: ${data.documentHash.substring(0, 16)}...`);

      const blockchainService = require('../services/blockchainService');
      const result = await blockchainService.verifyDocumentHash(data.documentHash);

      if (result.success) {
        this.emitEvent('blockchain.transaction_confirmed', {
          txnHash: result.txHash,
          documentHash: data.documentHash,
          operation: 'store_document'
        });
      } else {
        this.emitEvent('blockchain.transaction_failed', {
          documentHash: data.documentHash,
          error: result.error || 'Unknown blockchain error'
        });
      }

    } catch (error) {
      console.error('❌ Error storing document on blockchain:', error);
      this.emitEvent('blockchain.transaction_failed', {
        documentHash: data.documentHash,
        error: error.message
      });
    }
  }

  /**
   * Handle blockchain identity verification
   */
  async handleBlockchainVerifyIdentity(data) {
    try {
      console.log(`🔗 Verifying identity on blockchain: ${data.identityHash.substring(0, 16)}...`);

      const blockchainService = require('../services/blockchainService');
      const result = await blockchainService.verifyDocumentHash(data.identityHash);

      if (result.success) {
        this.emitEvent('blockchain.transaction_confirmed', {
          txnHash: result.txHash,
          identityHash: data.identityHash,
          operation: 'verify_identity'
        });
      } else {
        this.emitEvent('blockchain.transaction_failed', {
          identityHash: data.identityHash,
          error: result.error || 'Unknown blockchain error'
        });
      }

    } catch (error) {
      console.error('❌ Error verifying identity on blockchain:', error);
      this.emitEvent('blockchain.transaction_failed', {
        identityHash: data.identityHash,
        error: error.message
      });
    }
  }

  /**
   * Handle blockchain asset tokenization
   */
  async handleBlockchainTokenizeAsset(data) {
    try {
      console.log(`🔗 Tokenizing asset on blockchain: ${data.assetId}`);

      const blockchainService = require('../services/blockchainService');
      const result = await blockchainService.createLoan({
        borrowerAddress: data.ownerAddress,
        lenderAddress: data.ownerAddress, // Self-tokenization
        amount: data.estimatedValue,
        dueDate: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year
        docHash: data.assetHash
      });

      if (result.success) {
        this.emitEvent('blockchain.transaction_confirmed', {
          txnHash: result.txHash,
          assetId: data.assetId,
          tokenId: data.tokenId,
          operation: 'tokenize_asset'
        });
      } else {
        this.emitEvent('blockchain.transaction_failed', {
          assetId: data.assetId,
          error: result.error || 'Unknown blockchain error'
        });
      }

    } catch (error) {
      console.error('❌ Error tokenizing asset on blockchain:', error);
      this.emitEvent('blockchain.transaction_failed', {
        assetId: data.assetId,
        error: error.message
      });
    }
  }

  /**
   * Handle user registration
   */
  async handleUserRegistered(data) {
    console.log(`User registered: ${data.userId}`);
    
    this.emitEvent('notification.send', {
      userId: data.userId,
      type: 'welcome',
      variables: {
        userName: data.userName
      }
    });
  }

  /**
   * Handle KYC completion
   */
  async handleKYCCompleted(data) {
    console.log(`KYC completed: ${data.userId}`);
    
    this.emitEvent('notification.send', {
      userId: data.userId,
      type: 'kyc_completed',
      variables: {
        userName: data.userName
      }
    });
  }

  /**
   * Handle user login
   */
  async handleUserLogin(data) {
    console.log(`User login: ${data.userId} from ${data.ipAddress}`);
  }

  /**
   * Handle sync requests
   */
  async handleSyncRequested(data) {
    console.log(`Sync requested by user: ${data.userId}`);
  }

  /**
   * Handle offline event queuing
   */
  async handleOfflineEventQueued(data) {
    console.log(`Event queued for offline sync: ${data.eventName}`);
  }

  /**
   * Handle connection restoration
   */
  async handleConnectionRestored(data) {
    console.log(`Connection restored for user: ${data.userId}`);
    
    // Trigger sync of queued events
    this.emitEvent('system.process_offline_queue', {
      userId: data.userId
    });
  }

  // Utility Methods

  /**
   * Generate unique event ID
   * @private
   */
  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate correlation ID for related events
   * @private
   */
  generateCorrelationId() {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add event to history
   * @private
   */
  addToHistory(eventName, data) {
    const eventId = data._metadata?.eventId;
    if (eventId) {
      this.eventHistory.set(eventId, { eventName, data, timestamp: new Date() });
      
      // Cleanup old events
      if (this.eventHistory.size > this.maxHistorySize) {
        const oldestKey = this.eventHistory.keys().next().value;
        this.eventHistory.delete(oldestKey);
      }
    }
  }

  /**
   * Update event statistics
   * @private
   */
  updateStats(eventName) {
    const current = this.eventStats.get(eventName) || { count: 0, lastEmitted: null };
    this.eventStats.set(eventName, {
      count: current.count + 1,
      lastEmitted: new Date()
    });
  }

  /**
   * Log event emission
   * @private
   */
  logEvent(eventName, data, success) {
    const level = success ? 'info' : 'error';
    const message = `Event '${eventName}' ${success ? 'emitted' : 'failed'}`;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[EventBus:${level.toUpperCase()}] ${message}`, {
        eventId: data._metadata?.eventId,
        timestamp: data._metadata?.timestamp,
        source: data._metadata?.source
      });
    }
  }

  /**
   * Get event statistics
   * @returns {Object} Event statistics
   */
  getStats() {
    return {
      totalEvents: Array.from(this.eventStats.values()).reduce((sum, stat) => sum + stat.count, 0),
      uniqueEvents: this.eventStats.size,
      historySize: this.eventHistory.size,
      eventBreakdown: Object.fromEntries(this.eventStats)
    };
  }

  /**
   * Get recent events from history
   * @param {number} limit - Number of recent events to return
   * @returns {Array} Recent events
   */
  getRecentEvents(limit = 50) {
    const events = Array.from(this.eventHistory.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
    
    return events;
  }

  /**
   * Clear event history and stats
   */
  clearHistory() {
    this.eventHistory.clear();
    this.eventStats.clear();
    console.log('Event history and statistics cleared');
  }
}

// Create and export singleton instance
const eventBus = new EventBusManager();

module.exports = eventBus;
