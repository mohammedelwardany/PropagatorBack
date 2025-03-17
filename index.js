const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const connectDB = require('./Config/db');
const satelliteRoutes = require('./routes/satelliteRoutes');
const stationRoutes = require('./routes/stationRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const authRoutes = require('./routes/authRoutes');


const app = express();
// const corsOptions = {
//   origin: 'http://localhost:5173'||'*', // The frontend URL
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
// };
app.use(cors());
// Connect to the database
connectDB();

// Middleware
app.use(bodyParser.json());

// Routes
app.use('/api/auth', authRoutes);

app.use('/api/satellites', satelliteRoutes);
app.use('/api/stations', stationRoutes);
app.use('/api/predictsessions', predictionRoutes);


app.get('/', (req, res) => {
  res.send('API is running...');
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('Server running on http://0.0.0.0:5000');
});
