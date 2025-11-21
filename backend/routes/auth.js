const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const multer = require('multer');
const twilio = require('twilio');
const { sha256 } = require('../utils/hashing');
const {
  verifyBorrower,
  signupVerification,  // NEW: For signup without face comparison
  extractEmbedding,
  cosineSimilarity,
  hashDocument,
  performOCR,
  detectLiveness
} = require('../utils/verification');
const {
  verifyAadhaarDocument,
  validateAadhaarNumber,
  getAuthorizationUrl,
  getAccessToken
} = require('../utils/digilocker');
const User = require('../models/User');
const blockchainService = require('../services/blockchainService');
const router = express.Router();

let otpStore = {};  // Temporary OTP storage (in-memory for now)

// OTP expiration time (5 minutes)
const OTP_EXPIRY_TIME = 5 * 60 * 1000;

// Function to clean expired OTPs
function cleanExpiredOTPs() {
  const now = Date.now();
  for (const [email, otpData] of Object.entries(otpStore)) {
    if (otpData.expiry && now > otpData.expiry) {
      delete otpStore[email];
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

const upload = multer({ storage: multer.memoryStorage() });

// Generic SMS sender using Twilio
async function sendSMS(phone, message) {
  try {
    const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`; // default to India if no country code

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      console.log('⚠️  Twilio not configured. SMS content:', { to: formattedPhone, message });
      return { success: true, development: true };
    }

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const res = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone,
    });
    console.log('SMS sent via Twilio:', res.sid);
    return { success: true };
  } catch (error) {
    console.error('Twilio sendSMS error:', error.message);
    if (process.env.NODE_ENV !== 'production') {
      return { success: true, development: true };
    }
    return { success: false, error: 'Failed to send SMS' };
  }
}

async function sendOTP(phone, otp) {
  try {
    // Add country code if not present (assuming India)
    const formattedPhone = phone.startsWith('+91') ? phone : `+91${phone}`;

    console.log('Sending OTP via Twilio:', { phone: formattedPhone, otp });

    // Check if Twilio credentials are configured
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      console.log('⚠️  Twilio credentials not configured, using development mode');
      console.log(`📱 OTP for ${formattedPhone}: ${otp}`);
      return { success: true, development: true };
    }

    // Initialize Twilio client
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    // Send SMS via Twilio
    const message = await client.messages.create({
      body: `Your Rural Gold Connect OTP is: ${otp}. This OTP is valid for 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });

    console.log('OTP sent successfully via Twilio:', message.sid);
    return { success: true };
  } catch (error) {
    console.error('Twilio SMS error:', error.message);

    // In development, log the OTP instead of failing
    if (process.env.NODE_ENV !== 'production') {
      console.log('⚠️  Twilio SMS failed, using development mode');
      console.log(`📱 OTP for ${phone}: ${otp}`);
      return { success: true, development: true };
    }

    return { success: false, error: 'Failed to send OTP' };
  }
}

router.post('/register', async (req, res) => {
  try {
    const { fullName, email, phone, role, aadharNumber } = req.body;

    if (!fullName || !email || !phone || !role || !aadharNumber) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    if (!['Lender', 'Borrower'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    // Validate phone format (basic validation) - handle international format
    const cleanPhone = phone.replace(/^\+91/, ''); // Remove +91 prefix if present
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(cleanPhone)) {
      return res.status(400).json({ success: false, error: 'Phone number must be 10 digits' });
    }

    // Validate Aadhar format (basic validation)
    const aadharRegex = /^\d{12}$/;
    if (!aadharRegex.test(aadharNumber.replace(/\s/g, ''))) {
      return res.status(400).json({ success: false, error: 'Aadhar number must be 12 digits' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    // Create user with personal details only
    const cleanAadharNumber = aadharNumber ? aadharNumber.replace(/\s/g, '') : '';
    const newUser = new User({
      fullName,
      email,
      password: 'dummy-password',
      phone,
      role,
      aadharNumber: cleanAadharNumber, // Remove spaces from Aadhar
      kycVerified: false,
      faceVerified: false,
    });

    await newUser.save();

    res.json({
      success: true,
      message: 'Personal details saved. Proceed to face verification.',
      data: {
        userId: newUser._id,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
});

router.post('/send-otp', async (req, res) => {
  const { phone, email } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, error: 'Phone number required' });
  }

  try {
    // Clean expired OTPs first
    cleanExpiredOTPs();

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + OTP_EXPIRY_TIME;

    // Store OTP with expiry
    otpStore[email || 'default'] = {
      otp,
      expiry,
      phone
    };

    // Send OTP
    const result = await sendOTP(phone, otp);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      development: result.development || false
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ success: false, error: 'Failed to send OTP' });
  }
});

router.post('/verify-otp', async (req, res) => {
  const { otp } = req.body;

  if (!otp) {
    return res.status(400).json({ success: false, error: 'OTP required' });
  }

  try {
    // Get user email from headers or use a default for testing
    const email = req.headers['x-user-email'] || 'user@example.com';

    // Clean expired OTPs first
    cleanExpiredOTPs();

    // Check if OTP exists, matches, and hasn't expired
    const otpData = otpStore[email];
    if (otpData && otpData.otp === otp) {
      // Clear the OTP after successful verification
      delete otpStore[email];
      res.json({ success: true, message: 'OTP verified successfully' });
    } else {
      res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ success: false, error: 'OTP verification failed' });
  }
});

router.post('/generate-credentials', async (req, res) => {
  const { uniqueId, password } = req.body;

  if (!uniqueId || !password) {
    return res.status(400).json({ success: false, error: 'Unique ID and password required' });
  }

  try {
    // Get email from headers or use a default for testing
    const email = req.headers['x-user-email'] || 'user@example.com';
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.uniqueId = uniqueId;
    user.password = password;
    await user.save();

    // Send credentials to user's phone via SMS
    const smsMessage = `Your Rural Gold Connect credentials:\nUnique ID: ${uniqueId}\nPassword: ${password}\nKeep them safe.`;
    await sendSMS(user.phone, smsMessage);

    res.json({ success: true, message: 'Credentials saved and sent via SMS' });
  } catch (error) {
    console.error('Error saving credentials:', error);
    res.status(500).json({ success: false, error: 'Error saving credentials' });
  }
});

router.post('/login', async (req, res) => {
  const { uniqueId, password } = req.body;

  if (!uniqueId || !password) {
    return res.status(400).json({ success: false, error: 'Unique ID and password required' });
  }

  try {
    const user = await User.findOne({ uniqueId });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Compare password using model's method
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          walletAddress: user.walletAddress,
          kycVerified: user.kycVerified,
          faceVerified: user.faceVerified,
          aadharDocument: user.aadharDocument,
          faceImage: user.faceImage
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

// NEW: Login with REAL face verification
router.post('/login-with-face', upload.single('faceImage'), async (req, res) => {
  const { uniqueId, password } = req.body;
  const faceImage = req.file?.buffer;

  if (!uniqueId || !password) {
    return res.status(400).json({ success: false, error: 'Unique ID and password required' });
  }

  if (!faceImage) {
    return res.status(400).json({ success: false, error: 'Face image required for biometric login' });
  }

  try {
    // Step 1: Verify credentials
    const user = await User.findOne({ uniqueId });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Compare password using model's method
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Step 2: Check if user has registered face embedding
    if (!user.faceEmbedding || user.faceEmbedding.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No face data registered. Please complete KYC first.'
      });
    }

    console.log('🔍 Verifying face for login:', user.email);

    // Step 3: Extract face embedding from login image
    const loginFaceEmbedding = await extractEmbedding(faceImage);

    console.log('✅ Login face embedding extracted');

    // Step 4: Compare with stored embedding
    const score = await cosineSimilarity(loginFaceEmbedding, user.faceEmbedding);

    console.log('📊 Face match score:', score);

    // Step 5: Threshold check (stricter for login)
    if (score < 0.65) {
      return res.status(401).json({
        success: false,
        error: 'Face verification failed. Please try again.',
        score: score.toFixed(3)
      });
    }

    // Step 6: Generate token
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    console.log('✅ Face verification successful, login granted');

    res.json({
      success: true,
      verified: true,
      score: score.toFixed(3),
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          walletAddress: user.walletAddress,
          kycVerified: user.kycVerified,
          faceVerified: user.faceVerified,
          aadharDocument: user.aadharDocument,
          faceImage: user.faceImage
        },
      },
    });

  } catch (error) {
    console.error('❌ Login face verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Face verification error: ' + error.message
    });
  }
});

// DEV ONLY: Clear users (all or by email) to resolve "user exists" during testing
router.post('/admin/clear-users', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, error: 'Forbidden in production' });
    }

    const { email } = req.body || {};
    if (email) {
      const result = await User.deleteOne({ email });
      return res.json({ success: true, cleared: 'one', email, deletedCount: result.deletedCount });
    }

    const result = await User.deleteMany({});
    res.json({ success: true, cleared: 'all', deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Clear users error:', error);
    res.status(500).json({ success: false, error: 'Failed to clear users' });
  }
});

router.get('/verify', authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(401).json({ success: false, error: 'User not found' });
  }

  res.json({
    success: true,
    data: {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      walletAddress: user.walletAddress,
      kycVerified: user.kycVerified,
      faceVerified: user.faceVerified,
      aadharDocument: user.aadharDocument,
      faceImage: user.faceImage
    },
  });
});

router.post('/verify-face', upload.fields([{ name: 'faceImage' }, { name: 'aadharImage' }]), async (req, res) => {
  const faceImage = req.files?.faceImage?.[0]?.buffer;
  const aadharImage = req.files?.aadharImage?.[0]?.buffer;
  const email = req.body.email;

  if (!faceImage || !aadharImage || !email) {
    return res.status(400).json({ success: false, error: 'Face, document, and email required' });
  }

  try {
    console.log('🔍 Starting REAL biometric verification for:', email);

    // Get user details for DigiLocker verification
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // STEP 1: DigiLocker Aadhaar Verification
    console.log('📋 Step 1: DigiLocker Aadhaar Verification...');

    let digilockerResult;
    try {
      // Check if DigiLocker is configured
      const isDigiLockerConfigured = process.env.DIGILOCKER_CLIENT_ID &&
        process.env.DIGILOCKER_CLIENT_SECRET &&
        process.env.DIGILOCKER_CLIENT_ID !== 'YOUR_CLIENT_ID' &&
        process.env.DIGILOCKER_CLIENT_SECRET !== 'YOUR_CLIENT_SECRET';

      if (isDigiLockerConfigured) {
        // Validate Aadhaar number format
        if (!validateAadhaarNumber(user.aadharNumber)) {
          console.warn('⚠️  Invalid Aadhaar number format');
        }

        // Verify Aadhaar from DigiLocker
        digilockerResult = await verifyAadhaarDocument(
          user.aadharNumber,
          user.fullName,
          req.body.digilockerToken, // Optional: from OAuth flow
          req.body.docUri // Optional: specific document URI
        );

        if (!digilockerResult.verified) {
          return res.status(400).json({
            success: false,
            error: 'DigiLocker verification failed: ' + (digilockerResult.error || 'Invalid document'),
            stage: 'digilocker'
          });
        }

        console.log('✅ DigiLocker verification successful');
        console.log('   Aadhaar Number:', digilockerResult.aadhaarNumber);
        console.log('   Name:', digilockerResult.name);
        console.log('   Simulated Mode:', digilockerResult.simulatedMode || false);
      } else {
        // Fall back to simulation mode for development
        console.log('⚠️  DigiLocker not configured, using simulation mode');

        // Validate Aadhaar number format
        if (!validateAadhaarNumber(user.aadharNumber)) {
          console.warn('⚠️  Invalid Aadhaar number format');
        }

        // Use simulation for development
        digilockerResult = {
          verified: true,
          aadhaarNumber: user.aadharNumber,
          name: user.fullName,
          dob: '1990-01-01',
          gender: 'Male',
          address: 'Sample Address, India',
          issuedDate: new Date().toISOString(),
          digilockerVerified: true,
          simulatedMode: true,
        };

        console.log('✅ DigiLocker simulation successful');
        console.log('   Aadhaar Number:', digilockerResult.aadhaarNumber);
        console.log('   Name:', digilockerResult.name);
        console.log('   Simulated Mode:', digilockerResult.simulatedMode);
      }

    } catch (digilockerError) {
      console.error('❌ DigiLocker verification error:', digilockerError.message);
      return res.status(400).json({
        success: false,
        error: 'DigiLocker verification failed: ' + digilockerError.message,
        stage: 'digilocker'
      });
    }

    // STEP 2: Biometric Data Capture WITH OCR MATCHING
    console.log('🔐 Step 2: Capturing biometric data + OCR verification...');

    // Use signupVerification - captures data AND verifies name/Aadhaar match
    const txnId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const result = await signupVerification(
      faceImage,
      aadharImage,
      txnId,
      user.fullName,      // Pass entered name for OCR matching
      user.aadharNumber   // Pass entered Aadhaar for OCR matching
    );

    if (!result.verified) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Biometric data capture failed',
        stage: 'biometric'
      });
    }

    console.log('✅ Biometric data captured successfully');

    // STEP 3: Save actual document images to file system
    console.log('💾 Step 3: Saving document images...');

    const fs = require('fs').promises;
    const path = require('path');

    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(__dirname, '../../uploads');
    await fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

    // Save Aadhar document image
    const aadharFilename = `aadhar-${user._id}-${Date.now()}.jpg`;
    const aadharPath = path.join(uploadDir, aadharFilename);
    await fs.writeFile(aadharPath, aadharImage);
    user.aadharDocument = `/uploads/${aadharFilename}`;

    // Save face image
    const faceFilename = `face-${user._id}-${Date.now()}.jpg`;
    const facePath = path.join(uploadDir, faceFilename);
    await fs.writeFile(facePath, faceImage);
    user.faceImage = `/uploads/${faceFilename}`;

    // STEP 4: Update user with verified status and REAL data
    console.log('💾 Step 4: Saving verification data...');

    user.faceVerified = true;
    user.kycVerified = true;
    user.faceEmbedding = result.faceEmbedding; // REAL 128-d embedding
    user.aadharHash = result.documentHash; // REAL SHA-256 hash
    user.aadharSalt = result.salt; // Security salt
    user.lastFaceVerification = new Date();

    // Store DigiLocker verification data
    user.digilockerVerified = true;
    user.digilockerData = {
      verified: digilockerResult.verified,
      verifiedAt: new Date(),
      aadhaarNumber: digilockerResult.aadhaarNumber,
      name: digilockerResult.name,
      dob: digilockerResult.dob,
      simulatedMode: digilockerResult.simulatedMode || false
    };

    await user.save();

    console.log('✅ User data updated with REAL embeddings, hash, and DigiLocker verification');

    // STEP 4.5: Blockchain Document Verification
    console.log('🔗 Step 4.5: Verifying document on blockchain...');
    let blockchainResult;
    try {
      blockchainResult = await blockchainService.verifyDocumentHash(result.documentHash);
      console.log('✅ Document verified on blockchain:', blockchainResult.txHash);
    } catch (blockchainError) {
      console.error('❌ Blockchain verification failed:', blockchainError.message);
      // Don't fail the entire process, but log it
      blockchainResult = { success: false, error: blockchainError.message };
    }

    // STEP 5: Send OTP
    console.log('📱 Step 5: Sending OTP...');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + OTP_EXPIRY_TIME;

    // Store OTP with expiry
    otpStore[email] = {
      otp,
      expiry,
      phone: user.phone
    };
    await sendOTP(user.phone, otp);

    console.log('✅ OTP sent to:', user.phone);
    console.log('\n=== ✅ COMPLETE VERIFICATION SUCCESSFUL ===\n');

    res.json({
      success: true,
      verified: true,
      message: 'DigiLocker + Biometric data captured. OTP sent.',
      details: {
        digilocker: {
          verified: true,
          aadhaarNumber: digilockerResult.aadhaarNumber?.replace(/.(?=.{4})/g, 'X'),
          name: digilockerResult.name,
          simulatedMode: digilockerResult.simulatedMode || false
        },
        biometric: {
          faceEmbeddingStored: true,
          documentHashStored: true,
          liveness: result.liveness,
          message: 'No face comparison performed (stored for future loan verification)'
        },
        blockchain: {
          verified: blockchainResult.success,
          txHash: blockchainResult.txHash,
          contractAddress: blockchainResult.contractAddress,
          network: blockchainResult.network
        }
      }
    });
  } catch (error) {
    console.error('❌ Verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Verification error: ' + error.message
    });
  }
});

router.post('/logout', (req, res) => {
  res.json({ success: true });
});

// Test SMS functionality
router.post('/test-sms', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone) {
    return res.status(400).json({ success: false, error: 'Phone number required' });
  }

  try {
    const result = await sendSMS(phone, message || 'Test SMS from Rural Gold Connect');
    res.json({
      success: true,
      message: 'SMS test completed',
      development: result.development || false,
      phone: phone
    });
  } catch (error) {
    console.error('SMS test error:', error);
    res.status(500).json({ success: false, error: 'SMS test failed' });
  }
});

// Check OTP status (for debugging)
router.get('/otp-status', (req, res) => {
  const email = req.query.email || 'default';
  const otpData = otpStore[email];

  if (otpData) {
    const remainingTime = Math.max(0, Math.floor((otpData.expiry - Date.now()) / 1000));
    res.json({
      success: true,
      hasOtp: true,
      remainingTime: remainingTime,
      phone: otpData.phone
    });
  } else {
    res.json({
      success: true,
      hasOtp: false,
      message: 'No active OTP found'
    });
  }
});

// DigiLocker OAuth routes
router.get('/digilocker/authorize', (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email required' });
  }

  // Generate state with email for callback
  const state = Buffer.from(JSON.stringify({ email, timestamp: Date.now() })).toString('base64');
  const authUrl = getAuthorizationUrl(state);

  res.json({
    success: true,
    authUrl,
    message: 'Redirect user to DigiLocker for authorization'
  });
});

router.get('/digilocker/callback', async (req, res) => {
  const { code, state } = req.query;

  try {
    if (!code) {
      return res.status(400).json({ success: false, error: 'Authorization code missing' });
    }

    // Decode state to get email
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { email } = stateData;

    // Exchange code for access token
    const tokenData = await getAccessToken(code);

    // Store token temporarily (in production, use Redis or database)
    // For now, return it to frontend
    res.json({
      success: true,
      accessToken: tokenData.access_token,
      email,
      message: 'DigiLocker authorization successful. Use this token for verification.'
    });

  } catch (error) {
    console.error('DigiLocker callback error:', error);
    res.status(500).json({
      success: false,
      error: 'DigiLocker authorization failed: ' + error.message
    });
  }
});

module.exports = router;
