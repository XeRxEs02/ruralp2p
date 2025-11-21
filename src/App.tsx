import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import RoleGate from "./components/RoleGate";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import FaceVerification from "./pages/FaceVerification";
import OTPVerification from "./pages/OTPVerification";
import Dashboard from "./pages/Dashboard";
import IssueLoan from "./pages/IssueLoan";
import AllLoans from "./pages/AllLoans";
import BorrowerLoans from "./pages/BorrowerLoans";
import RepayLoan from "./pages/RepayLoan";
import ValidateDocuments from "./pages/ValidateDocuments";
import Documents from "./pages/Documents";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/face-verification" element={<FaceVerification />} />
            <Route path="/otp-verification" element={<OTPVerification />} />

            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/issue-loan" element={<IssueLoan />} />
              <Route path="/all-loans" element={<AllLoans />} />
              <Route path="/borrower-loans" element={<BorrowerLoans />} />
              <Route path="/repay-loan" element={<RepayLoan />} />
              <Route
                path="/validate-documents"
                element={<ValidateDocuments />}
              />
              <Route path="/documents" element={<Documents />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
