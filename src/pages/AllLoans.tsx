import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { loanApi } from '@/lib/api';
import { Search, Filter, Eye } from 'lucide-react';
import { motion } from 'framer-motion';

interface Loan {
  _id: string;
  borrowerId: {
    fullName: string;
  };
  totalAmount: number;
  duration: number;
  averageInterestRate: number;
  status: string;
  createdAt: string;
}

const AllLoans = () => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchLoans();
  }, [filter]);

  const fetchLoans = async () => {
    setLoading(true);
    try {
      const response = await loanApi.getAll(filter !== 'all' ? { status: filter } : undefined);
      console.log('Loans API response:', response); // Debug log
      if (response.success && response.data) {
        // Handle different response formats
        const responseData = response.data as any;
        const loansData = Array.isArray(responseData) ? responseData :
                         (responseData && Array.isArray(responseData.data)) ? responseData.data :
                         (responseData && Array.isArray(responseData.loans)) ? responseData.loans : [];
        setLoans(loansData as Loan[]);
      } else {
        console.error('Failed to fetch loans:', response.error || 'Invalid response format', response);
        setLoans([]);
      }
    } catch (error) {
      console.error('Error fetching loans:', error);
      setLoans([]);
    }
    setLoading(false);
  };

  const filteredLoans = loans.filter(loan =>
    loan.borrowerId.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    loan._id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'Pending': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'Completed': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gold-gradient mb-2">All Loans</h1>
          <p className="text-muted-foreground">Manage and track all loan applications</p>
        </div>
        <Button variant="outline" className="border-gold/50 text-gold hover:bg-gold/20">
          <Filter className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      <GlassCard>
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by borrower name or loan ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 glass-panel border-glass-border"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'Active', 'Pending', 'Completed'].map((status) => (
              <Button
                key={status}
                variant="outline"
                size="sm"
                onClick={() => setFilter(status.toLowerCase())}
                className={filter === status.toLowerCase() ? 'bg-gold/20 border-gold/50 text-gold' : 'border-glass-border'}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Loading loans...</p>
          ) : filteredLoans.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No loans found</p>
          ) : (
            filteredLoans.map((loan, index) => (
              <motion.div
                key={loan._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                className="glass-panel p-4 rounded-lg hover:border-gold/30 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg">{loan.borrowerId.fullName}</h3>
                      <Badge className={getStatusColor(loan.status)}>{loan.status}</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Loan ID</p>
                        <p className="font-medium font-mono">{loan._id}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Amount</p>
                        <p className="font-semibold text-gold">₹{loan.totalAmount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Duration</p>
                        <p className="font-medium">{loan.duration} months</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Interest Rate</p>
                        <p className="font-medium">{loan.averageInterestRate}%</p>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon">
                    <Eye className="w-5 h-5" />
                  </Button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </GlassCard>
    </div>
  );
};

export default AllLoans;
