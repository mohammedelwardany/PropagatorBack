const mongoose = require('mongoose');

const TleSchema = new mongoose.Schema({
  tle: String,
  tle_line1: String,
  tle_line2: String,
  lastUpdateEpoch: { type: String, unique: true }
});

const SatelliteSchema = new mongoose.Schema({
  SATname: String,
  satid: { type: String, unique: true },
  TLEs: [TleSchema]
});

module.exports = mongoose.model('Satellite', SatelliteSchema);
