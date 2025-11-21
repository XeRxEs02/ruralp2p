import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GlassCard } from '@/components/ui/glass-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CreditCard, AlertCircle, CheckCircle, Loader2, Smartphone, Shield, Check, ArrowRight, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { loanApi } from '@/lib/api';

interface Loan {
  _id: string;
  totalAmount: number;
  duration: number;
  averageInterestRate: number;
  status: string;
  totalRepaidAmount?: number;
  createdAt: string;
  lenders?: Array<{
    lenderId: {
      fullName: string;
    };
    amount: number;
    status: string;
  }>;
}

const RepayLoan = () => {
  const { user } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [selectedLoan, setSelectedLoan] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingLoans, setFetchingLoans] = useState(true);
  const [showPaymentSimulation, setShowPaymentSimulation] = useState(false);
  const [paymentStep, setPaymentStep] = useState(0);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [accountId, setAccountId] = useState('');
  const [otp, setOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [isOtpVerified, setIsOtpVerified] = useState(false);

  useEffect(() => {
    fetchBorrowerLoans();
  }, []);

  const fetchBorrowerLoans = async () => {
    try {
      setFetchingLoans(true);
      if (!user?.id) {
        setLoans([]);
        return;
      }

      const response = await loanApi.getBorrowerLoans(user.id);
      console.log('Borrower loans API response:', response); // Debug log
      if (response.success && response.data) {
        // Handle different response formats
        const responseData = response.data as any;
        const loansData = Array.isArray(responseData) ? responseData :
                         (responseData && Array.isArray(responseData.data)) ? responseData.data :
                         (responseData && Array.isArray(responseData.loans)) ? responseData.loans : [];

        // Filter only active loans that need repayment
        const activeLoans = loansData.filter((loan: Loan) =>
          ['ACTIVE', 'PENDING'].includes(loan.status) &&
          (loan.totalRepaidAmount || 0) < calculateTotalOwed(loan)
        );
        setLoans(activeLoans);
      } else {
        console.error('Failed to fetch loans:', response.error || 'Invalid response', response);
        setLoans([]);
      }
    } catch (error) {
      console.error('Error fetching loans:', error);
      toast.error('Failed to load loans');
      setLoans([]);
    } finally {
      setFetchingLoans(false);
    }
  };

  const calculateTotalOwed = (loan: Loan) => {
    return loan.totalAmount + (loan.totalAmount * loan.averageInterestRate / 100);
  };

  const calculateRemainingAmount = (loan: Loan) => {
    const totalOwed = calculateTotalOwed(loan);
    const repaid = loan.totalRepaidAmount || 0;
    return Math.max(0, totalOwed - repaid);
  };

  const getSelectedLoan = () => {
    return loans.find(loan => loan._id === selectedLoan);
  };

  const validateRepayment = () => {
    if (!selectedLoan) {
      toast.error('Please select a loan to repay');
      return false;
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid repayment amount');
      return false;
    }

    const loan = getSelectedLoan();
    if (!loan) {
      toast.error('Selected loan not found');
      return false;
    }

    const remainingAmount = calculateRemainingAmount(loan);
    const repaymentAmount = parseFloat(amount);

    if (repaymentAmount > remainingAmount) {
      toast.error(`Repayment amount cannot exceed remaining balance of ₹${remainingAmount.toLocaleString()}`);
      return false;
    }

    if (repaymentAmount < 100) {
      toast.error('Minimum repayment amount is ₹100');
      return false;
    }

    return true;
  };

  const startPaymentSimulation = async () => {
    if (!validateRepayment()) return;

    const loan = getSelectedLoan();
    if (!loan) return;

    setLoading(true);
    try {
      // Initiate payment on backend
      const response = await fetch('/api/payments/repayment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({
          loanId: selectedLoan,
          amount: parseFloat(amount),
          repaymentType: parseFloat(amount) >= calculateRemainingAmount(loan) ? 'full_repayment' : 'emi_payment',
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPaymentData(data.data);
        setShowPaymentSimulation(true);
        setPaymentStep(0);
        setLoading(false);

        // Start the payment simulation steps
        simulatePaymentSteps(data.data);
      } else {
        toast.error(data.error || 'Failed to initiate repayment');
        setLoading(false);
      }
    } catch (error) {
      console.error('Repayment error:', error);
      toast.error('Failed to process repayment');
      setLoading(false);
    }
  };

  const simulatePaymentSteps = async (data: any) => {
    const steps = [
      { delay: 1000, step: 1 }, // Account verification
      { delay: 2000, step: 2 }, // Amount confirmation
      { delay: 3000, step: 3 }, // OTP generation
      { delay: 4000, step: 4 }, // OTP verification
      { delay: 5000, step: 5 }, // Payment processing
      { delay: 6000, step: 6 }, // Success confirmation
    ];

    for (const { delay, step } of steps) {
      setTimeout(() => {
        setPaymentStep(step);
        if (step === 6) {
          // Final step - complete the payment
          completePayment(data);
        }
      }, delay);
    }
  };

  const completePayment = async (data: any) => {
    try {
      // Use mock payment details for confirmation
      const mockPaymentId = data.testCredentials?.test_payment_id || `pay_mock_${Date.now()}`;
      const mockSignature = data.testCredentials?.test_signature || `mock_sig_${Date.now()}`;

      const confirmResponse = await fetch('/api/payments/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({
          razorpay_order_id: data.orderId,
          razorpay_payment_id: mockPaymentId,
          razorpay_signature: mockSignature,
          transactionId: data.transactionId,
        }),
      });

      const confirmData = await confirmResponse.json();

      if (confirmData.success) {
        setTimeout(() => {
          setShowPaymentSimulation(false);
          toast.success(`₹${parseFloat(amount).toLocaleString()} repayment processed successfully!`, {
            description: `Loan #${selectedLoan.slice(-6)} - Transaction ID: ${data.transactionId}`,
            duration: 5000,
          });
          setAmount('');
          setSelectedLoan('');
          fetchBorrowerLoans(); // Refresh loans
        }, 1000);
      } else {
        setShowPaymentSimulation(false);
        toast.error('Payment confirmation failed');
      }
    } catch (error) {
      console.error('Payment confirmation error:', error);
      setShowPaymentSimulation(false);
      toast.error('Payment confirmation failed');
    }
  };

  const validateAccountId = () => {
    if (!accountId.trim()) {
      toast.error('Please enter your account ID');
      return false;
    }
    if (accountId.length < 8) {
      toast.error('Account ID must be at least 8 characters');
      return false;
    }
    return true;
  };

  const generateOtp = () => {
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(newOtp);
    toast.success('OTP sent to your registered mobile number');
    return newOtp;
  };

  const verifyOtp = () => {
    if (!otp.trim()) {
      toast.error('Please enter the OTP');
      return false;
    }
    if (otp !== generatedOtp) {
      toast.error('Invalid OTP. Please try again.');
      return false;
    }
    setIsOtpVerified(true);
    toast.success('OTP verified successfully');
    return true;
  };

  const nextStep = () => {
    if (paymentStep === 0) {
      // Account verification step
      if (!validateAccountId()) return;
      setPaymentStep(1);
    } else if (paymentStep === 1) {
      // Amount confirmation step - user confirms amount
      setPaymentStep(2);
    } else if (paymentStep === 2) {
      // OTP generation step
      generateOtp();
      setPaymentStep(3);
    } else if (paymentStep === 3) {
      // OTP verification step
      if (!verifyOtp()) return;
      setPaymentStep(4);
    } else if (paymentStep === 4) {
      // Processing payment step
      setPaymentStep(5);
      // Auto-complete payment after a delay
      setTimeout(() => {
        completePayment(paymentData);
      }, 3000);
    }
  };

  const renderPaymentStep = () => {
    const steps = [
      {
        title: "Account Verification",
        description: "Enter your account details",
        icon: <Shield className="w-6 h-6" />,
        color: "text-blue-500"
      },
      {
        title: "Amount Confirmation",
        description: `Confirm ₹${parseFloat(amount).toLocaleString()} payment`,
        icon: <Banknote className="w-6 h-6" />,
        color: "text-green-500"
      },
      {
        title: "OTP Generation",
        description: "Generate secure OTP",
        icon: <Smartphone className="w-6 h-6" />,
        color: "text-purple-500"
      },
      {
        title: "OTP Verification",
        description: "Enter OTP to verify",
        icon: <Check className="w-6 h-6" />,
        color: "text-orange-500"
      },
      {
        title: "Processing Payment",
        description: "Processing your payment securely",
        icon: <CreditCard className="w-6 h-6" />,
        color: "text-indigo-500"
      },
      {
        title: "Payment Successful",
        description: "Payment completed successfully!",
        icon: <CheckCircle className="w-6 h-6" />,
        color: "text-green-600"
      }
    ];

    const currentStep = steps[paymentStep] || steps[0];

    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-gold/10 mb-4 ${currentStep.color}`}>
            {currentStep.icon}
          </div>
          <h3 className="text-lg font-semibold mb-2">{currentStep.title}</h3>
          <p className="text-muted-foreground">{currentStep.description}</p>
        </div>

        {/* Step Content */}
        <div className="space-y-4">
          {paymentStep === 0 && (
            <div className="space-y-3">
              <Label htmlFor="accountId">Account ID</Label>
              <Input
                id="accountId"
                type="text"
                placeholder="Enter your account ID"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="glass-panel border-glass-border"
              />
              <p className="text-xs text-muted-foreground">
                Enter your registered account ID (minimum 8 characters)
              </p>
            </div>
          )}

          {paymentStep === 1 && (
            <div className="bg-gold/10 border border-gold/20 rounded-lg p-4 space-y-3">
              <h4 className="font-medium">Payment Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Loan ID:</span>
                  <span>#{selectedLoan.slice(-6)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span className="font-medium text-gold">₹{parseFloat(amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Account ID:</span>
                  <span>{accountId}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Please confirm the payment details above
              </p>
            </div>
          )}

          {paymentStep === 2 && (
            <div className="text-center space-y-3">
              <Smartphone className="w-12 h-12 text-purple-500 mx-auto" />
              <p className="text-sm">Click below to generate OTP</p>
            </div>
          )}

          {paymentStep === 3 && (
            <div className="space-y-3">
              <Label htmlFor="otp">Enter OTP</Label>
              <Input
                id="otp"
                type="text"
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="glass-panel border-glass-border text-center text-lg tracking-widest"
                maxLength={6}
              />
              <p className="text-xs text-muted-foreground text-center">
                OTP sent to your registered mobile number
              </p>
              {generatedOtp && (
                <p className="text-xs text-center text-red-500">
                  Demo OTP: {generatedOtp}
                </p>
              )}
            </div>
          )}

          {paymentStep === 4 && (
            <div className="text-center space-y-3">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold mx-auto"></div>
              <p className="text-sm">Processing your payment securely...</p>
              <p className="text-xs text-muted-foreground">
                Please do not close this window
              </p>
            </div>
          )}

          {paymentStep === 5 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-green-800 font-medium">Payment Completed Successfully!</p>
              <p className="text-green-600 text-sm mt-1">
                ₹{parseFloat(amount).toLocaleString()} has been deducted from your account
              </p>
            </div>
          )}
        </div>

        {/* Step Navigation */}
        {paymentStep < 5 && (
          <Button
            onClick={nextStep}
            className="w-full bg-gold-gradient hover:opacity-90 text-background font-semibold"
            disabled={paymentStep === 4}
          >
            {paymentStep === 0 && 'Verify Account'}
            {paymentStep === 1 && 'Confirm Payment'}
            {paymentStep === 2 && 'Generate OTP'}
            {paymentStep === 3 && 'Verify OTP'}
            {paymentStep === 4 && 'Processing...'}
          </Button>
        )}

        {/* Step Indicator */}
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={index} className="flex items-center space-x-3">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                index < paymentStep ? 'bg-green-500 text-white' :
                index === paymentStep ? 'bg-gold text-white' :
                'bg-gray-200 text-gray-400'
              }`}>
                {index < paymentStep ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span className="text-xs font-medium">{index + 1}</span>
                )}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  index <= paymentStep ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {step.title}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const selectedLoanData = getSelectedLoan();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gold-gradient mb-2">Repay Loan</h1>
        <p className="text-muted-foreground">Make a secure loan repayment with real-time processing</p>
      </div>

      <GlassCard className="space-y-6">
        {fetchingLoans ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>Loading your loans...</span>
          </div>
        ) : loans.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No active loans requiring repayment</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Select Loan to Repay</Label>
              <Select value={selectedLoan} onValueChange={setSelectedLoan}>
                <SelectTrigger className="glass-panel border-glass-border">
                  <SelectValue placeholder="Choose a loan to repay" />
                </SelectTrigger>
                <SelectContent className="glass-panel border-glass-border">
                  {loans.map((loan) => {
                    const remaining = calculateRemainingAmount(loan);
                    return (
                      <SelectItem key={loan._id} value={loan._id}>
                        <div className="flex justify-between items-center w-full">
                          <span>Loan #{loan._id.slice(-6)}</span>
                          <span className="text-sm text-muted-foreground">
                            ₹{remaining.toLocaleString()} remaining
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {selectedLoanData && (
              <div className="bg-gold/10 border border-gold/20 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-sm">Loan Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Amount</p>
                    <p className="font-medium">₹{selectedLoanData.totalAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Interest Rate</p>
                    <p className="font-medium">{selectedLoanData.averageInterestRate}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Duration</p>
                    <p className="font-medium">{selectedLoanData.duration} months</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Remaining Balance</p>
                    <p className="font-medium text-gold">
                      ₹{calculateRemainingAmount(selectedLoanData).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">Repayment Amount (₹)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter repayment amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="glass-panel border-glass-border"
                min="100"
                max={selectedLoanData ? calculateRemainingAmount(selectedLoanData) : undefined}
              />
              <p className="text-xs text-muted-foreground">
                Minimum: ₹100 | Maximum: ₹{selectedLoanData ? calculateRemainingAmount(selectedLoanData).toLocaleString() : '0'}
              </p>
            </div>

            <Button
              onClick={startPaymentSimulation}
              disabled={loading || !selectedLoan || !amount}
              className="w-full bg-gold-gradient hover:opacity-90 text-background font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing Payment...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Process Secure Repayment
                </>
              )}
            </Button>

            <div className="text-xs text-muted-foreground space-y-1">
              <p className="flex items-center">
                <CheckCircle className="w-3 h-3 mr-1 text-green-500" />
                Secure payment processing with Razorpay
              </p>
              <p className="flex items-center">
                <CheckCircle className="w-3 h-3 mr-1 text-green-500" />
                Real-time blockchain transaction recording
              </p>
              <p className="flex items-center">
                <CheckCircle className="w-3 h-3 mr-1 text-green-500" />
                Instant notifications to all stakeholders
              </p>
            </div>
          </>
        )}
      </GlassCard>

      {/* Payment Simulation Dialog */}
      <Dialog open={showPaymentSimulation} onOpenChange={setShowPaymentSimulation}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Processing Payment</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {renderPaymentStep()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RepayLoan;
