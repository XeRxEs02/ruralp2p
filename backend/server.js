require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { createServer } = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import existing routes
const authRoutes = require('./routes/auth');
const loanRoutes = require('./routes/loans');
const faceRoutes = require('./routes/face');
const analyticsRoutes = require('./routes/analytics');
const walletRoutes = require('./routes/wallet');
const userRoutes = require('./routes/user');

// Import new integrated routes
const paymentRoutes = require('./routes/paymentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const syncRoutes = require('./routes/syncRoutes');

// Import services and utilities
const eventBus = require('./utils/eventBus');
const blockchainService = require('./services/blockchainService');
const firebaseService = require('./services/firebaseService');
const twilioService = require('./services/twilioService');

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

// MongoDB Connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ruralconnect';
mongoose.connect(mongoUri, {
  serverSelectionTimeoutMS: 5000,
}).then(() => {
  console.log('✅ Connected to MongoDB successfully!');
}).catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  console.log('⚠️  Server will continue to run without database connection');
});

const db = mongoose.connection;
db.on('error', (err) => {
  console.error('MongoDB error:', err.message);
});
db.on('connected', () => {
  console.log('🔗 MongoDB connection established');
});
db.on('disconnected', () => {
  console.log('🔌 MongoDB disconnected');
});

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
  origin: ['http://localhost:5000', 'http://192.168.29.142:5000', 'http://localhost:3000'],
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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/face', faceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/user', userRoutes);

// New integrated routes
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/sync', syncRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Backend server is running',
    timestamp: new Date(),
    uptime: process.uptime(),
    services: {
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      blockchain: blockchainService.getNetworkInfo().mockMode ? 'mock' : 'operational',
      firebase: firebaseService.getStatus().mockMode ? 'mock' : 'operational',
      twilio: twilioService.getStatus().mockMode ? 'mock' : 'operational'
    }
  });
});

// Clear database endpoint (for development only)
app.post('/api/clear-db', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    for (const collection of collections) {
      await db.collection(collection.name).drop();
      console.log(`🗑️  Dropped collection: ${collection.name}`);
    }

    res.json({
      success: true,
      message: 'Database cleared successfully',
      droppedCollections: collections.map(c => c.name)
    });
  } catch (error) {
    console.error('Error clearing database:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear database'
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Setup WebSocket server for real-time communication
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5000', 'http://192.168.29.142:5000', 'http://localhost:3000'],
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

  socket.on('sync:request', (data) => {
    eventBus.emitEvent('sync.websocket_request', {
      userId: socket.userId,
      socketId: socket.id,
      data
    });
  });

  socket.on('notification:read', (data) => {
    eventBus.emitEvent('notification.websocket_read', {
      userId: socket.userId,
      notificationId: data.notificationId,
      socketId: socket.id
    });
  });

  socket.on('disconnect', (reason) => {
    console.log(`WebSocket client disconnected: ${socket.id}, reason: ${reason}`);
    if (socket.userId) {
      eventBus.emitEvent('user.websocket_disconnected', {
        userId: socket.userId,
        socketId: socket.id,
        reason
      });
    }
  });

  socket.on('error', (error) => {
    console.error(`WebSocket error for ${socket.id}:`, error);
  });
});

// Event bus handlers for real-time notifications
eventBus.on('notification.websocket.send', (data) => {
  if (io && data.userId) {
    io.to(`user:${data.userId}`).emit('notification:new', {
      notificationId: data.notificationId,
      title: data.title,
      message: data.message,
      type: data.type,
      timestamp: data.timestamp
    });
  }
});

eventBus.on('payment.successful', (data) => {
  if (io) {
    io.to(`user:${data.borrowerId}`).emit('payment:successful', {
      transactionId: data.transactionId,
      amount: data.amount,
      loanId: data.loanId
    });
    if (data.lenderId) {
      io.to(`user:${data.lenderId}`).emit('payment:received', {
        transactionId: data.transactionId,
        amount: data.amount,
        loanId: data.loanId
      });
    }
  }
});

eventBus.on('transaction.confirmed', (data) => {
  if (io && data.borrowerId) {
    io.to(`user:${data.borrowerId}`).emit('transaction:confirmed', {
      transactionId: data.transactionId,
      txnHash: data.txnHash,
      loanId: data.loanId
    });
  }
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  console.log(`💾 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⛓️  Blockchain: ${blockchainService.getNetworkInfo().currentNetwork} (${blockchainService.getNetworkInfo().mockMode ? 'Mock' : 'Live'})`);
  console.log(`🔥 Firebase: ${firebaseService.getStatus().mockMode ? 'Mock' : 'Live'}`);
  console.log(`📱 Twilio: ${twilioService.getStatus().mockMode ? 'Mock' : 'Live'}`);
});
