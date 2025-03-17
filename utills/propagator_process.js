const satellite = require('satellite.js');

// Function to predict satellite sessions
const predictSessions = ({
  tleLine1 = "",
  tleLine2 = "",
  groundAcess = { lat: 30.0487, long: 31.6072, altitude: 0.35 },
  startDateTime = new Date(),
  endDateTime = new Date(startDateTime.getTime() + 5 * 24 * 60 * 60 * 1000),
  interval = 1,
  minElevation = 5, // Minimum elevation in degrees
}) => {
  try {
    if (!tleLine1 || !tleLine2) {
      throw new Error("Both TLE lines must be provided.");
    }

    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);

    const observerGd = {
      latitude: satellite.degreesToRadians(groundAcess.lat),
      longitude: satellite.degreesToRadians(groundAcess.long),
      height: groundAcess.altitude,
    };

    const getSatellitePositionAndLookAngles = (time, observerGd) => {
      const positionAndVelocity = satellite.propagate(satrec, time);

      if (!positionAndVelocity.position) {
        return null;
      }

      const positionEci = positionAndVelocity.position;
      const gmst = satellite.gstime(time);
      const positionGd = satellite.eciToGeodetic(positionEci, gmst);
      const lookAngles = satellite.ecfToLookAngles(observerGd, satellite.eciToEcf(positionEci, gmst));

      const elevation = satellite.radiansToDegrees(lookAngles.elevation);
      const azimuth = satellite.radiansToDegrees(lookAngles.azimuth);

      const epochDate = new Date(`${satrec.epochYear} ${satrec.epochDay}`);
      const timeSinceEpoch = (time - epochDate) / 1000;
      const orbitalPeriodSeconds = 86400 / satrec.no_kozai;
      const orbitNumber = Math.floor(timeSinceEpoch / orbitalPeriodSeconds);

      return { elevation, orbitNumber, azimuth };
    };

    const getVisibilityTimes = (start, end, interval, observerGd) => {
      const visibilityTimes = [];
      for (let time = start; time <= end; time = new Date(time.getTime() + interval * 1000)) {
        const satData = getSatellitePositionAndLookAngles(time, observerGd);
        if (satData && satData.elevation >= 0) {
          visibilityTimes.push({
            time,
            orbitNumber: satData.orbitNumber,
            elevation: satData.elevation,
            azimuth: satData.azimuth,
          });
        }
      }
      return visibilityTimes;
    };

    const groupVisibilitySessions = (visibilityTimes) => {
      const visibilitySessions = [];
      let sessionStart = null;
      let sessionStartOrbit = null;
      let maxElevation = null;
      let correspondingAzimuth = null;
      let startAtMinElevation = null;
      let endAtMinElevation = null;

      for (let i = 0; i < visibilityTimes.length; i++) {
        const current = visibilityTimes[i];
        const next = visibilityTimes[i + 1] || null;

        if (sessionStart === null) {
          sessionStart = current.time;
          sessionStartOrbit = current.orbitNumber;
          maxElevation = current.elevation;
          correspondingAzimuth = current.azimuth;
        }

        if (current.elevation > maxElevation) {
          maxElevation = current.elevation;
          correspondingAzimuth = current.azimuth;
        }

        // Detect when elevation crosses minElevation during ascent
        if (current.elevation < minElevation && next && next.elevation >= minElevation) {
          startAtMinElevation = next.time;
        }

        // Detect when elevation crosses minElevation during descent
        if (current.elevation >= minElevation && next && next.elevation < minElevation) {
          endAtMinElevation = current.time;
        }

        if (
          i === visibilityTimes.length - 1 || // Last element
          (next && next.time - current.time > interval * 1000) // Gap detected
        ) {
          visibilitySessions.push({
            start: sessionStart,
            end: current.time,
            startOrbit: sessionStartOrbit,
            endOrbit: current.orbitNumber,
            maxElevation: maxElevation,
            correspondingAzimuth: correspondingAzimuth,
            startAtMinElevation,
            endAtMinElevation,
          });

          sessionStart = null;
          sessionStartOrbit = null;
          maxElevation = null;
          correspondingAzimuth = null;
          startAtMinElevation = null;
          endAtMinElevation = null;
        }
      }

      return visibilitySessions;
    };

    const start = new Date(startDateTime);
    const end = new Date(endDateTime);

    const visibilityTimes = getVisibilityTimes(start, end, interval, observerGd);
    const visibilitySessions = groupVisibilitySessions(visibilityTimes);
    // console.log("Visible at:", visibilitySessions);
    return visibilitySessions;
  } catch (error) {
    console.error("Error predicting sessions:", error.message);
    return { error: error.message };
  }
};

module.exports = predictSessions;
