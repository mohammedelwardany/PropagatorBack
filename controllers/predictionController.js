const predictSessions = require("../utills/propagator_process");
const { tleSplit } = require("../utills/tle_process");
const Satellite = require("../models/satellite");
const Station = require("../models/station");
const Sessions = require("../models/sessions");

/**
 * Predict communication sessions (forward propagation).
 * Accepts TLE directly or looks up satellite/station from the database.
 * Uses the LATEST TLE if satellite is found in DB and no TLE is provided.
 */
exports.predictCommunicationSessions = async (req, res) => {
  const {
    SatelliteId,
    StationId,
    TLE,
    lat,
    long,
    altitude,
    startDate,
    endDate,
    interval,
    minElevation,
  } = req.body;

  try {
    console.log("Received prediction request:", req.body);

    let satelliteData = null;
    let stationData = null;

    // Only look up satellite in DB if we need its TLE (i.e., no TLE provided directly)
    if (SatelliteId && !TLE) {
      try {
        satelliteData = await Satellite.findOne({ satid: SatelliteId });
        if (!satelliteData) {
          try {
            satelliteData = await Satellite.findById(SatelliteId);
          } catch (_) {
            // Not a valid ObjectId, ignore
          }
        }
        if (!satelliteData) {
          return res.status(404).json({ error: "Satellite not found in database" });
        }
      } catch (dbErr) {
        return res.status(503).json({ error: "Database unavailable. Provide TLE directly." });
      }
    }

    // Only look up station in DB if we need its coordinates (i.e., no lat/long provided)
    if (StationId && (lat == null || long == null)) {
      try {
        stationData = await Station.findOne({ stationName: StationId });
        if (!stationData) {
          try {
            stationData = await Station.findById(StationId);
          } catch (_) {}
        }
        if (!stationData) {
          return res.status(404).json({ error: "Station not found in database" });
        }
      } catch (dbErr) {
        return res.status(503).json({ error: "Database unavailable. Provide lat/long directly." });
      }
    }

    // Determine which TLE to use
    let tleLine1, tleLine2;

    if (TLE) {
      // User provided TLE directly
      const splittedTle = tleSplit(TLE);
      tleLine1 = splittedTle.tleLine1;
      tleLine2 = splittedTle.tleLine2;
    } else if (satelliteData && satelliteData.TLEs && satelliteData.TLEs.length > 0) {
      // Use the latest TLE from the database (TLEs are sorted by epoch descending)
      const latestTLE = satelliteData.TLEs[0];
      tleLine1 = latestTLE.tle_line1;
      tleLine2 = latestTLE.tle_line2;
    } else {
      return res.status(400).json({ error: "No TLE data provided or found in database." });
    }

    if (!tleLine1 || !tleLine2) {
      return res.status(400).json({ error: "Invalid TLE format — could not extract line1 and line2." });
    }

    // Determine ground station coordinates
    const groundLat = lat ?? stationData?.lat;
    const groundLon = long ?? stationData?.long;
    const groundAlt = altitude ?? stationData?.alt ?? 0;

    if (groundLat == null || groundLon == null) {
      return res.status(400).json({
        error: "Ground station coordinates (lat, long) are required. Provide them directly or via StationId.",
      });
    }

    const startTime = startDate ? new Date(startDate) : new Date();
    const endTime = endDate
      ? new Date(endDate)
      : new Date(startTime.getTime() + 5 * 24 * 60 * 60 * 1000); // Default: +5 days

    // Validate dates
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return res.status(400).json({ error: "Invalid startDate or endDate format." });
    }

    // Predict sessions
    const sessions = predictSessions({
      tleLine1,
      tleLine2,
      latitude: groundLat,
      longitude: groundLon,
      altitude: groundAlt,
      startDateTime: startTime.toISOString(),
      endDateTime: endTime.toISOString(),
      interval: interval || 1,
      minElevation: minElevation ?? 5,
    });

    if (!sessions || sessions.error) {
      console.error("Prediction error:", sessions?.error);
      return res.status(400).json({ error: sessions?.error || "Prediction failed." });
    }

    return res.status(200).json({
      sessions,
      meta: {
        satelliteId: SatelliteId || null,
        satelliteName: satelliteData?.SATname || null,
        stationId: StationId || null,
        stationName: stationData?.stationName || null,
        groundStation: { lat: groundLat, long: groundLon, altitude: groundAlt },
        timeRange: { start: startTime.toISOString(), end: endTime.toISOString() },
        minElevation: minElevation ?? 5,
        totalSessions: sessions.length,
      },
    });
  } catch (err) {
    console.error("Internal server error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
  }
};

/**
 * Back-propagation: Predict sessions using a PAST TLE from the satellite's TLE history.
 * This allows analyzing what sessions were available at a previous epoch.
 *
 * POST /api/predictsessions/backpropagate
 * Body: { SatelliteId, tleIndex?, tleEpoch?, StationId?, lat?, long?, altitude?, startDate?, endDate?, interval?, minElevation? }
 */
exports.backPropagate = async (req, res) => {
  const {
    SatelliteId,
    tleIndex,
    tleEpoch,
    StationId,
    lat,
    long,
    altitude,
    startDate,
    endDate,
    interval,
    minElevation,
  } = req.body;

  try {
    if (!SatelliteId) {
      return res.status(400).json({ error: "SatelliteId is required for back-propagation." });
    }

    // Find satellite
    let satelliteData = null;
    try {
      satelliteData = await Satellite.findOne({ satid: SatelliteId });
      if (!satelliteData) {
        try {
          satelliteData = await Satellite.findById(SatelliteId);
        } catch (_) {}
      }
      if (!satelliteData) {
        return res.status(404).json({ error: "Satellite not found in database." });
      }
    } catch (dbErr) {
      return res.status(503).json({ error: "Database unavailable. Back-propagation requires TLE history from DB." });
    }

    if (!satelliteData.TLEs || satelliteData.TLEs.length === 0) {
      return res.status(400).json({ error: "No TLE history available for this satellite." });
    }

    // Select the TLE to use for back-propagation
    let selectedTLE = null;

    if (tleIndex != null) {
      // Select by index (0 = latest, 1 = second latest, etc.)
      if (tleIndex < 0 || tleIndex >= satelliteData.TLEs.length) {
        return res.status(400).json({
          error: `Invalid tleIndex. Available range: 0 to ${satelliteData.TLEs.length - 1}`,
        });
      }
      selectedTLE = satelliteData.TLEs[tleIndex];
    } else if (tleEpoch) {
      // Select by epoch match
      selectedTLE = satelliteData.TLEs.find(
        (t) => t.lastUpdateEpoch === tleEpoch
      );
      if (!selectedTLE) {
        return res.status(404).json({
          error: `No TLE found with epoch ${tleEpoch}. Available epochs: ${satelliteData.TLEs.map((t) => t.lastUpdateEpoch).join(", ")}`,
        });
      }
    } else {
      // Default: use the oldest TLE (last in the sorted array) for back-propagation
      // Or if user wants latest, they should use the normal endpoint
      return res.status(400).json({
        error: "Provide tleIndex or tleEpoch to select which past TLE to use. Available TLEs:",
        tles: satelliteData.TLEs.map((t, i) => ({
          index: i,
          epoch: t.lastUpdateEpoch,
          line1: t.tle_line1,
        })),
      });
    }

    const tleLine1 = selectedTLE.tle_line1;
    const tleLine2 = selectedTLE.tle_line2;

    if (!tleLine1 || !tleLine2) {
      return res.status(400).json({ error: "Selected TLE is missing line1 or line2 data." });
    }

    // Fetch station data if provided
    let stationData = null;
    if (StationId) {
      try {
        stationData = await Station.findOne({ stationName: StationId });
        if (!stationData) {
          try {
            stationData = await Station.findById(StationId);
          } catch (_) {}
        }
        if (!stationData) {
          return res.status(404).json({ error: "Station not found in database." });
        }
      } catch (dbErr) {
        // Not critical if lat/long are provided, but let's be safe
        if (lat == null || long == null) {
          return res.status(503).json({ error: "Database unavailable. Provide lat/long directly." });
        }
      }
    }

    // Determine ground station coordinates
    const groundLat = lat ?? stationData?.lat;
    const groundLon = long ?? stationData?.long;
    const groundAlt = altitude ?? stationData?.alt ?? 0;

    if (groundLat == null || groundLon == null) {
      return res.status(400).json({
        error: "Ground station coordinates (lat, long) are required.",
      });
    }

    // For back-propagation, default time range is around the TLE epoch
    // Parse epoch from TLE line1
    let defaultStart, defaultEnd;
    if (startDate) {
      defaultStart = new Date(startDate);
    } else {
      // Use TLE epoch as the start point
      defaultStart = parseTLEEpoch(tleLine1);
    }
    defaultEnd = endDate
      ? new Date(endDate)
      : new Date(defaultStart.getTime() + 5 * 24 * 60 * 60 * 1000);

    if (isNaN(defaultStart.getTime()) || isNaN(defaultEnd.getTime())) {
      return res.status(400).json({ error: "Invalid date format." });
    }

    // Predict sessions using the past TLE
    const sessions = predictSessions({
      tleLine1,
      tleLine2,
      latitude: groundLat,
      longitude: groundLon,
      altitude: groundAlt,
      startDateTime: defaultStart.toISOString(),
      endDateTime: defaultEnd.toISOString(),
      interval: interval || 1,
      minElevation: minElevation ?? 5,
    });

    if (!sessions || sessions.error) {
      console.error("Back-propagation error:", sessions?.error);
      return res.status(400).json({ error: sessions?.error || "Back-propagation failed." });
    }

    return res.status(200).json({
      sessions,
      meta: {
        mode: "back-propagation",
        satelliteId: SatelliteId,
        satelliteName: satelliteData.SATname,
        tleEpoch: selectedTLE.lastUpdateEpoch,
        tleIndex: tleIndex ?? null,
        stationId: StationId || null,
        stationName: stationData?.stationName || null,
        groundStation: { lat: groundLat, long: groundLon, altitude: groundAlt },
        timeRange: { start: defaultStart.toISOString(), end: defaultEnd.toISOString() },
        minElevation: minElevation ?? 5,
        totalSessions: sessions.length,
        availableTLEs: satelliteData.TLEs.length,
      },
    });
  } catch (err) {
    console.error("Back-propagation error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
  }
};

/**
 * Get all available TLEs for a satellite (for back-propagation selection).
 * GET /api/predictsessions/tle-history/:satid
 */
exports.getTLEHistory = async (req, res) => {
  try {
    const { satid } = req.params;

    let satelliteData = null;
    try {
      satelliteData = await Satellite.findOne({ satid });
      if (!satelliteData) {
        try {
          satelliteData = await Satellite.findById(satid);
        } catch (_) {}
      }
      if (!satelliteData) {
        return res.status(404).json({ error: "Satellite not found." });
      }
    } catch (dbErr) {
      return res.status(503).json({ error: "Database unavailable." });
    }

    const tleHistory = satelliteData.TLEs.map((tle, index) => ({
      index,
      epoch: tle.lastUpdateEpoch,
      tle_line1: tle.tle_line1,
      tle_line2: tle.tle_line2,
      tle_raw: tle.tle,
    }));

    return res.status(200).json({
      satelliteId: satelliteData.satid,
      satelliteName: satelliteData.SATname,
      totalTLEs: tleHistory.length,
      tles: tleHistory,
    });
  } catch (err) {
    console.error("Error fetching TLE history:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
  }
};

/**
 * Parse the epoch date from a TLE line 1.
 * Field format: YYDDD.DDDDDDDD (columns 19-32)
 */
function parseTLEEpoch(tleLine1) {
  try {
    const epochStr = tleLine1.substring(18, 32).trim();
    const yearPart = parseInt(epochStr.substring(0, 2), 10);
    const dayPart = parseFloat(epochStr.substring(2));

    const year = yearPart < 57 ? 2000 + yearPart : 1900 + yearPart;

    // Day of year to Date
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const epochMs = jan1.getTime() + (dayPart - 1) * 86400000;
    return new Date(epochMs);
  } catch {
    return new Date(); // fallback to now
  }
}
