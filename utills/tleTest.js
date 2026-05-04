const satellite = require("satellite.js");
const ExcelJS = require("exceljs");
const fs = require("fs");

const extractTLEData = (tleLine1, tleLine2) => {
  const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
  const now = new Date();

  // Epoch date from TLE (YYDDD.DDDDDDDD)
  const year = satrec.epochyr < 57 ? 2000 + satrec.epochyr : 1900 + satrec.epochyr;
  const dayOfYear = satrec.epochdays;
  const epochDate = satellite.jday(year, 1, 0, 0, 0, 0);
  const epochTime = new Date((epochDate + dayOfYear) * 86400000 - 62167219200000); // convert Julian to JS Date

  const hours = epochTime.getUTCHours();
  const minutes = epochTime.getUTCMinutes();
  const seconds = epochTime.getUTCSeconds();
  const millis = epochTime.getUTCMilliseconds();

  const TE = `${String(hours).padStart(2, "0")}.${String(minutes).padStart(2, "0")}.${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  const TE_S = hours * 3600 + minutes * 60 + seconds + millis / 1000;

  return {
    "NKA": satrec.satnum,                                 // Satellite number
    "NV": satrec.revnum,                                  // Orbit number
    "NSV": Math.round(1440 / satrec.no),                  // Number of daily orbits
    "DAT": epochTime.toISOString().split("T")[0],         // Date of orbit beginning
    "TE": TE,                                              // Time of orbit beginning
    "TE_S": TE_S,                                          // Time in seconds
    "LE": satellite.radiansToDegrees(satrec.nodeo),       // Longitude of ascending node (RAAN)
    "I": satellite.radiansToDegrees(satrec.inclo),        // Inclination
  };
};

const saveToExcel = async (data, filePath = "orbit_data.xlsx") => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Orbit Info");

  worksheet.columns = Object.keys(data).map(key => ({ header: key, key }));

  worksheet.addRow(data);

  await workbook.xlsx.writeFile(filePath);
  console.log("Excel file created:", filePath);
};

// Example usage:
const tleLine1 = "1 25544U 98067A   24142.30555556  .00002182  00000+0  46292-4 0  9993";
const tleLine2 = "2 25544  51.6392  10.0193 0003747  90.7441  34.0474 15.50677049451897";

const data = extractTLEData(tleLine1, tleLine2);
saveToExcel(data);
