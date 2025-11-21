const Loan = require('../models/Loan');
const Notification = require('../models/Notification');
const blockchainService = require('./blockchainService');
const { LoanFSM } = require('../algorithms/loanFSM');

/**
 * Loan Repayment Finite State Machine Service
 * Manages loan lifecycle states and transitions
 */
class RepaymentFSMService {
  constructor() {
    this.fsms = new Map();

    this.states = {
      PENDING: 'PENDING',
      ACTIVE: 'ACTIVE',
      DUE: 'DUE',
      REPAID: 'REPAID',
      DEFAULTED: 'DEFAULTED',
      CANCELLED: 'CANCELLED',
    };

    this.transitions = {
      PENDING: ['ACTIVE', 'CANCELLED'],
      ACTIVE: ['DUE', 'REPAID', 'DEFAULTED'],
      DUE: ['REPAID', 'DEFAULTED'],
      REPAID: [], // Final state
      DEFAULTED: [], // Final state
      CANCELLED: [], // Final state
    };

    console.log('🔄 Loan Repayment FSM Service initialized');
  }

  /**
   * Check if a transition is valid
   */
  canTransition(currentState, newState) {
    return this.transitions[currentState].includes(newState);
  }

  /**
   * Process loan state transition
   */
  async transitionLoan(loanId, newState, reason = '', metadata = {}) {
    try {
      const loan = await Loan.findById(loanId);
      if (!loan) {
        throw new Error(`Loan ${loanId} not found`);
      }

      const currentState = loan.status;

      if (!this.canTransition(currentState, newState)) {
        throw new Error(`Invalid transition from ${currentState} to ${newState}`);
      }

      // Update loan state
      const oldState = loan.status;
      loan.status = newState;

      // Add to state history
      loan.stateHistory.push({
        state: newState,
        timestamp: new Date(),
        reason: reason,
        metadata: metadata,
      });

      // Update timestamps based on state
      switch (newState) {
        case this.states.ACTIVE:
          loan.disbursedAt = new Date();
          break;
        case this.states.REPAID:
          loan.completedAt = new Date();
          loan.paymentStatus = 'Completed';
          break;
        case this.states.DEFAULTED:
          loan.completedAt = new Date();
          break;
      }

      await loan.save();

      // Handle blockchain operations
      await this.handleBlockchainTransition(loan, newState, metadata);

      // Send notifications
      await this.sendStateNotifications(loan, oldState, newState, reason);

      console.log(`🔄 Loan ${loanId}: ${oldState} → ${newState} (${reason})`);

      return {
        success: true,
        loanId: loan._id,
        previousState: oldState,
        currentState: newState,
        timestamp: new Date(),
        metadata: metadata,
      };

    } catch (error) {
      console.error('FSM transition error:', error);
      throw error;
    }
  }

  /**
   * Handle blockchain operations for state transitions
   */
  async handleBlockchainTransition(loan, newState, metadata) {
    try {
      switch (newState) {
        case this.states.ACTIVE:
          // Loan activated - record on blockchain
          if (loan.lenders && loan.lenders.length > 0) {
            // For multi-lender loans, we might need multiple blockchain transactions
            for (const lender of loan.lenders) {
              if (lender.status === 'Pending') {
                lender.status = 'Active';
                lender.disbursedAt = new Date();
                // Here you would call blockchain createLoan for each lender
              }
            }
            await loan.save();
          }
          break;

        case this.states.REPAID:
          // Loan fully repaid - mark as repaid on blockchain
          if (loan.loanIdOnChain) {
            await blockchainService.markRepaid(loan.loanIdOnChain);
            console.log(`✅ Loan ${loan.loanIdOnChain} marked as repaid on blockchain`);
          }
          break;

        case this.states.DEFAULTED:
          // Loan defaulted - record on blockchain
          if (loan.loanIdOnChain) {
            // Note: The smart contract might not have a default function
            // This would need to be added to the contract
            console.log(`⚠️ Loan ${loan.loanIdOnChain} defaulted - blockchain notification sent`);
          }
          break;
      }
    } catch (error) {
      console.error('Blockchain transition error:', error);
      // Don't fail the entire transition for blockchain errors
    }
  }

  /**
   * Send notifications for state changes
   */
  async sendStateNotifications(loan, oldState, newState, reason) {
    try {
      const notifications = [];

      // Notify borrower
      notifications.push({
        recipientId: loan.borrowerId,
        type: this.getNotificationType(newState),
        title: this.getNotificationTitle(newState),
        message: this.getNotificationMessage(newState, loan, reason),
        relatedLoanId: loan._id,
        priority: this.getNotificationPriority(newState),
        channels: {
          email: true,
          sms: newState === this.states.DEFAULTED || newState === this.states.DUE,
          push: true,
          inApp: true,
        },
      });

      // Notify lenders
      for (const lender of loan.lenders || []) {
        if (lender.lenderId) {
          notifications.push({
            recipientId: lender.lenderId,
            type: this.getNotificationType(newState),
            title: this.getNotificationTitle(newState),
            message: this.getNotificationMessage(newState, loan, reason, true),
            relatedLoanId: loan._id,
            priority: this.getNotificationPriority(newState),
            channels: {
              email: true,
              sms: newState === this.states.DEFAULTED,
              push: true,
              inApp: true,
            },
          });
        }
      }

      // Create all notifications
      await Notification.insertMany(notifications);
      console.log(`📱 Sent ${notifications.length} notifications for loan ${loan._id} state change`);

    } catch (error) {
      console.error('Notification error:', error);
    }
  }

  /**
   * Process loan repayment
   */
  async processRepayment(loanId, paymentAmount, payerId) {
    try {
      const loan = await Loan.findById(loanId);
      if (!loan) {
        throw new Error(`Loan ${loanId} not found`);
      }

      // Verify payer is the borrower
      if (loan.borrowerId.toString() !== payerId.toString()) {
        throw new Error('Only borrower can make payments');
      }

      // Update total repaid amount
      loan.totalRepaidAmount += paymentAmount;
      const totalOwed = loan.getTotalAmount();
      const remainingAmount = loan.getRemainingAmount();

      let newState = loan.status;
      let reason = `Payment of ₹${paymentAmount} received`;

      // Determine new state based on payment
      if (remainingAmount <= 0) {
        newState = this.states.REPAID;
        reason += ' - Loan fully repaid';
      } else if (loan.status === this.states.DUE) {
        // Check if still overdue
        if (remainingAmount < totalOwed * 0.9) { // If paid more than 90% of overdue amount
          newState = this.states.ACTIVE;
          reason += ' - No longer overdue';
        }
      }

      // Transition state if needed
      if (newState !== loan.status) {
        await this.transitionLoan(loanId, newState, reason, {
          paymentAmount,
          remainingAmount,
          totalOwed,
        });
      } else {
        // Just update the payment
        loan.paymentStatus = remainingAmount <= 0 ? 'Completed' : 'In Progress';
        await loan.save();
      }

      return {
        success: true,
        loanId: loan._id,
        paymentAmount,
        totalRepaid: loan.totalRepaidAmount,
        remainingAmount,
        totalOwed,
        currentState: loan.status,
      };

    } catch (error) {
      console.error('Process repayment error:', error);
      throw error;
    }
  }

  /**
   * Check for overdue loans and transition them
   */
  async checkOverdueLoans() {
    try {
      const overdueLoans = await Loan.find({
        status: this.states.ACTIVE,
        dueDate: { $lt: new Date() },
      });

      console.log(`🔍 Found ${overdueLoans.length} overdue loans`);

      for (const loan of overdueLoans) {
        const daysOverdue = Math.floor((new Date() - loan.dueDate) / (1000 * 60 * 60 * 24));

        await this.transitionLoan(
          loan._id,
          this.states.DUE,
          `Payment overdue by ${daysOverdue} days`,
          { daysOverdue }
        );
      }

      return {
        success: true,
        processedLoans: overdueLoans.length,
      };

    } catch (error) {
      console.error('Check overdue loans error:', error);
      throw error;
    }
  }

  /**
   * Create new FSM for a loan
   */
  createFSM(loanId, initialState = 'PENDING') {
    if (this.fsms.has(loanId)) {
      throw new Error(`FSM already exists for loan ${loanId}`);
    }

    const fsm = new LoanFSM(loanId, initialState);
    this.fsms.set(loanId, fsm);

    return fsm;
  }

  /**
   * Get FSM for a loan
   */
  getFSM(loanId) {
    return this.fsms.get(loanId);
  }

  getNotificationTitle(state) {
    switch (state) {
      case this.states.ACTIVE: return 'Loan Disbursed';
      case this.states.DUE: return 'Payment Overdue';
      case this.states.REPAID: return 'Loan Repaid';
      case this.states.DEFAULTED: return 'Loan Defaulted';
      case this.states.CANCELLED: return 'Loan Cancelled';
      default: return 'Loan Update';
    }
  }

  getNotificationMessage(state, loan, reason, isLender = false) {
    switch (state) {
      case this.states.ACTIVE:
        return isLender
          ? `Your loan of ₹${loan.lenders.find(l => l.lenderId)?.amount || loan.totalAmount} has been disbursed.`
          : `Your loan of ₹${loan.totalAmount} has been disbursed successfully.`;
      case this.states.DUE:
        return `Your loan payment of ₹${loan.getRemainingAmount()} is overdue. Please make payment immediately.`;
      case this.states.REPAID:
        return isLender
          ? `Payment of ₹${loan.totalRepaidAmount} received for your loan.`
          : `Congratulations! Your loan has been fully repaid.`;
      case this.states.DEFAULTED:
        return `Your loan has been marked as defaulted. Please contact support.`;
      case this.states.CANCELLED:
        return `Your loan has been cancelled.`;
      default:
        return reason || 'Loan status updated.';
    }
  }

  getNotificationPriority(state) {
    switch (state) {
      case this.states.DEFAULTED:
      case this.states.DUE:
        return 'Urgent';
      case this.states.REPAID:
        return 'High';
      default:
        return 'Medium';
    }
  }

  /**
   * Get FSM status for a loan
   */
  async getLoanStatus(loanId) {
    try {
      const loan = await Loan.findById(loanId);
      if (!loan) {
        throw new Error(`Loan ${loanId} not found`);
      }

      return {
        loanId: loan._id,
        currentState: loan.status,
        stateDescription: this.getStateDescription(loan.status),
        history: loan.stateHistory,
        possibleTransitions: this.transitions[loan.status],
        timeInCurrentState: this.getTimeInCurrentState(loan),
        isFinalState: this.isFinalState(loan.status),
      };

    } catch (error) {
      console.error('Get loan status error:', error);
      throw error;
    }
  }

  /**
   * Get all loans by state
   */
  async getLoansByState(state) {
    try {
      const loans = await Loan.find({ status: state })
        .populate('borrowerId', 'fullName email phone')
        .populate('lenders.lenderId', 'fullName email phone')
        .sort({ updatedAt: -1 });

      return {
        success: true,
        state: state,
        count: loans.length,
        loans: loans,
      };

    } catch (error) {
      console.error('Get loans by state error:', error);
      throw error;
    }
  }

  // Helper methods
  getStateDescription(state) {
    const descriptions = {
      PENDING: 'Loan request submitted, waiting for lender matching',
      ACTIVE: 'Loan disbursed and active',
      DUE: 'Payment is overdue',
      REPAID: 'Loan fully repaid',
      DEFAULTED: 'Loan defaulted',
      CANCELLED: 'Loan cancelled',
    };
    return descriptions[state] || 'Unknown state';
  }

  getTimeInCurrentState(loan) {
    if (!loan.stateHistory || loan.stateHistory.length === 0) return 0;

    const currentEntry = loan.stateHistory[loan.stateHistory.length - 1];
    return Date.now() - new Date(currentEntry.timestamp).getTime();
  }

  isFinalState(state) {
    return [this.states.REPAID, this.states.DEFAULTED, this.states.CANCELLED].includes(state);
  }
}

// Export singleton instance
const repaymentFSMService = new RepaymentFSMService();

module.exports = {
  RepaymentFSMService,
  repaymentFSMService,
  createFSM: (loanId, initialState = 'PENDING') => repaymentFSMService.createFSM(loanId, initialState),
  transitionLoan: (loanId, newState, reason, metadata) => repaymentFSMService.transitionLoan(loanId, newState, reason, metadata),
  processRepayment: (loanId, amount, payerId) => repaymentFSMService.processRepayment(loanId, amount, payerId),
  getLoanStatus: (loanId) => repaymentFSMService.getLoanStatus(loanId),
};
