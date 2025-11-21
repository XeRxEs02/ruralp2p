const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken } = require('../middleware/auth');
const Document = require('../models/Document');
const User = require('../models/User');
const blockchainService = require('../services/blockchainService');
const { hashDocument } = require('../algorithms/sha256Hash');

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

// Upload documents
router.post('/upload', authenticateToken, upload.fields([
  { name: 'aadharDocument', maxCount: 1 },
  { name: 'faceImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const documents = [];

    // Process Aadhar document
    if (req.files?.aadharDocument) {
      const file = req.files.aadharDocument[0];

      // Generate double hash using enhanced algorithm
      const { finalHash, originalHash, salt } = hashDocument(file.buffer, `DOC-${Date.now()}`, user.aadharSalt);

      // Create document record
      const document = new Document({
        userId: user._id,
        documentType: 'Aadhar',
        fileName: file.originalname,
        filePath: `/uploads/${file.filename}`,
        fileSize: file.size,
        mimeType: file.mimetype,
        documentHash: finalHash,
        hashAlgorithm: 'SHA-256-DOUBLE',
        salt: salt,
        uploadedBy: user._id,
      });

      await document.save();
      documents.push(document);

      // Update user with document path and hash
      user.aadharDocument = `/uploads/${file.filename}`;
      user.aadharHash = finalHash;
      user.aadharSalt = salt;
    }

    // Process face image
    if (req.files?.faceImage) {
      const file = req.files.faceImage[0];

      // Generate double hash for face image
      const { finalHash, originalHash, salt } = hashDocument(file.buffer, `FACE-${Date.now()}`);

      // Create document record
      const document = new Document({
        userId: user._id,
        documentType: 'Other', // Face images
        fileName: file.originalname,
        filePath: `/uploads/${file.filename}`,
        fileSize: file.size,
        mimeType: file.mimetype,
        documentHash: finalHash,
        hashAlgorithm: 'SHA-256-DOUBLE',
        salt: salt,
        uploadedBy: user._id,
      });

      await document.save();
      documents.push(document);

      // Update user with face image path
      user.faceImage = `/uploads/${file.filename}`;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Documents uploaded successfully',
      data: {
        documents: documents.map(doc => ({
          id: doc._id,
          type: doc.documentType,
          hash: doc.documentHash,
          uploadedAt: doc.createdAt,
        })),
        user: {
          aadharDocument: user.aadharDocument,
          faceImage: user.faceImage,
          aadharHash: user.aadharHash,
        }
      }
    });

  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Document upload failed'
    });
  }
});

// Get user's documents
router.get('/my-documents', authenticateToken, async (req, res) => {
  try {
    const documents = await Document.find({ userId: req.user.id })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: documents,
    });

  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get documents'
    });
  }
});

// Get document by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    // Check if user owns the document
    if (document.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: document,
    });

  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get document'
    });
  }
});

// Get document file
router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    // Check if user owns the document
    if (document.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const filePath = path.join(__dirname, '../../uploads', path.basename(document.filePath));

    // Check if file exists
    try {
      await fs.access(filePath);
      res.download(filePath);
    } catch (error) {
      res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download document'
    });
  }
});

// Verify document on blockchain
router.post('/:id/verify-blockchain', authenticateToken, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    // Check if user owns the document
    if (document.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Verify on blockchain
    const blockchainResult = await blockchainService.verifyDocumentHash(document.documentHash);

    // Update document with blockchain info
    document.blockchainTxHash = blockchainResult.txHash;
    document.verifiedOnChain = true;
    document.verificationStatus = 'Verified';
    document.verifiedAt = new Date();
    await document.save();

    res.json({
      success: true,
      message: 'Document verified on blockchain',
      data: {
        document,
        blockchain: blockchainResult,
      },
    });

  } catch (error) {
    console.error('Blockchain verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify document on blockchain'
    });
  }
});

module.exports = router;
