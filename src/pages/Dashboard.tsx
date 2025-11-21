import { GlassCard } from "@/components/ui/glass-card";
import { TrendingUp, Users, DollarSign, AlertCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { loanApi } from "@/lib/api";
import { toast } from "sonner";

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      // Fetch user's loans
      const loansResponse = user?.role === "Lender"
        ? await loanApi.getAll() // Lenders see all loans they're involved in
        : await loanApi.getBorrowerLoans(user?.id || ''); // Borrowers see their own loans

      let userLoans = [];
      if (loansResponse.success && loansResponse.data) {
        const responseData = loansResponse.data as any;
        userLoans = Array.isArray(responseData) ? responseData :
                   (responseData && Array.isArray(responseData.data)) ? responseData.data :
                   (responseData && Array.isArray(responseData.loans)) ? responseData.loans : [];
      }

      setLoans(userLoans);

      // Calculate stats based on real data
      const calculatedStats = calculateStats(userLoans, user?.role);
      setStats(calculatedStats);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (userLoans: any[], userRole?: string) => {
    if (userRole === "Lender") {
      // Calculate lender stats
      const totalGiven = userLoans.reduce((sum, loan) => {
        const lenderPortion = loan.lenders?.find((l: any) => l.lenderId === user?.id);
        return sum + (lenderPortion?.amount || 0);
      }, 0);

      const activeLoans = userLoans.filter(loan =>
        loan.status === 'ACTIVE' || loan.status === 'PENDING'
      ).length;

      const repaidLoans = userLoans.filter(loan => loan.status === 'REPAID').length;
      const totalLoans = userLoans.length;
      const returnRate = totalLoans > 0 ? ((repaidLoans / totalLoans) * 100).toFixed(1) : '0.0';

      return [
        {
          label: "Total Loans Given",
          value: `₹${totalGiven.toLocaleString()}`,
          change: "+8.2%",
          icon: DollarSign,
          color: "text-gold",
        },
        {
          label: "Active Loans",
          value: activeLoans.toString(),
          change: `+${activeLoans}`,
          icon: Users,
          color: "text-blue-400",
        },
        {
          label: "Return Rate",
          value: `${returnRate}%`,
          change: "+1.2%",
          icon: TrendingUp,
          color: "text-green-400",
        },
        {
          label: "Total Earnings",
          value: `₹${(totalGiven * 0.08).toLocaleString()}`, // Assuming 8% interest
          change: "+5.3%",
          icon: AlertCircle,
          color: "text-orange-400",
        },
      ];
    } else {
      // Calculate borrower stats
      const totalTaken = userLoans.reduce((sum, loan) => sum + (loan.totalAmount || 0), 0);
      const activeLoans = userLoans.filter(loan =>
        loan.status === 'ACTIVE' || loan.status === 'PENDING'
      ).length;

      const repaidLoans = userLoans.filter(loan => loan.status === 'REPAID').length;
      const totalLoans = userLoans.length;
      const repaymentRate = totalLoans > 0 ? ((repaidLoans / totalLoans) * 100).toFixed(1) : '0.0';

      return [
        {
          label: "Total Loans Taken",
          value: `₹${totalTaken.toLocaleString()}`,
          change: "+12.5%",
          icon: DollarSign,
          color: "text-gold",
        },
        {
          label: "Active Loans",
          value: activeLoans.toString(),
          change: `+${activeLoans}`,
          icon: Users,
          color: "text-blue-400",
        },
        {
          label: "Repayment Rate",
          value: `${repaymentRate}%`,
          change: "+2.1%",
          icon: TrendingUp,
          color: "text-green-400",
        },
        {
          label: "Credit Score",
          value: "780",
          change: "+15",
          icon: AlertCircle,
          color: "text-orange-400",
        },
      ];
    }
  };

  const loanData = [
    { month: "Jan", amount: 45000 },
    { month: "Feb", amount: 52000 },
    { month: "Mar", amount: 48000 },
    { month: "Apr", amount: 61000 },
    { month: "May", amount: 55000 },
    { month: "Jun", amount: 67000 },
  ];

  const repaymentData = [
    { month: "Jan", rate: 94 },
    { month: "Feb", rate: 95 },
    { month: "Mar", rate: 93 },
    { month: "Apr", rate: 96 },
    { month: "May", rate: 97 },
    { month: "Jun", rate: 96.5 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gold-gradient mb-2">
            {user?.role === "Lender"
              ? "Lender Dashboard"
              : "Borrower Dashboard"}
          </h1>
          <p className="text-muted-foreground">
            Welcome, {user?.fullName}! You are logged in as a {user?.role}.
          </p>
        </div>
        {user && (
          <Badge
            className={
              user.role === "Lender"
                ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                : "bg-green-500/20 text-green-400 border-green-500/30"
            }
          >
            {user.role}
          </Badge>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <GlassCard className="space-y-2">
              <div className="flex items-center justify-between">
                <stat.icon className={`w-8 h-8 ${stat.color}`} />
                <span
                  className={`text-sm font-medium ${
                    stat.change.startsWith("+")
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {stat.change}
                </span>
              </div>
              <div>
                <p className="text-3xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard>
          <h3 className="text-lg font-semibold mb-4">
            {user?.role === "Lender"
              ? "Loan Disbursement Trend"
              : "Loan Utilization Trend"}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={loanData}>
              <defs>
                <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(43, 74%, 49%)"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(43, 74%, 49%)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.1)"
              />
              <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" />
              <YAxis stroke="rgba(255,255,255,0.5)" />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="hsl(43, 74%, 49%)"
                fill="url(#colorAmount)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard>
          <h3 className="text-lg font-semibold mb-4">
            {user?.role === "Lender" ? "Return Rate" : "Repayment Rate"}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={repaymentData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.1)"
              />
              <XAxis dataKey="month" stroke="rgba(255,255,255,0.5)" />
              <YAxis stroke="rgba(255,255,255,0.5)" domain={[90, 100]} />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="hsl(142, 76%, 50%)"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      {/* Recent Activity */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Loan Activities</h3>
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="text-sm text-gold hover:text-gold/80 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </button>
        </div>
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span>Loading activities...</span>
            </div>
          ) : loans.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No loan activities yet</p>
          ) : (
            loans.slice(0, 5).map((loan: any, index) => {
              const timeAgo = new Date(loan.createdAt).toLocaleDateString();
              const statusColor = loan.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                                 loan.status === 'PENDING' ? 'bg-orange-500/20 text-orange-400' :
                                 'bg-blue-500/20 text-blue-400';

              return (
                <div
                  key={loan._id}
                  className="flex items-center justify-between py-3 border-b border-glass-border last:border-0"
                >
                  <div>
                    <p className="font-medium">
                      {user?.role === "Lender"
                        ? loan.borrowerId?.fullName || 'Unknown Borrower'
                        : loan.lenders?.[0]?.lenderId?.fullName || 'Multiple Lenders'
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {timeAgo}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gold">₹{loan.totalAmount?.toLocaleString()}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${statusColor}`}>
                      {loan.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </GlassCard>
    </div>
  );
};

export default Dashboard;
