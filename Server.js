const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const connectDB = require("./Config/db");
const satelliteRoutes = require("./routes/satelliteRoutes");
const stationRoutes = require("./routes/stationRoutes");
const predictionRoutes = require("./routes/predictionRoutes");
const authRoutes = require("./routes/authRoutes");
const serverless = require("serverless-http"); // Required for Vercel

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Connect to the database
connectDB();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/satellites", satelliteRoutes);
app.use("/api/stations", stationRoutes);
app.use("/api/predictsessions", predictionRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("API is running on Vercel...");
});

// Export the serverless function
module.exports = serverless(app);
