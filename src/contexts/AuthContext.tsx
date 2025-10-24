import React, { createContext, useContext, useState, useEffect } from "react";
import { authApi, tokenManager } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  walletAddress: string;
  kycVerified: boolean;
  faceVerified: boolean;
  role: "Borrower" | "Lender";
  aadharDocument?: string;
  faceImage?: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface RegisterData {
  fullName: string;
  email: string;
  phone: string;
  role: "Borrower" | "Lender";
  aadharNumber: string;
}

interface AuthResponse {
  token: string;
  user: User;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (data: LoginData) => Promise<boolean>;
  register: (userData: RegisterData) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    verifyAuth();
  }, []);

  const verifyAuth = async () => {
    const token = tokenManager.get();
    if (!token) {
      setLoading(false);
      return;
    }

    const response = await authApi.verifyToken();
    if (response.success && response.data) {
      setUser(response.data as User);
    } else {
      tokenManager.remove();
    }
    setLoading(false);
  };

  const login = async (data: LoginData): Promise<boolean> => {
    // For login, we're making a direct fetch call as in Login.tsx
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uniqueId: data.email, // Map email to uniqueId for backend
          password: data.password,
        }),
      });

      const dataResponse = await response.json();

      if (dataResponse.success) {
        // Backend returns { success, data: { token, user } }
        const token = dataResponse?.data?.token ?? dataResponse?.token;
        const userData = dataResponse?.data?.user;
        if (!token) {
          throw new Error("Missing token in response");
        }
        tokenManager.set(token);
        setUser(userData);
        toast.success("Welcome back!");
        return true;
      } else {
        toast.error(dataResponse.error || "Login failed");
        return false;
      }
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Login error: Network error");
      return false;
    }
  };

  const register = async (userData: RegisterData): Promise<boolean> => {
    // For registration, we're making a direct fetch call as in Signup.tsx
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });

      const data = await response.json();
      if (data.success) {
        // Registration successful, but we don't have token/user data yet
        // The user will be redirected to face verification
        toast.success(
          "Personal details submitted! Proceed to face verification."
        );
        return true;
      } else {
        toast.error(data.error || "Registration failed");
        return false;
      }
    } catch (error) {
      console.error("Registration error:", error);
      toast.error("Registration error: Network error");
      return false;
    }
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
    toast.success("Logged out successfully");
    navigate("/");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
