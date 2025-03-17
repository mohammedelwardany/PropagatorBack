const mongoose = require('mongoose');

const StationSchema = new mongoose.Schema({
  owner: String,
  stationName: String,
  lat: Number,
  long: Number,
  alt: Number
});

module.exports = mongoose.model('Station', StationSchema);
