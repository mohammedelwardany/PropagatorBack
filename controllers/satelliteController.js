const Satellite = require('../models/satellite');
const { tleUpdate, tleSplit } = require('../utills/tle_process');

// Create a new satellite
exports.createSatellite = async (req, res) => {
    const { satid } = req.body;

    try {
        if (!satid) {
            return res.status(400).json({ error: 'satid (NORAD catalog number) is required' });
        }

        // Check if satellite already exists
        const existing = await Satellite.findOne({ satid });
        if (existing) {
            return res.status(409).json({ error: 'Satellite already exists', satellite: existing });
        }

        // Fetch the TLE data from CelesTrak
        const TLE = await tleUpdate(satid);

        if (!TLE) {
            return res.status(500).json({ error: 'Failed to fetch TLE data from CelesTrak' });
        }

        // Split the TLE data
        const splittedTle = tleSplit(TLE);
        const TLEArrayFormatData = {
            tle: splittedTle.tle,
            tle_line1: splittedTle.tleLine1,
            tle_line2: splittedTle.tleLine2,
            lastUpdateEpoch: splittedTle.tle3DArray[1][3]
        };

        // Create a new satellite document
        const satellite = new Satellite({
            SATname: splittedTle.satName || splittedTle.tle2DArray[0],
            satid: satid,
            TLEs: [TLEArrayFormatData]
        });

        // Save the satellite document to the database
        await satellite.save();

        res.status(201).json(satellite);
    } catch (err) {
        console.error('Error creating satellite:', err);
        res.status(500).json({ error: err.message });
    }
};

// Get all satellites
exports.getAllSatellites = async (req, res) => {
    try {
        const satellites = await Satellite.find();
        res.json(satellites);
    } catch (err) {
        // Return empty array instead of 500 if DB is down
        console.warn('DB disconnected: Returning empty satellite list.');
        res.json([]);
    }
};

// Get a satellite by ID
exports.getSatelliteById = async (req, res) => {
    try {
        const satellite = await Satellite.findById(req.params.id);
        if (!satellite) return res.status(404).json({ error: 'Satellite not found' });
        res.json(satellite);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Fetch and update satellite TLE — adds new TLE to history if epoch changed
exports.updateSatelliteTLE = async (req, res) => {
    try {
        // Find the satellite by ID
        const satellite = await Satellite.findById(req.params.id);
        if (!satellite) {
            return res.status(404).json({ error: 'Satellite not found' });
        }

        // Fetch fresh TLE data from CelesTrak
        const TLE = await tleUpdate(satellite.satid);
        if (!TLE) {
            return res.status(500).json({ error: 'Failed to fetch TLE data from CelesTrak' });
        }

        // Split the TLE data
        const splittedTle = tleSplit(TLE);
        const TLEArrayFormatData = {
            tle: splittedTle.tle,
            tle_line1: splittedTle.tleLine1,
            tle_line2: splittedTle.tleLine2,
            lastUpdateEpoch: splittedTle.tle3DArray[1][3]
        };

        // Check if the TLE epoch already exists in the history
        const lastTLEData = satellite.TLEs[0];
        if (lastTLEData && lastTLEData.lastUpdateEpoch === TLEArrayFormatData.lastUpdateEpoch) {
            return res.status(200).json({
                message: "TLE is already up to date",
                satellite,
            });
        }

        // Add the new TLE data to the TLEs array
        satellite.TLEs.unshift(TLEArrayFormatData);

        // Sort the TLEs array by lastUpdateEpoch in descending order (newest first)
        satellite.TLEs.sort((a, b) => {
            const epochA = parseFloat(a.lastUpdateEpoch) || 0;
            const epochB = parseFloat(b.lastUpdateEpoch) || 0;
            return epochB - epochA;
        });

        // Save the updated satellite document
        await satellite.save();

        return res.status(200).json({
            message: "TLE updated successfully",
            satellite,
        });
    } catch (err) {
        console.error('Error updating satellite TLE:', err);
        if (!res.headersSent) {
            return res.status(500).json({ error: err.message });
        }
    }
};

// Delete a satellite
exports.deleteSatellite = async (req, res) => {
    try {
        const satellite = await Satellite.findByIdAndDelete(req.params.id);
        if (!satellite) return res.status(404).json({ error: 'Satellite not found' });
        res.json({ message: 'Satellite deleted' });
    } catch (err) {
        res.status(503).json({ error: 'Database unavailable' });
    }
};