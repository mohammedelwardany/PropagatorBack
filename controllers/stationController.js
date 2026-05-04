const Station = require('../models/station');

// Create a new station
exports.createStation = async (req, res) => {
  const { owner, stationName, lat, long, alt } = req.body;
  try {
    const station = new Station({ owner, stationName, lat, long, alt });
    await station.save();
    res.status(201).json(station);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all stations
exports.getAllStations = async (req, res) => {
  try {
    const stations = await Station.find();
    res.json(stations);
  } catch (err) {
    // Return empty array instead of 500 if DB is down
    console.warn('DB disconnected: Returning empty station list.');
    res.json([]);
  }
};

// Get a station by ID
exports.getStationById = async (req, res) => {
  try {
    const station = await Station.findById(req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });
    res.json(station);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update a station
exports.updateStation = async (req, res) => {
  const { owner, stationName, lat, long, alt } = req.body;
  try {
    const station = await Station.findByIdAndUpdate(
      req.params.id,
      { owner, stationName, lat, long, alt },
      { new: true }
    );
    if (!station) return res.status(404).json({ error: 'Station not found' });
    res.json(station);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a station
exports.deleteStation = async (req, res) => {
  try {
    const station = await Station.findByIdAndDelete(req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });
    res.json({ message: 'Station deleted' });
  } catch (err) {
    res.status(503).json({ error: 'Database unavailable' });
  }
};
