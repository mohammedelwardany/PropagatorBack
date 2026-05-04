const mongoose = require('mongoose');

// Define the Session schema (matches propagator output)
const SessionSchema = new mongoose.Schema({
  startTime: String,
  endTime: String,
  durationSeconds: Number,
  startAzimuth: Number,
  endAzimuth: Number,
  maxElevation: Number,
  maxElevationAzimuth: Number,
  maxElevationTime: String,
  startAtMinElevation: String,
  endAtMinElevation: String,
  orbitNumber: Number,
  minRange: Number,
});

// Define the SatelliteSession schema
const SatelliteSessionSchema = new mongoose.Schema({
  satId: { type: String, required: true },
  stationId: { type: String },
  tleEpoch: String,
  createdAt: { type: Date, default: Date.now },
  sessions: [SessionSchema],
});

module.exports = mongoose.model('Sessions', SatelliteSessionSchema);
