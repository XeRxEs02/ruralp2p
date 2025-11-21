const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  documentType: {
    type: String,
    enum: ['Aadhar', 'PAN', 'VoterID', 'Passport', 'Other'],
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  fileSize: {
    type: Number,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },

  // Hash and Verification
  documentHash: {
    type: String,
    required: true,
  },
  hashAlgorithm: {
    type: String,
    default: 'SHA-256',
  },
  salt: {
    type: String,
    default: null,
  },

  // Blockchain Information
  blockchainTxHash: {
    type: String,
    default: null,
  },
  verifiedOnChain: {
    type: Boolean,
    default: false,
  },

  // OCR Data
  extractedText: {
    type: String,
    default: null,
  },
  ocrConfidence: {
    type: Number,
    default: 0,
    min: 0,
    max: 1,
  },

  // Verification Status
  verificationStatus: {
    type: String,
    enum: ['Pending', 'Verified', 'Rejected', 'Failed'],
    default: 'Pending',
  },
  verificationNotes: {
    type: String,
    default: null,
  },

  // Metadata
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  // Timestamps
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  verifiedAt: {
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
documentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
documentSchema.index({ userId: 1, documentType: 1 });
documentSchema.index({ documentHash: 1 });
documentSchema.index({ verificationStatus: 1 });

module.exports = mongoose.model('Document', documentSchema);
