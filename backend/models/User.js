const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  role: {
    type: String,
    enum: ['Borrower', 'Lender'],
    required: true,
  },
  aadharNumber: {
    type: String,
    required: true,
    // unique: true, // Temporarily disabled to fix database issues
  },
  uniqueId: {
    type: String,
    unique: true,
    sparse: true,
  },
  walletAddress: {
    type: String,
    default: null,
  },

  // KYC and Verification Status
  kycVerified: {
    type: Boolean,
    default: false,
  },
  faceVerified: {
    type: Boolean,
    default: false,
  },
  digilockerVerified: {
    type: Boolean,
    default: false,
  },

  // Document Storage
  aadharDocument: {
    type: String,
    default: null,
  },
  faceImage: {
    type: String,
    default: null,
  },

  // Biometric Data
  faceEmbedding: {
    type: [Number],
    default: [],
  },
  aadharHash: {
    type: String,
    default: null,
  },
  aadharSalt: {
    type: String,
    default: null,
  },

  // DigiLocker Data
  digilockerData: {
    verified: Boolean,
    verifiedAt: Date,
    aadhaarNumber: String,
    name: String,
    dob: String,
    simulatedMode: Boolean,
  },

  // Two-Factor Authentication
  twoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  twoFactorSecret: {
    type: String,
    default: null,
  },
  twoFactorBackupCodes: [{
    code: String,
    used: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    }
  }],
  twoFactorMethod: {
    type: String,
    enum: ['sms', 'app', 'email'],
    default: 'sms',
  },

  // Security & Privacy
  lastPasswordChange: {
    type: Date,
    default: Date.now,
  },
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: {
    type: Date,
    default: null,
  },
  accountLocked: {
    type: Boolean,
    default: false,
  },
  gdprConsent: {
    type: Boolean,
    default: false,
  },
  dataRetentionConsent: {
    type: Boolean,
    default: true,
  },
  marketingConsent: {
    type: Boolean,
    default: false,
  },

  // Device and Notification Settings
  firebaseToken: {
    type: String,
    default: null,
  },
  deviceTokens: [{
    token: String,
    deviceType: {
      type: String,
      enum: ['web', 'mobile'],
      default: 'web'
    },
    lastUsed: {
      type: Date,
      default: Date.now
    }
  }],
  notificationPreferences: {
    sms: {
      type: Boolean,
      default: true,
    },
    push: {
      type: Boolean,
      default: true,
    },
    email: {
      type: Boolean,
      default: false,
    },
    inApp: {
      type: Boolean,
      default: true,
    }
  },

  // Timestamps
  lastFaceVerification: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Create compound unique index on email + role
// This allows same email with different roles but prevents duplicate email+role combinations
userSchema.index({ email: 1, role: 1 }, { unique: true });

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.aadharSalt;
  delete userObject.faceEmbedding;
  return userObject;
};

module.exports = mongoose.model('User', userSchema);
