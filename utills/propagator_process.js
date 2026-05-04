const satellite = require("satellite.js");

/**
 * Accurate satellite session predictor.
 * Computes visibility windows (communication sessions) for a satellite
 * as observed from a ground station, including detailed look-angle data.
 *
 * @param {Object} options
 * @param {string} options.tleLine1 - TLE line 1
 * @param {string} options.tleLine2 - TLE line 2
 * @param {number} options.latitude - Observer latitude in degrees
 * @param {number} options.longitude - Observer longitude in degrees
 * @param {number} options.altitude - Observer altitude in meters above sea level
 * @param {string} options.startDateTime - ISO 8601 start time
 * @param {string} options.endDateTime - ISO 8601 end time
 * @param {number} options.interval - Sampling interval in seconds (default: 1)
 * @param {number} options.minElevation - Minimum useful elevation in degrees (default: 5)
 * @returns {Array|Object} Array of session objects, or { error } on failure
 */
const predictSessions = ({
  tleLine1 = "",
  tleLine2 = "",
  latitude = 0,
  longitude = 0,
  altitude = 0,
  startDateTime = new Date().toISOString(),
  endDateTime = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
  interval = 1,
  minElevation = 5,
}) => {
  try {
    if (!tleLine1 || !tleLine2) throw new Error("Missing TLE lines");

    // Trim whitespace that can corrupt TLE parsing
    tleLine1 = tleLine1.trim();
    tleLine2 = tleLine2.trim();

    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    if (!satrec || satrec.error) {
      throw new Error(
        `Invalid TLE data: ${satrec?.error || "twoline2satrec returned null"}`
      );
    }

    const observerGd = {
      latitude: satellite.degreesToRadians(latitude),
      longitude: satellite.degreesToRadians(longitude),
      height: altitude / 1000, // convert meters → km for satellite.js
    };

    const start = new Date(startDateTime);
    const end = new Date(endDateTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error("Invalid start or end date");
    }
    if (end <= start) {
      throw new Error("End date must be after start date");
    }

    // ---- Orbital period for orbit-number computation ----
    // satrec.no is mean motion in radians/minute
    const orbitalPeriodMinutes = (2 * Math.PI) / satrec.no;
    const orbitalPeriodMs = orbitalPeriodMinutes * 60 * 1000;

    // Parse revolution number at epoch from TLE line 2 (columns 64-68)
    // satrec.revnum is undefined in satellite.js v5, so we parse it manually
    let revnumAtEpoch = 0;
    try {
      const revStr = tleLine2.substring(63, 68).trim();
      revnumAtEpoch = parseInt(revStr, 10) || 0;
    } catch (_) {
      revnumAtEpoch = 0;
    }

    // Epoch date from TLE
    const epochYear =
      satrec.epochyr < 57 ? 2000 + satrec.epochyr : 1900 + satrec.epochyr;
    const epochJD = satellite.jday(epochYear, 1, 0, 0, 0, 0) + satrec.epochdays;
    // Julian Day → JS timestamp (JD 2440587.5 = Unix epoch)
    const epochMs = (epochJD - 2440587.5) * 86400000;
    const epochDate = new Date(epochMs);

    /**
     * Compute satellite look-angles and geodetic position at a given time.
     */
    const computeAtTime = (time) => {
      const positionAndVelocity = satellite.propagate(satrec, time);
      if (
        !positionAndVelocity.position ||
        typeof positionAndVelocity.position === "boolean"
      ) {
        return null;
      }

      const positionEci = positionAndVelocity.position;
      const gmst = satellite.gstime(time);

      // Look angles from observer
      const positionEcf = satellite.eciToEcf(positionEci, gmst);
      const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);

      // Geodetic position of the satellite (lat/lon/alt)
      const positionGd = satellite.eciToGeodetic(positionEci, gmst);

      const elevationDeg = satellite.radiansToDegrees(lookAngles.elevation);
      const azimuthDeg = satellite.radiansToDegrees(lookAngles.azimuth);
      const rangeSat = lookAngles.rangeSat; // slant range in km

      // Orbit number relative to TLE epoch
      const timeSinceEpochMs = time.getTime() - epochDate.getTime();
      const orbitNumber =
        revnumAtEpoch + Math.floor(timeSinceEpochMs / orbitalPeriodMs);

      // Sub-satellite point
      const satLatDeg = satellite.radiansToDegrees(positionGd.latitude);
      const satLonDeg = satellite.radiansToDegrees(positionGd.longitude);
      const satAltKm = positionGd.height;

      return {
        time: time.toISOString(),
        elevation: elevationDeg,
        azimuth: azimuthDeg,
        range: rangeSat,
        orbitNumber,
        satLat: satLatDeg,
        satLon: satLonDeg,
        satAlt: satAltKm,
      };
    };

    // ---- Phase 1: Coarse scan (every 30s) to find approximate AOS times ----
    const coarseInterval = Math.min(30, interval); // 30-second coarse scan
    const coarsePoints = [];
    for (
      let t = new Date(start);
      t <= end;
      t = new Date(t.getTime() + coarseInterval * 1000)
    ) {
      const data = computeAtTime(t);
      if (data) coarsePoints.push(data);
    }

    // ---- Phase 2: Identify session boundaries from coarse scan ----
    // Find transitions from below-horizon to above-horizon and vice versa
    const sessionWindows = [];
    let inSession = false;
    let windowStart = null;

    for (let i = 0; i < coarsePoints.length; i++) {
      const aboveHorizon = coarsePoints[i].elevation >= 0;
      if (aboveHorizon && !inSession) {
        // Session starting — look back one coarse step for true AOS
        windowStart = i > 0 ? coarsePoints[i - 1].time : coarsePoints[i].time;
        inSession = true;
      } else if (!aboveHorizon && inSession) {
        // Session ending
        const windowEnd = coarsePoints[i].time;
        sessionWindows.push({ start: windowStart, end: windowEnd });
        inSession = false;
      }
    }
    // Handle session still open at end of range
    if (inSession) {
      sessionWindows.push({
        start: windowStart,
        end: coarsePoints[coarsePoints.length - 1].time,
      });
    }

    // ---- Phase 3: Fine-resolution scan within each session window ----
    const sessions = [];

    for (const window of sessionWindows) {
      const wStart = new Date(window.start);
      const wEnd = new Date(window.end);

      // Collect fine-grained points
      const finePoints = [];
      for (
        let t = new Date(wStart);
        t <= wEnd;
        t = new Date(t.getTime() + interval * 1000)
      ) {
        const data = computeAtTime(t);
        if (data) finePoints.push(data);
      }

      // Group into sessions based on elevation >= 0 (above horizon)
      let currentSession = null;

      for (const point of finePoints) {
        if (point.elevation >= 0) {
          if (!currentSession) {
            currentSession = {
              startTime: point.time,
              endTime: point.time,
              startAzimuth: point.azimuth,
              endAzimuth: point.azimuth,
              maxElevation: point.elevation,
              maxElevationAzimuth: point.azimuth,
              maxElevationTime: point.time,
              startAtMinElevation: null,
              endAtMinElevation: null,
              orbitNumber: point.orbitNumber,
              minRange: point.range,
              points: [point],
            };
            if (point.elevation >= minElevation) {
              currentSession.startAtMinElevation = point.time;
            }
          } else {
            currentSession.endTime = point.time;
            currentSession.endAzimuth = point.azimuth;

            if (point.elevation > currentSession.maxElevation) {
              currentSession.maxElevation = point.elevation;
              currentSession.maxElevationAzimuth = point.azimuth;
              currentSession.maxElevationTime = point.time;
            }

            if (point.range < currentSession.minRange) {
              currentSession.minRange = point.range;
            }

            // Track when elevation crosses minElevation threshold
            const prev = currentSession.points[currentSession.points.length - 1];
            if (
              prev.elevation < minElevation &&
              point.elevation >= minElevation &&
              !currentSession.startAtMinElevation
            ) {
              currentSession.startAtMinElevation = point.time;
            }
            if (
              prev.elevation >= minElevation &&
              point.elevation < minElevation
            ) {
              currentSession.endAtMinElevation = prev.time;
            }

            currentSession.points.push(point);
          }
        } else if (currentSession) {
          // Close current session
          // If we never dropped below minElevation during the pass, set endAtMinElevation
          if (
            currentSession.startAtMinElevation &&
            !currentSession.endAtMinElevation
          ) {
            currentSession.endAtMinElevation = currentSession.endTime;
          }
          finalizeAndPush(currentSession, sessions, minElevation);
          currentSession = null;
        }
      }

      // Push last session in this window if still open
      if (currentSession) {
        if (
          currentSession.startAtMinElevation &&
          !currentSession.endAtMinElevation
        ) {
          currentSession.endAtMinElevation = currentSession.endTime;
        }
        finalizeAndPush(currentSession, sessions, minElevation);
      }
    }

    return sessions;
  } catch (error) {
    console.error("Error predicting sessions:", error.message);
    return { error: error.message };
  }
};

/**
 * Finalize a session object and push it to the sessions array.
 * Removes the raw points array and computes duration.
 */
function finalizeAndPush(session, sessions, minElevation) {
  const startMs = new Date(session.startTime).getTime();
  const endMs = new Date(session.endTime).getTime();
  const durationSeconds = (endMs - startMs) / 1000;

  // Only include sessions that actually cross the minElevation threshold
  // (unless minElevation is 0, include all above-horizon passes)
  if (minElevation > 0 && session.maxElevation < minElevation) {
    return; // Skip passes that never reach minElevation
  }

  sessions.push({
    startTime: session.startTime,
    endTime: session.endTime,
    durationSeconds,
    startAzimuth: round(session.startAzimuth, 2),
    endAzimuth: round(session.endAzimuth, 2),
    maxElevation: round(session.maxElevation, 2),
    maxElevationAzimuth: round(session.maxElevationAzimuth, 2),
    maxElevationTime: session.maxElevationTime,
    startAtMinElevation: session.startAtMinElevation,
    endAtMinElevation: session.endAtMinElevation,
    orbitNumber: session.orbitNumber,
    minRange: round(session.minRange, 2),
  });
}

function round(val, decimals) {
  if (val == null) return null;
  return Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

module.exports = predictSessions;
