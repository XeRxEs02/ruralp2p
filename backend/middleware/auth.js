const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// Middleware to authenticate JWT tokens
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Find user
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // Attach user to request
    req.user = decoded;
    next();

  } catch (error) {
    console.error('Authentication error:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

// Middleware to check if user is a borrower
const requireBorrower = (req, res, next) => {
  if (req.user.role !== 'Borrower') {
    return res.status(403).json({
      success: false,
      error: 'Borrower access required'
    });
  }
  next();
};

// Middleware to check if user is a lender
const requireLender = (req, res, next) => {
  if (req.user.role !== 'Lender') {
    return res.status(403).json({
      success: false,
      error: 'Lender access required'
    });
  }
  next();
};

// Middleware to check if user is KYC verified
const requireKYCVerified = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.kycVerified) {
      return res.status(403).json({
        success: false,
        error: 'KYC verification required'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Verification check failed'
    });
  }
};

module.exports = {
  authenticateToken,
  requireBorrower,
  requireLender,
  requireKYCVerified,
};
