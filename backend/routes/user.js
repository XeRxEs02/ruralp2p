const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads');
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../../uploads');
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

router.get('/profile', authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  res.json({
    success: true,
    data: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
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

router.put('/profile', authenticateToken, async (req, res) => {
  const updates = req.body;
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  Object.assign(user, updates);
  await user.save();
  res.json({
    success: true,
    data: user,
  });
});

router.get('/kyc', authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({
    success: true,
    data: { verified: user.kycVerified },
  });
});

// Upload documents
router.post('/documents/upload', authenticateToken, upload.fields([
  { name: 'aadharDocument', maxCount: 1 },
  { name: 'faceImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Update user with document paths
    if (req.files?.aadharDocument) {
      user.aadharDocument = `/uploads/${req.files.aadharDocument[0].filename}`;
    }

    if (req.files?.faceImage) {
      user.faceImage = `/uploads/${req.files.faceImage[0].filename}`;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Documents uploaded successfully',
      data: {
        aadharDocument: user.aadharDocument,
        faceImage: user.faceImage
      }
    });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ success: false, error: 'Document upload failed' });
  }
});

// Get document by filename
router.get('/documents/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../../uploads', filename);

    // Check if file exists
    try {
      await fs.access(filePath);
      res.sendFile(filePath);
    } catch (error) {
      res.status(404).json({ success: false, error: 'Document not found' });
    }
  } catch (error) {
    console.error('Document retrieval error:', error);
    res.status(500).json({ success: false, error: 'Document retrieval failed' });
  }
});

module.exports = router;