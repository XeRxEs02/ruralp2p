const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const authController = require('../controllers/authController');
const multer = require('multer');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Register new user
router.post('/register', authController.register);

// Login with credentials
router.post('/login', authController.login);

// Generate credentials for user
router.post('/generate-credentials', authController.generateCredentials);

// Get user profile
router.get('/profile', authenticateToken, authController.getProfile);

// Update user profile
router.put('/profile', authenticateToken, authController.updateProfile);

// Save device token for push notifications
router.post('/saveDeviceToken', authenticateToken, authController.saveDeviceToken);

// Store face embedding during registration
router.post('/store-face-embedding', upload.single('faceImage'), authController.storeFaceEmbedding);

// Face verification for login
router.post('/face-verify', upload.single('faceImage'), authController.faceVerify);

// Verify token
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user.id,
      email: req.user.email,
    },
  });
});

module.exports = router;
