const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/egsa_propagator';

  // Don't crash the server if MongoDB is unavailable — keep retrying
  const connectWithRetry = async () => {
    try {
      await mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 5000,  // Timeout after 5s instead of 30s
      });
      console.log('MongoDB connected...');
    } catch (err) {
      console.error('MongoDB connection failed:', err.message);
      console.log('Retrying MongoDB connection in 10 seconds...');
      setTimeout(connectWithRetry, 10000);
    }
  };

  // Handle connection events
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Attempting reconnection...');
  });

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message);
  });

  await connectWithRetry();
};

module.exports = connectDB;
