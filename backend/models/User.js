const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: false, default: 'dummy-password' },
  phone: { type: String, required: true },
  role: { type: String, enum: ['Lender', 'Borrower'], required: true },
  aadharNumber: { type: String, required: true },
  walletAddress: { type: String, required: false },
  uniqueId: { type: String, required: false },
  kycVerified: { type: Boolean, default: false },
  faceVerified: { type: Boolean, default: false },
  aadharHash: { type: String }, // SHA-256 hash of Aadhaar document
  aadharSalt: { type: String }, // Salt for enhanced security
  faceEmbedding: { type: [Number] }, // 128-dimensional face descriptor
  lastFaceVerification: { type: Date }, // Track last face verification

  // Document storage paths
  aadharDocument: { type: String }, // Path to Aadhar document image
  faceImage: { type: String }, // Path to face image

  // DigiLocker verification fields
  digilockerVerified: { type: Boolean, default: false },
  digilockerData: {
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    aadhaarNumber: { type: String },
    name: { type: String },
    dob: { type: String },
    simulatedMode: { type: Boolean, default: false }
  },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);