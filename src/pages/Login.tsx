import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { LogIn, User, Lock, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const Login = () => {
  const [formData, setFormData] = useState({
    uniqueId: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.uniqueId || !formData.password) {
      toast.error("Please enter unique ID and password");
      return;
    }

    setLoading(true);

    try {
      // Use the auth context login function instead of direct fetch
      const success = await login({
        email: formData.uniqueId,
        password: formData.password,
      });

      if (success) {
        navigate("/dashboard");
      }
    } catch (error) {
      toast.error("Login error");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute w-96 h-96 bg-gold/10 rounded-full blur-3xl top-0 right-0 animate-float" />
        <div
          className="absolute w-96 h-96 bg-gold/5 rounded-full blur-3xl bottom-0 left-0 animate-float"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <GlassCard className="space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 mx-auto rounded-full bg-gold-gradient flex items-center justify-center mb-4">
              <LogIn className="w-8 h-8 text-background" />
            </div>
            <h1 className="text-3xl font-bold text-gold-gradient">Login</h1>
            <p className="text-muted-foreground">
              Enter your unique ID and password
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="uniqueId" className="flex items-center gap-2">
                <User className="w-4 h-4 text-gold" />
                Unique ID
              </Label>
              <Input
                id="uniqueId"
                name="uniqueId"
                placeholder="Enter your unique ID"
                value={formData.uniqueId}
                onChange={handleChange}
                className="glass-panel border-glass-border focus:border-gold"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-gold" />
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                className="glass-panel border-glass-border focus:border-gold"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-gold-gradient hover:opacity-90 text-background font-semibold"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Complete signup process to get your unique ID and password.
          </p>
        </GlassCard>
      </motion.div>
    </div>
  );
};

export default Login;
