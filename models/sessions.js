const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose); // Import mongoose-sequence

// Define the Sessions schema
const SessionsScheme = new mongoose.Schema({
  id: { type: Number, unique: true }, // Auto-increment field
  startAtZero: String,
  startAtMin: String,
  endAtZero: String,
  endAtMin: String,
  maxElevation: String,
});

// Add auto-increment to the `id` field in the Sessions schema
SessionsScheme.plugin(AutoIncrement, { inc_field: 'id' });

// Define the SatelliteSession schema
const SatelliteSessionScheme = new mongoose.Schema({
  satId: String,
  stationID: String,
  Sessions: [SessionsScheme],
});

module.exports = mongoose.model('Sessions', SatelliteSessionScheme);
