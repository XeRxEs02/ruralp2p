import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GlassCard } from '@/components/ui/glass-card';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Sparkles, User, Mail, Phone, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const Signup = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: 'Borrower',
    aadharNumber: '',
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.fullName || !formData.email || !formData.phone || !formData.role || !formData.aadharNumber) {
      toast.error('Please fill in all fields');
      return;
    }

    // Client-side validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(formData.phone)) {
      toast.error('Phone number must be exactly 10 digits');
      return;
    }

    const aadharRegex = /^\d{12}$/;
    if (!aadharRegex.test(formData.aadharNumber.replace(/\s/g, ''))) {
      toast.error('Aadhar number must be exactly 12 digits');
      return;
    }

    setLoading(true);

    try {
      // Add country code to phone number for backend
      const registrationData = {
        ...formData,
        phone: `+91${formData.phone}`,
      };

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData),
      });

      const data = await response.json();
      if (data.success) {
        localStorage.setItem('userEmail', formData.email);  // Store email
        localStorage.setItem('userId', data.data.userId);  // Store userId
        toast.success('Personal details submitted! Proceed to face verification.');
        navigate('/face-verification');
      } else {
        toast.error(data.error || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('Registration error: ' + (error.message || 'Network error'));
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute w-96 h-96 bg-gold/10 rounded-full blur-3xl top-0 right-0 animate-float" />
        <div className="absolute w-96 h-96 bg-gold/5 rounded-full blur-3xl bottom-0 left-0 animate-float" style={{ animationDelay: '2s' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <GlassCard className="space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-full bg-gold-gradient flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-background" />
            </div>
            <h1 className="text-3xl font-bold text-gold-gradient">Step 1: Personal Details</h1>
            <p className="text-muted-foreground">Enter your basic information</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="flex items-center gap-2">
                <User className="w-4 h-4 text-gold" />
                Full Name
              </Label>
              <Input
                id="fullName"
                name="fullName"
                placeholder="John Doe"
                value={formData.fullName}
                onChange={handleChange}
                className="glass-panel border-glass-border focus:border-gold"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gold" />
                Email Address
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                className="glass-panel border-glass-border focus:border-gold"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gold" />
                Phone Number
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="1234567890"
                value={formData.phone}
                onChange={handleChange}
                className="glass-panel border-glass-border focus:border-gold"
                required
                maxLength={10}
              />
              <p className="text-xs text-muted-foreground">Enter 10-digit phone number</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full p-3 glass-panel border-glass-border focus:border-gold rounded-lg"
                required
              >
                <option
                  value="Borrower"
                  className="bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
                >
                  Borrower
                </option>
                <option
                  value="Lender"
                  className="bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                >
                  Lender
                </option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="aadharNumber">Aadhar Number</Label>
              <Input
                id="aadharNumber"
                name="aadharNumber"
                type="tel"
                placeholder="123456789012"
                value={formData.aadharNumber}
                onChange={handleChange}
                className="glass-panel border-glass-border focus:border-gold"
                required
                maxLength={12}
              />
              <p className="text-xs text-muted-foreground">Enter 12-digit Aadhar number</p>
            </div>

            <Button
              type="submit"
              className="w-full bg-gold-gradient hover:opacity-90 text-background font-semibold"
              disabled={loading}
            >
              {loading ? 'Submitting...' : 'Proceed to Face Verification'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-gold hover:underline">
              Sign in
            </Link>
          </p>
        </GlassCard>
      </motion.div>
    </div>
  );
};

export default Signup;
