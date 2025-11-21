const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Notification = require('../models/Notification');
const blockchainService = require('../services/blockchainService');
const smsService = require('../services/smsService');
const faceService = require('../services/faceService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
};

// Register new user
const register = async (req, res) => {
  try {
    const { fullName, email, phone, role, aadharNumber } = req.body;

    // Validation
    if (!fullName || !email || !phone || !role || !aadharNumber) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // Validate role
    if (!['Lender', 'Borrower'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role'
      });
    }

    // Check if user with same email and role already exists
    // Allow same person to have both lender and borrower accounts
    const existingUser = await User.findOne({ email, role });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: `User already exists as ${role}. Same person can have both lender and borrower accounts with different credentials.`
      });
    }

    // Create user
    const newUser = new User({
      fullName,
      email,
      phone,
      role,
      aadharNumber: aadharNumber.replace(/\s/g, ''),
      password: 'temp-password', // Will be set during credential generation
      kycVerified: false,
      faceVerified: false,
    });

    await newUser.save();

    // Create notification
    await Notification.create({
      recipientId: newUser._id,
      type: 'General',
      title: 'Registration Successful',
      message: 'Welcome to RuralConnect! Please complete your KYC verification.',
      priority: 'Medium',
      channels: {
        email: true,
        sms: false,
        push: true,
        inApp: true,
      },
    });

    // Send SMS notification for borrower registration
    if (role === 'Borrower') {
      const smsMessage = `Welcome to RuralConnect, ${fullName}! Your account has been created successfully. Please complete KYC verification to start borrowing.`;
      await smsService.sendSMS(phone, smsMessage);
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please complete KYC verification.',
      data: {
        userId: newUser._id,
        email: newUser.email,
        role: newUser.role,
      },
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
};

// Login with credentials
const login = async (req, res) => {
  try {
    const { uniqueId, password } = req.body;

    if (!uniqueId || !password) {
      return res.status(400).json({
        success: false,
        error: 'Unique ID and password required'
      });
    }

    // Find user
    const user = await User.findOne({ uniqueId });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken(user._id);

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
        },
      },
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
};

// Generate credentials for user
const generateCredentials = async (req, res) => {
  try {
    const { uniqueId, password, role } = req.body;

    if (!uniqueId || !password) {
      return res.status(400).json({
        success: false,
        error: 'Unique ID and password required'
      });
    }

    // Find user by email and role (since same email can have multiple roles)
    const email = req.headers['x-user-email'] || req.body.email;
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email required'
      });
    }

    // If role is specified, find user with that email and role
    // Otherwise, find the first user with that email (for backward compatibility)
    const query = role ? { email, role } : { email };
    const user = await User.findOne(query);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: role ? `User not found with email ${email} and role ${role}` : 'User not found'
      });
    }

    // Check if uniqueId is already taken
    const existingUniqueId = await User.findOne({ uniqueId });
    if (existingUniqueId && existingUniqueId._id.toString() !== user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Unique ID already taken. Please choose a different one.'
      });
    }

    // Update credentials
    user.uniqueId = uniqueId;
    user.password = password;
    await user.save();

    // Create notification
    await Notification.create({
      recipientId: user._id,
      type: 'General',
      title: 'Credentials Generated',
      message: 'Your login credentials have been created successfully.',
      priority: 'Medium',
      channels: {
        email: true,
        sms: true,
        push: true,
        inApp: true,
      },
    });

    res.json({
      success: true,
      message: 'Credentials saved successfully',
      data: {
        userId: user._id,
        role: user.role,
        uniqueId: user.uniqueId
      }
    });

  } catch (error) {
    console.error('Generate credentials error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate credentials'
    });
  }
};

// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user,
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profile'
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const updates = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update allowed fields
    Object.keys(updates).forEach(key => {
      if (user.schema.paths[key] && key !== '_id' && key !== 'password') {
        user[key] = updates[key];
      }
    });

    await user.save();

    res.json({
      success: true,
      data: user,
      message: 'Profile updated successfully',
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
};

// Save device token for push notifications
const saveDeviceToken = async (req, res) => {
  try {
    const { firebaseToken, deviceType = 'web' } = req.body;
    const userId = req.user.id;

    if (!firebaseToken) {
      return res.status(400).json({
        success: false,
        error: 'Firebase token is required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update firebaseToken
    user.firebaseToken = firebaseToken;

    // Add to deviceTokens array if not already present
    const existingTokenIndex = user.deviceTokens.findIndex(
      token => token.token === firebaseToken
    );

    if (existingTokenIndex === -1) {
      user.deviceTokens.push({
        token: firebaseToken,
        deviceType,
        lastUsed: new Date()
      });
    } else {
      user.deviceTokens[existingTokenIndex].lastUsed = new Date();
    }

    await user.save();

    res.json({
      success: true,
      message: 'Device token saved successfully'
    });

  } catch (error) {
    console.error('Save device token error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save device token'
    });
  }
};

// Store face embedding during registration
const storeFaceEmbedding = async (req, res) => {
  try {
    const { userId } = req.body;
    const faceImage = req.file;

    if (!userId || !faceImage) {
      return res.status(400).json({
        success: false,
        error: 'User ID and face image required'
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Extract face embedding
    const imageBuffer = faceImage.buffer;
    const embedding = await faceService.getEmbedding(imageBuffer);

    // Store embedding in user
    user.faceEmbedding = embedding;
    user.faceVerified = true;
    user.lastFaceVerification = new Date();
    await user.save();

    // Save face image file
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const faceImageName = `face-${userId}-${Date.now()}.jpg`;
    const faceImagePath = path.join(uploadsDir, faceImageName);
    fs.writeFileSync(faceImagePath, imageBuffer);

    user.faceImage = faceImageName;
    await user.save();

    res.json({
      success: true,
      message: 'Face embedding stored successfully',
      data: {
        embeddingLength: embedding.length,
        faceImage: faceImageName,
      },
    });

  } catch (error) {
    console.error('Store face embedding error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store face embedding'
    });
  }
};

// Face verification for login
const faceVerify = async (req, res) => {
  try {
    const { userId } = req.body;
    const faceImage = req.file;

    if (!userId || !faceImage) {
      return res.status(400).json({
        success: false,
        error: 'User ID and face image required'
      });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.faceEmbedding || user.faceEmbedding.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No stored face embedding found for user'
      });
    }

    // Extract embedding from new image
    const imageBuffer = faceImage.buffer;
    const newEmbedding = await faceService.getEmbedding(imageBuffer);

    // Calculate similarity
    const similarity = await faceService.cosineSimilarity(user.faceEmbedding, newEmbedding);

    // Check threshold (0.45 as specified)
    const threshold = 0.45;
    const verified = similarity >= threshold;

    if (verified) {
      user.lastFaceVerification = new Date();
      await user.save();
    }

    res.json({
      success: verified,
      similarity: similarity,
      threshold: threshold,
      message: verified ? 'Face verified successfully' : 'Biometric verification failed',
    });

  } catch (error) {
    console.error('Face verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Face verification failed'
    });
  }
};

module.exports = {
  register,
  login,
  generateCredentials,
  getProfile,
  updateProfile,
  saveDeviceToken,
  storeFaceEmbedding,
  faceVerify,
};
