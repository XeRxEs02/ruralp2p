import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { GlassCard } from '@/components/ui/glass-card';
import { enhancedLoanApi } from '@/lib/api';
import { toast } from 'sonner';
import { DollarSign, Calendar, Percent, FileText, Loader2, CheckCircle, XCircle } from 'lucide-react';

const IssueLoan = () => {
  const [formData, setFormData] = useState({
    amount: '',
    duration: '',
    interestRate: '',
    purpose: '',
  });
  const [loading, setLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [matchingInfo, setMatchingInfo] = useState<{
    matched: boolean;
    lenders: number;
    compatibilityScore: number;
  } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.amount || !formData.duration || !formData.interestRate || !formData.purpose) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    setSubmitStatus('idle');

    try {
      const response = await enhancedLoanApi.create({
        totalAmount: parseFloat(formData.amount),
        duration: parseInt(formData.duration),
        averageInterestRate: parseFloat(formData.interestRate),
        purpose: formData.purpose,
      });

      if (response.success) {
        setSubmitStatus('success');
        setMatchingInfo((response.data as any)?.matching);
        toast.success('Loan request submitted and matched successfully!');

        // Reset form after success
        setTimeout(() => {
          setFormData({ amount: '', duration: '', interestRate: '', purpose: '' });
          setSubmitStatus('idle');
          setMatchingInfo(null);
        }, 3000);
      } else {
        setSubmitStatus('error');
        toast.error(response.error || 'Failed to submit loan request');
      }
    } catch (error) {
      setSubmitStatus('error');
      toast.error('Network error occurred');
    }

    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gold-gradient mb-2">Issue New Loan</h1>
        <p className="text-muted-foreground">Create a new loan request for borrowers</p>
      </div>

      <GlassCard>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="amount" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gold" />
              Loan Amount (₹)
            </Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              placeholder="25000"
              value={formData.amount}
              onChange={handleChange}
              className="glass-panel border-glass-border focus:border-gold"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration" className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gold" />
                Duration (months)
              </Label>
              <Input
                id="duration"
                name="duration"
                type="number"
                placeholder="12"
                value={formData.duration}
                onChange={handleChange}
                className="glass-panel border-glass-border focus:border-gold"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="interestRate" className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-gold" />
                Interest Rate (%)
              </Label>
              <Input
                id="interestRate"
                name="interestRate"
                type="number"
                step="0.1"
                placeholder="8.5"
                value={formData.interestRate}
                onChange={handleChange}
                className="glass-panel border-glass-border focus:border-gold"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purpose" className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gold" />
              Loan Purpose
            </Label>
            <Textarea
              id="purpose"
              name="purpose"
              placeholder="Describe the purpose of this loan..."
              value={formData.purpose}
              onChange={handleChange}
              className="glass-panel border-glass-border focus:border-gold min-h-32"
              required
            />
          </div>

          <div className="glass-panel p-4 rounded-lg space-y-2">
            <h3 className="font-semibold">Loan Summary</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Principal Amount</p>
                <p className="font-semibold text-gold">₹{formData.amount || '0'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Interest</p>
                <p className="font-semibold text-gold">
                  ₹{formData.amount && formData.interestRate && formData.duration
                    ? ((parseFloat(formData.amount) * parseFloat(formData.interestRate) * parseInt(formData.duration)) / (12 * 100)).toFixed(2)
                    : '0'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Repayment</p>
                <p className="font-semibold text-gold">
                  ₹{formData.amount && formData.interestRate && formData.duration
                    ? (parseFloat(formData.amount) + (parseFloat(formData.amount) * parseFloat(formData.interestRate) * parseInt(formData.duration)) / (12 * 100)).toFixed(2)
                    : '0'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Monthly EMI</p>
                <p className="font-semibold text-gold">
                  ₹{formData.amount && formData.interestRate && formData.duration
                    ? ((parseFloat(formData.amount) + (parseFloat(formData.amount) * parseFloat(formData.interestRate) * parseInt(formData.duration)) / (12 * 100)) / parseInt(formData.duration)).toFixed(2)
                    : '0'}
                </p>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-gold-gradient hover:opacity-90 text-background font-semibold"
            disabled={loading}
          >
            {loading ? 'Submitting...' : 'Submit Loan Request'}
          </Button>
        </form>
      </GlassCard>
    </div>
  );
};

export default IssueLoan;
