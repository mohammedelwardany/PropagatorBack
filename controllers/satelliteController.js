const Satellite = require('../models/satellite');
const { tleUpdate, tleSplit } = require('../utills/tle_process');

// Create a new satellite
exports.createSatellite = async (req, res) => {
    const { satid } = req.body;

    try {
        // Fetch the TLE data using await for better async handling
        const TLE = await tleUpdate(satid);

        if (!TLE) {
            return res.status(500).json({ error: 'Failed to fetch TLE data' });
        }

        // Split the TLE data
        const splittedTle = tleSplit(TLE);
        const TLEArrayFormatData = {
            tle: splittedTle.tle,
            tle_line1: splittedTle.tle2DArray[1],
            tle_line2: splittedTle.tle2DArray[2],
            lastUpdateEpoch: splittedTle.tle3DArray[1][3]
        };

        // Create a new satellite document
        const satellite = new Satellite({
            SATname: splittedTle.tle2DArray[0],
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
        res.status(500).json({ error: err.message });
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





// Function to fetch and update satellite TLE
exports.updateSatelliteTLE = async (req, res) => {

    try {
        // Find the satellite by ID and update
        const satellite = await Satellite.findById(req.params.id);
        if (!satellite) {
            return res.status(404).json({ error: 'Satellite not found' });
        }
        const lastTLEData = satellite.TLEs[0]
        // Fetch the TLE data
        const TLE = await tleUpdate(satellite.satid).catch(err => {
            console.error("Error fetching TLE data:", err);
            throw new Error(err.message);
        });

        if (!TLE) {
            return res.status(500).json({ error: 'Failed to fetch TLE data' });
        }

        // Split the TLE data
        const splittedTle = tleSplit(TLE);
        const TLEArrayFormatData = {
            tle: splittedTle.tle,
            tle_line1: splittedTle.tle2DArray[1],
            tle_line2: splittedTle.tle2DArray[2],
            lastUpdateEpoch: splittedTle.tle3DArray[1][3]
        };


        if (lastTLEData.lastUpdateEpoch === TLEArrayFormatData.lastUpdateEpoch) {
            res.status(501).json({ error: "data is exists" });
        }
        if (lastTLEData.lastUpdateEpoch !== TLEArrayFormatData.lastUpdateEpoch) {
            // Add the new TLE data to the TLEs array
            satellite.TLEs.push(TLEArrayFormatData);

            // Sort the TLEs array by lastUpdateEpoch in descending order
            satellite.TLEs.sort((a, b) => b.lastUpdateEpoch - a.lastUpdateEpoch);

            // Save the updated satellite document
            await satellite.save();

            res.json(satellite);
        }


    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


// Delete a satellite
exports.deleteSatellite = async (req, res) => {
    try {
        const satellite = await Satellite.findByIdAndDelete(req.params.id);
        if (!satellite) return res.status(404).json({ error: 'Satellite not found' });
        res.json({ message: 'Satellite deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};




// // Update a satellite TLE
// exports.updateSatelliteTLE = async (req, res) => {
//     const { satid } = req.body;
//     try {

//         const TLE = tleUpdate(satid).then(data => {
//             return data;
//         }).catch(err => {
//             console.error("Error fetching TLE data:", err);
//             res.status(500).json({ error: err.message });
//             return null
//         });
//         const splittedTle = tleSplit(TLE);
//         const TLEArrayFormatData = {
//             tle: splittedTle.tle,
//             tle_line1: splittedTle.tle2DArray[1],
//             tle_line2: splittedTle.tle2DArray[2],
//             lastUpdateEpoch: splittedTle.tle3DArray[1][4]
//         }

//         //CHANGE HERE
//         const satellite = await Satellite.findByIdAndUpdate(
//             req.params.id,
//             { SATname, satid, lastUpdatedEpoch, lastTLE, TLEs{OLD AND TLEArrayFormatData AND SORT IT BY LATEST TO OLD} },
//             { new: true }
//         );
//         if (!satellite) return res.status(404).json({ error: 'Satellite not found' });
//         res.json(satellite);
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// };