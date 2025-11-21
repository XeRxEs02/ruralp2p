// API Configuration and Utilities
// Using /api prefix since Vite proxies /api requests to backend
const API_BASE_URL = '/api';

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Token management
export const tokenManager = {
  get: () => localStorage.getItem('auth_token') || localStorage.getItem('token'),
  set: (token: string) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('token', token);
  },
  remove: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('token');
  },
};

// API request helper
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = tokenManager.get();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = 'An error occurred';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (jsonError) {
        // If JSON parsing fails, use default message
        errorMessage = response.statusText || errorMessage;
      }
      return {
        success: false,
        error: errorMessage,
      };
    }

    const data = await response.json();

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('API Error:', error);
    return {
      success: false,
      error: 'Network error. Please check your connection.',
    };
  }
}

// Authentication APIs
export const authApi = {
  register: async (userData: {
    fullName: string;
    email: string;
    password: string;
    walletAddress: string;
  }) => {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  login: async (credentials: { email: string; password: string }) => {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  logout: async () => {
    tokenManager.remove();
    return { success: true };
  },

  verifyToken: async () => {
    return apiRequest('/auth/verify');
  },
};

// Face Verification APIs
export const faceApi = {
  verify: async (imageData: string) => {
    return apiRequest('/face/verify', {
      method: 'POST',
      body: JSON.stringify({ image: imageData }),
    });
  },

  getStatus: async () => {
    return apiRequest('/face/status');
  },
};

// Loan APIs
export const loanApi = {
  create: async (loanData: {
    amount: number;
    duration: number;
    interestRate: number;
    purpose: string;
  }) => {
    return apiRequest('/loans/create', {
      method: 'POST',
      body: JSON.stringify(loanData),
    });
  },

  getAll: async (filters?: { status?: string; borrowerId?: string }) => {
    const queryParams = filters ? new URLSearchParams(filters as Record<string, string>).toString() : '';
    return apiRequest(`/loans${queryParams ? `?${queryParams}` : ''}`);
  },

  getById: async (loanId: string) => {
    return apiRequest(`/loans/${loanId}`);
  },

  getBorrowerLoans: async (borrowerId: string) => {
    return apiRequest(`/loans/borrower/${borrowerId}`);
  },

  fund: async (loanId: string) => {
    return apiRequest(`/loans/${loanId}/fund`, {
      method: 'POST',
    });
  },
};

// Analytics APIs
export const analyticsApi = {
  getDashboardStats: async () => {
    return apiRequest('/analytics/dashboard');
  },

  getLoanMetrics: async () => {
    return apiRequest('/analytics/loans');
  },
};

// Wallet APIs
export const walletApi = {
  getBalance: async () => {
    return apiRequest('/wallet/balance');
  },

  getTransactions: async () => {
    return apiRequest('/wallet/transactions');
  },
};

// User APIs
export const userApi = {
  getProfile: async () => {
    return apiRequest('/user/profile');
  },

  updateProfile: async (profileData: Record<string, unknown>) => {
    return apiRequest('/user/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  },

  getKycStatus: async () => {
    return apiRequest('/user/kyc');
  },
};

// Enhanced Authentication APIs (New Backend)
export const enhancedAuthApi = {
  register: async (userData: {
    fullName: string;
    email: string;
    phone: string;
    role: 'Borrower' | 'Lender';
    aadharNumber: string;
  }) => {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  login: async (credentials: { uniqueId: string; password: string }) => {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  generateCredentials: async (credentials: { uniqueId: string; password: string; email: string }) => {
    return apiRequest('/auth/generate-credentials', {
      method: 'POST',
      body: JSON.stringify(credentials),
      headers: {
        'x-user-email': credentials.email,
      },
    });
  },

  getProfile: async () => {
    return apiRequest('/auth/profile');
  },

  updateProfile: async (profileData: Record<string, unknown>) => {
    return apiRequest('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  },
};

// Enhanced Loan APIs (New Backend with Multi-lender Support)
export const enhancedLoanApi = {
  create: async (loanData: {
    totalAmount: number;
    duration: number;
    averageInterestRate: number;
    purpose: string;
  }) => {
    return apiRequest('/loans/create', {
      method: 'POST',
      body: JSON.stringify(loanData),
    });
  },

  getAll: async (filters?: { status?: string; borrowerId?: string }) => {
    const queryParams = filters ? new URLSearchParams(filters as Record<string, string>).toString() : '';
    return apiRequest(`/loans${queryParams ? `?${queryParams}` : ''}`);
  },

  getById: async (loanId: string) => {
    return apiRequest(`/loans/${loanId}`);
  },

  getBorrowerLoans: async (borrowerId: string) => {
    return apiRequest(`/loans/borrower/${borrowerId}`);
  },

  getLenderLoans: async (lenderId: string) => {
    return apiRequest(`/loans/lender/${lenderId}`);
  },

  getMatchingStatus: async (loanId: string) => {
    return apiRequest(`/loans/${loanId}/matching`);
  },

  confirmFunding: async (loanId: string) => {
    return apiRequest(`/loans/${loanId}/confirm-funding`, {
      method: 'POST',
    });
  },

  repay: async (loanId: string, amount: number) => {
    return apiRequest(`/loans/${loanId}/repay`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  },

  getFSMStatus: async (loanId: string) => {
    return apiRequest(`/loans/${loanId}/fsm-status`);
  },

  getByState: async (state: string) => {
    return apiRequest(`/loans/state/${state}`);
  },
};

// Blockchain APIs (New)
export const blockchainApi = {
  getNetworkInfo: async () => {
    return apiRequest('/blockchain/network-info');
  },

  getLoanCounter: async () => {
    return apiRequest('/blockchain/loan-counter');
  },

  getLoanDetails: async (loanId: number) => {
    return apiRequest(`/blockchain/loan/${loanId}`);
  },

  checkDocument: async (hash: string) => {
    return apiRequest(`/blockchain/document-check/${hash}`);
  },

  verifyDocument: async (documentHash: string) => {
    return apiRequest('/blockchain/verify-document', {
      method: 'POST',
      body: JSON.stringify({ documentHash }),
    });
  },

  getTransactionReceipt: async (txHash: string) => {
    return apiRequest(`/blockchain/transaction/${txHash}`);
  },

  getGasPrice: async () => {
    return apiRequest('/blockchain/gas-price');
  },
};

// Document APIs (New)
export const documentApi = {
  upload: async (formData: FormData) => {
    const token = tokenManager.get();

    try {
      const response = await fetch(`${API_BASE_URL}/documents/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || 'Upload failed',
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('Document upload error:', error);
      return {
        success: false,
        error: 'Network error during upload',
      };
    }
  },

  getMyDocuments: async () => {
    return apiRequest('/documents/my-documents');
  },

  getById: async (documentId: string) => {
    return apiRequest(`/documents/${documentId}`);
  },

  download: async (documentId: string) => {
    const token = tokenManager.get();

    try {
      const response = await fetch(`${API_BASE_URL}/documents/${documentId}/download`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: 'Download failed',
        };
      }

      return {
        success: true,
        data: response,
      };
    } catch (error) {
      console.error('Document download error:', error);
      return {
        success: false,
        error: 'Network error during download',
      };
    }
  },

  verifyOnBlockchain: async (documentId: string) => {
    return apiRequest(`/documents/${documentId}/verify-blockchain`, {
      method: 'POST',
    });
  },
};

// Notification APIs
export const notificationApi = {
  getUserNotifications: async (userId: string) => {
    return apiRequest(`/notifications/user/${userId}`);
  },

  markAsRead: async (notificationId: string) => {
    return apiRequest(`/notifications/mark-read/${notificationId}`, {
      method: 'POST',
    });
  },

  getAll: async () => {
    return apiRequest('/notifications');
  },

  send: async (notificationData: {
    userId: string;
    type: string;
    title: string;
    message: string;
    channels?: { sms?: boolean; push?: boolean; inApp?: boolean };
    priority?: string;
  }) => {
    return apiRequest('/notifications/send', {
      method: 'POST',
      body: JSON.stringify(notificationData),
    });
  },
};

// Health Check API
export const healthApi = {
  getStatus: async () => {
    return apiRequest('/health');
  },

  testBlockchain: async () => {
    return apiRequest('/test-blockchain');
  },
};
