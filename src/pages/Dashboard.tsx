import { GlassCard } from "@/components/ui/glass-card";
import { TrendingUp, Users, DollarSign, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
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

const Dashboard = () => {
  const { user } = useAuth();

  // Different stats based on user role
  const borrowerStats = [
    {
      label: "Total Loans Taken",
      value: "₹1,24,500",
      change: "+12.5%",
      icon: DollarSign,
      color: "text-gold",
    },
    {
      label: "Active Loans",
      value: "3",
      change: "+1",
      icon: Users,
      color: "text-blue-400",
    },
    {
      label: "Repayment Rate",
      value: "96.5%",
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

  const lenderStats = [
    {
      label: "Total Loans Given",
      value: "₹2,45,000",
      change: "+8.2%",
      icon: DollarSign,
      color: "text-gold",
    },
    {
      label: "Active Loans",
      value: "12",
      change: "+3",
      icon: Users,
      color: "text-blue-400",
    },
    {
      label: "Return Rate",
      value: "94.5%",
      change: "+1.2%",
      icon: TrendingUp,
      color: "text-green-400",
    },
    {
      label: "Total Earnings",
      value: "₹18,500",
      change: "+5.3%",
      icon: AlertCircle,
      color: "text-orange-400",
    },
  ];

  const stats = user?.role === "Lender" ? lenderStats : borrowerStats;

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
        <h3 className="text-lg font-semibold mb-4">Recent Loan Activities</h3>
        <div className="space-y-4">
          {user?.role === "Lender"
            ? // Lender activities
              [
                {
                  borrower: "Rajesh Kumar",
                  amount: "₹25,000",
                  status: "Approved",
                  time: "2 hours ago",
                },
                {
                  borrower: "Priya Sharma",
                  amount: "₹15,000",
                  status: "Pending",
                  time: "5 hours ago",
                },
                {
                  borrower: "Amit Patel",
                  amount: "₹30,000",
                  status: "Repaid",
                  time: "1 day ago",
                },
              ].map((activity, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-3 border-b border-glass-border last:border-0"
                >
                  <div>
                    <p className="font-medium">{activity.borrower}</p>
                    <p className="text-sm text-muted-foreground">
                      {activity.time}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gold">{activity.amount}</p>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        activity.status === "Approved"
                          ? "bg-green-500/20 text-green-400"
                          : activity.status === "Pending"
                          ? "bg-orange-500/20 text-orange-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}
                    >
                      {activity.status}
                    </span>
                  </div>
                </div>
              ))
            : // Borrower activities
              [
                {
                  lender: "Ramesh Investments",
                  amount: "₹25,000",
                  status: "Active",
                  time: "2 days ago",
                },
                {
                  lender: "Suresh Capital",
                  amount: "₹15,000",
                  status: "Repaid",
                  time: "1 week ago",
                },
                {
                  lender: "Mahesh Finance",
                  amount: "₹30,000",
                  status: "Pending",
                  time: "3 days ago",
                },
              ].map((activity, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-3 border-b border-glass-border last:border-0"
                >
                  <div>
                    <p className="font-medium">{activity.lender}</p>
                    <p className="text-sm text-muted-foreground">
                      {activity.time}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gold">{activity.amount}</p>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        activity.status === "Active"
                          ? "bg-green-500/20 text-green-400"
                          : activity.status === "Pending"
                          ? "bg-orange-500/20 text-orange-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}
                    >
                      {activity.status}
                    </span>
                  </div>
                </div>
              ))}
        </div>
      </GlassCard>
    </div>
  );
};

export default Dashboard;
