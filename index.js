const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./Config/db');

const satelliteRoutes = require('./routes/satelliteRoutes');
const stationRoutes = require('./routes/stationRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const authRoutes = require('./routes/authRoutes');

dotenv.config(); // Load environment variables from .env file

const app = express();

// Use CORS (open for all origins or customize as needed)
app.use(cors());

// Connect to MongoDB
connectDB();

// Middleware to parse JSON requests
app.use(bodyParser.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/satellites', satelliteRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/predictsessions', predictionRoutes);

// Test route
app.get('/', (req, res) => {
  res.send('EGSA Propagator API is running...');
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});
