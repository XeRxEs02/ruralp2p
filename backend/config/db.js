const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://ruralconnect:ruralconnect@ruralconnect.lnubbq5.mongodb.net/ruralconnect?retryWrites=true&w=majority';

    console.log('🔄 Attempting MongoDB connection...');
    console.log('📄 Using URI:', mongoUri.substring(0, 50) + '...');

    const conn = await mongoose.connect(mongoUri);

    console.log(`✅ MongoDB Connected Successfully!`);
    console.log(`🌐 Host: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    console.log(`🔗 Port: ${conn.connection.port}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🔌 MongoDB disconnected');
    });

    return conn;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('⚠️ Server will continue to run without database connection');
    // Don't exit process, allow server to run without DB
  }
};

module.exports = connectDB;
