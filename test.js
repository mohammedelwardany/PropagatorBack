const satellite = require("satellite.js");
const ExcelJS = require("exceljs");

const predictSessions = ({
  tleLine1 = "",
  tleLine2 = "",
  latitude = 0,
  longitude = 0,
  altitude = 0,
  startDateTime = new Date().toISOString(),
  endDateTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  interval = 1,
  minElevation = 0,
}) => {
  const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
  const observerGd = {
    latitude: satellite.degreesToRadians(latitude),
    longitude: satellite.degreesToRadians(longitude),
    height: altitude / 1000,
  };
  const start = new Date(startDateTime);
  const end = new Date(endDateTime);
console.log("starst",satrec)
  const getSatellitePositionAndLookAngles = (time) => {
    const positionAndVelocity = satellite.propagate(satrec, time);
    if (!positionAndVelocity.position) return null;
    const gmst = satellite.gstime(time);
    const lookAngles = satellite.ecfToLookAngles(
      observerGd,
      satellite.eciToEcf(positionAndVelocity.position, gmst)
    );
    return {
      time: time.toISOString(),
      elevation: satellite.radiansToDegrees(lookAngles.elevation),
      azimuth: satellite.radiansToDegrees(lookAngles.azimuth),
    };
  };

  const visibilityPoints = [];
  for (let time = new Date(start); time <= end; time = new Date(time.getTime() + interval * 1000)) {
    const pos = getSatellitePositionAndLookAngles(time);
    if (pos) visibilityPoints.push(pos);
  }

  const sessions = [];
  let currentSession = null;
  for (const point of visibilityPoints) {
    if (point.elevation >= minElevation) {
        console.log(point)
      if (!currentSession) {
        currentSession = {
          startTime: point.time,
          endTime: point.time,
          maxElevation: point.elevation,
        };
      } else {
        currentSession.endTime = point.time;
        if (point.elevation > currentSession.maxElevation) {
          currentSession.maxElevation = point.elevation;
        }
      }
    } else if (currentSession) {
      sessions.push(currentSession);
      currentSession = null;
    }
  }
  if (currentSession) {
    sessions.push(currentSession);
  }

  return { sessions, satrec };
};

const extractOrbitInfoPerSession = (satrec, sessions) => {
  const year = satrec.epochyr < 57 ? 2000 + satrec.epochyr : 1900 + satrec.epochyr;
  const orbitPerDay = Math.round(1440 / satrec.no); // NSV
  const RAAN = satellite.radiansToDegrees(satrec.nodeo); // LE
  const inclination = satellite.radiansToDegrees(satrec.inclo); // I

  return sessions.map(session => {
    const start = new Date(session.startTime);
    const dateStr = start.toISOString().split("T")[0];
    const hours = start.getUTCHours();
    const minutes = start.getUTCMinutes();
    const seconds = start.getUTCSeconds();
    const millis = start.getUTCMilliseconds();

    const TE = `${String(hours).padStart(2, "0")}.${String(minutes).padStart(2, "0")}.${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
    const TE_S = hours * 3600 + minutes * 60 + seconds + millis / 1000;

    return {
      NKA: satrec.satnum,
      NV: satrec.revnum,
      NSV: orbitPerDay,
      DAT: dateStr,
      TE,
      TE_S,
      LE: RAAN,
      I: inclination,
    };
  });
};

const saveSessionsToExcel = async (rows, filePath = "orbit_sessions.xlsx") => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sessions");

  worksheet.columns = Object.keys(rows[0]).map(key => ({ header: key, key }));
  rows.forEach(row => worksheet.addRow(row));

  await workbook.xlsx.writeFile(filePath);
  console.log(`Excel saved: ${filePath}`);
};

// Sample TLE
const tleLine1 = "1 58921U 24024E   25141.17081330  .00005973  00000+0  22613-3 0  9993";
const tleLine2 = "2 58921  97.3460 215.4373 0010976  75.2027 285.0427 15.27244864 71949";

// Generate and Save
const { sessions, satrec } = predictSessions({
  tleLine1,
  tleLine2,
  latitude: 30.033333,  // Cairo
  longitude: 31.233334,
  altitude: 23,         // meters
  interval: 10,         // seconds
  minElevation: 10,     // degrees
});

const sessionData = extractOrbitInfoPerSession(satrec, sessions);
saveSessionsToExcel(sessionData);
