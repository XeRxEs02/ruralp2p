/**
 * Loan Finite State Machine
 * Tracks loan lifecycle from request to completion
 * Handles state transitions and business logic
 */

class LoanFSM {
  constructor(loanId, initialState = 'PENDING') {
    this.loanId = loanId;
    this.currentState = initialState;
    this.states = {
      PENDING: 'Pending Approval',
      APPROVED: 'Approved',
      ACTIVE: 'Active',
      OVERDUE: 'Overdue',
      COMPLETED: 'Completed',
      DEFAULTED: 'Defaulted',
      CANCELLED: 'Cancelled',
    };

    this.transitions = {
      PENDING: ['APPROVED', 'CANCELLED'],
      APPROVED: ['ACTIVE', 'CANCELLED'],
      ACTIVE: ['COMPLETED', 'OVERDUE', 'DEFAULTED'],
      OVERDUE: ['COMPLETED', 'DEFAULTED'],
      COMPLETED: [], // Final state
      DEFAULTED: [], // Final state
      CANCELLED: [], // Final state
    };

    this.history = [{
      state: initialState,
      timestamp: new Date(),
      reason: 'Initial state',
    }];

    console.log(`📊 Loan FSM initialized: ${this.loanId} in ${this.states[initialState]} state`);
  }

  /**
   * Check if a transition is valid
   */
  canTransitionTo(newState) {
    return this.transitions[this.currentState].includes(newState);
  }

  /**
   * Transition to a new state
   */
  transitionTo(newState, reason = '', metadata = {}) {
    if (!this.canTransitionTo(newState)) {
      throw new Error(`Invalid transition from ${this.currentState} to ${newState}`);
    }

    const oldState = this.currentState;
    this.currentState = newState;

    // Record transition in history
    this.history.push({
      from: oldState,
      to: newState,
      state: newState,
      timestamp: new Date(),
      reason: reason,
      metadata: metadata,
    });

    console.log(`🔄 Loan ${this.loanId}: ${this.states[oldState]} → ${this.states[newState]} (${reason})`);

    // Trigger state-specific actions
    this.handleStateActions(newState, metadata);

    return {
      success: true,
      previousState: oldState,
      currentState: newState,
      timestamp: new Date(),
    };
  }

  /**
   * Handle actions specific to each state
   */
  handleStateActions(state, metadata) {
    switch (state) {
      case 'APPROVED':
        this.onLoanApproved(metadata);
        break;
      case 'ACTIVE':
        this.onLoanActivated(metadata);
        break;
      case 'OVERDUE':
        this.onLoanOverdue(metadata);
        break;
      case 'COMPLETED':
        this.onLoanCompleted(metadata);
        break;
      case 'DEFAULTED':
        this.onLoanDefaulted(metadata);
        break;
      case 'CANCELLED':
        this.onLoanCancelled(metadata);
        break;
    }
  }

  /**
   * Approve loan (borrower → lender matching)
   */
  approve(reason = 'Matched with lender', lenderId = null) {
    return this.transitionTo('APPROVED', reason, { lenderId });
  }

  /**
   * Activate loan (disbursement)
   */
  activate(reason = 'Loan disbursed', disbursementAmount = null) {
    return this.transitionTo('ACTIVE', reason, { disbursementAmount });
  }

  /**
   * Mark loan as overdue
   */
  markOverdue(reason = 'Payment overdue', daysOverdue = null) {
    return this.transitionTo('OVERDUE', reason, { daysOverdue });
  }

  /**
   * Complete loan (fully repaid)
   */
  complete(reason = 'Fully repaid', finalAmount = null) {
    return this.transitionTo('COMPLETED', reason, { finalAmount });
  }

  /**
   * Default loan (borrower unable to pay)
   */
  default(reason = 'Borrower defaulted', defaultAmount = null) {
    return this.transitionTo('DEFAULTED', reason, { defaultAmount });
  }

  /**
   * Cancel loan
   */
  cancel(reason = 'Loan cancelled', cancelledBy = null) {
    return this.transitionTo('CANCELLED', reason, { cancelledBy });
  }

  /**
   * Process payment and update state accordingly
   */
  processPayment(paymentAmount, totalOwed, isOnTime = true) {
    const remainingAmount = totalOwed - paymentAmount;

    if (remainingAmount <= 0) {
      return this.complete('Fully repaid', paymentAmount);
    }

    if (!isOnTime && this.currentState === 'ACTIVE') {
      return this.markOverdue('Late payment', 1);
    }

    return {
      success: true,
      remainingAmount,
      currentState: this.currentState,
      message: 'Payment processed, loan still active',
    };
  }

  /**
   * Get current state info
   */
  getStateInfo() {
    return {
      loanId: this.loanId,
      currentState: this.currentState,
      stateDescription: this.states[this.currentState],
      history: this.history,
      possibleTransitions: this.transitions[this.currentState],
    };
  }

  /**
   * Check if loan is in a final state
   */
  isFinalState() {
    return ['COMPLETED', 'DEFAULTED', 'CANCELLED'].includes(this.currentState);
  }

  /**
   * Get time in current state
   */
  getTimeInCurrentState() {
    const currentEntry = this.history.find(entry => entry.state === this.currentState);
    return currentEntry ? Date.now() - new Date(currentEntry.timestamp).getTime() : 0;
  }

  // State action handlers
  onLoanApproved(metadata) {
    console.log(`✅ Loan ${this.loanId} approved by lender ${metadata.lenderId}`);
  }

  onLoanActivated(metadata) {
    console.log(`💰 Loan ${this.loanId} activated, amount disbursed: ₹${metadata.disbursementAmount}`);
  }

  onLoanOverdue(metadata) {
    console.log(`⚠️ Loan ${this.loanId} is overdue by ${metadata.daysOverdue} days`);
  }

  onLoanCompleted(metadata) {
    console.log(`🎉 Loan ${this.loanId} completed successfully, final amount: ₹${metadata.finalAmount}`);
  }

  onLoanDefaulted(metadata) {
    console.log(`❌ Loan ${this.loanId} defaulted, amount: ₹${metadata.defaultAmount}`);
  }

  onLoanCancelled(metadata) {
    console.log(`🚫 Loan ${this.loanId} cancelled by ${metadata.cancelledBy}`);
  }
}

/**
 * Loan State Machine Manager
 * Manages multiple loan FSMs
 */
class LoanFSMManager {
  constructor() {
    this.fsms = new Map();
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

  /**
   * Process loan lifecycle event
   */
  processEvent(loanId, event, data = {}) {
    const fsm = this.getFSM(loanId);
    if (!fsm) {
      throw new Error(`No FSM found for loan ${loanId}`);
    }

    switch (event) {
      case 'APPROVE':
        return fsm.approve(data.reason, data.lenderId);
      case 'ACTIVATE':
        return fsm.activate(data.reason, data.amount);
      case 'PAYMENT':
        return fsm.processPayment(data.amount, data.totalOwed, data.onTime);
      case 'OVERDUE':
        return fsm.markOverdue(data.reason, data.daysOverdue);
      case 'COMPLETE':
        return fsm.complete(data.reason, data.amount);
      case 'DEFAULT':
        return fsm.default(data.reason, data.amount);
      case 'CANCEL':
        return fsm.cancel(data.reason, data.cancelledBy);
      default:
        throw new Error(`Unknown event: ${event}`);
    }
  }

  /**
   * Get all FSMs status
   */
  getAllStatus() {
    const status = {};
    for (const [loanId, fsm] of this.fsms) {
      status[loanId] = fsm.getStateInfo();
    }
    return status;
  }

  /**
   * Clean up completed FSMs
   */
  cleanupCompleted() {
    for (const [loanId, fsm] of this.fsms) {
      if (fsm.isFinalState()) {
        this.fsms.delete(loanId);
        console.log(`🧹 Cleaned up FSM for completed loan: ${loanId}`);
      }
    }
  }
}

// Export singleton instance
const loanFSMManager = new LoanFSMManager();

module.exports = {
  LoanFSM,
  LoanFSMManager,
  loanFSMManager,
};
