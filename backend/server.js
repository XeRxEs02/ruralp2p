require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createServer } = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import database connection
const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/auth');
const loanRoutes = require('./routes/loanRoutes');
const blockchainRoutes = require('./routes/blockchainRoutes');
const documentRoutes = require('./routes/documentRoutes');
const assetRoutes = require('./routes/assetRoutes');
const seasonalRepaymentRoutes = require('./routes/seasonalRepaymentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const healthRoutes = require('./routes/healthRoutes');

// Import logger
const logger = require('./utils/logger');

// Import services
const blockchainService = require('./services/blockchainService');
const { repaymentFSMService } = require('./services/repaymentFSM');

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "wss:", "ws:"]
    }
  }
}));

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, message: 'Too many requests, please try again later' }
});
app.use(generalLimiter);

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Add HTTP logging middleware
app.use(logger.httpLogger);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/blockchain', blockchainRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/seasonal-repayment', seasonalRepaymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/health', healthRoutes);

// Test blockchain integration
app.get('/api/test-blockchain', async (req, res) => {
  try {
    const networkInfo = blockchainService.getNetworkInfo();
    const gasPrice = await blockchainService.getGasPrice();
    const counter = await blockchainService.getLoanCounter();

    res.json({
      success: true,
      message: 'Blockchain integration test',
      data: {
        network: networkInfo,
        gasPrice,
        loanCounter: counter,
        contractAddress: blockchainService.contractAddresses.loanContract,
      }
    });
  } catch (error) {
    console.error('Blockchain test error:', error);
    res.status(500).json({
      success: false,
      error: 'Blockchain test failed',
      details: error.message
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health',
      'GET /api/test-blockchain',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/send-otp',
      'POST /api/auth/verify-otp',
      'POST /api/loans/create',
      'GET /api/blockchain/network-info',
      'POST /api/assets/register',
      'POST /api/assets/:assetId/tokenize',
      'GET /api/assets',
      'POST /api/seasonal-repayment/create',
      'POST /api/seasonal-repayment/payment',
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Setup WebSocket server for real-time communication
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`WebSocket client connected: ${socket.id}`);

  socket.on('authenticate', (data) => {
    const { userId, token } = data;
    socket.userId = userId;
    socket.join(`user:${userId}`);
    console.log(`User ${userId} authenticated and joined room`);
    socket.emit('authenticated', { success: true, message: 'Successfully authenticated', userId });
  });

  socket.on('disconnect', (reason) => {
    console.log(`WebSocket client disconnected: ${socket.id}, reason: ${reason}`);
  });

  socket.on('error', (error) => {
    console.error(`WebSocket error for ${socket.id}:`, error);
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 RuralConnect Backend Server running on port ${PORT}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  console.log(`💾 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⛓️  Blockchain: ${blockchainService.getNetworkInfo().currentNetwork} (${blockchainService.getNetworkInfo().mockMode ? 'Mock' : 'Live'})`);
  console.log(`📄 Contract: ${blockchainService.contractAddresses.loanContract}`);
  console.log(`\n📋 Available Endpoints:`);
  console.log(`   Health Check: GET /api/health`);
  console.log(`   Test Blockchain: GET /api/test-blockchain`);
  console.log(`   Register: POST /api/auth/register`);
  console.log(`   Login: POST /api/auth/login`);
  console.log(`   Create Loan: POST /api/loans/create`);
  console.log(`   Blockchain Info: GET /api/blockchain/network-info`);
});
