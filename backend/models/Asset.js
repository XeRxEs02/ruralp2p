const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Asset Details
  name: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ['Gold', 'Land', 'Livestock', 'Machinery', 'Crop', 'Other'],
    required: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },

  // Valuation
  estimatedValue: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    default: 'INR',
  },
  valuationDate: {
    type: Date,
    default: Date.now,
  },
  valuationMethod: {
    type: String,
    enum: ['Market', 'Appraisal', 'Insurance', 'Other'],
    default: 'Appraisal',
  },

  // Physical Details
  location: {
    address: String,
    coordinates: {
      latitude: Number,
      longitude: Number,
    },
    area: String, // for land
  },

  // Documentation
  documents: [{
    type: {
      type: String,
      enum: ['Title', 'Valuation', 'Insurance', 'Photo', 'Other'],
    },
    filename: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  }],

  // Tokenization Details
  tokenId: {
    type: String,
    unique: true,
    sparse: true,
  },
  blockchainTxHash: {
    type: String,
    default: null,
  },
  tokenizationStatus: {
    type: String,
    enum: ['Pending', 'InProgress', 'Completed', 'Failed'],
    default: 'Pending',
  },

  // Loan Backed Assets
  isCollateralized: {
    type: Boolean,
    default: false,
  },
  collateralValue: {
    type: Number,
    default: 0,
  },
  loanToValueRatio: {
    type: Number,
    default: 0,
    min: 0,
    max: 1,
  },

  // Seasonal Information (for agricultural assets)
  isSeasonal: {
    type: Boolean,
    default: false,
  },
  harvestSeason: {
    type: String,
    enum: ['Kharif', 'Rabi', 'Zaid', 'Year-round'],
    default: null,
  },
  plantingDate: Date,
  harvestDate: Date,
  expectedYield: Number,
  yieldUnit: String,

  // Status
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Sold', 'Destroyed'],
    default: 'Active',
  },
  verified: {
    type: Boolean,
    default: false,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  verifiedAt: {
    type: Date,
    default: null,
  },

  // Metadata
  tags: [String],
  notes: String,

  // Timestamps
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
assetSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Calculate loan eligibility based on asset value
assetSchema.methods.getLoanEligibility = function(maxLTV = 0.7) {
  return this.estimatedValue * maxLTV;
};

// Check if asset is available for tokenization
assetSchema.methods.canTokenize = function() {
  return this.status === 'Active' && this.verified && !this.isCollateralized;
};

// Virtual for asset age
assetSchema.virtual('ageInDays').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Ensure virtual fields are serialized
assetSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Asset', assetSchema);
