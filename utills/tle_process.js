const axios = require('axios');

/**
 * Fetch the latest TLE data for a satellite from CelesTrak.
 * @param {string|number} satId - NORAD catalog number
 * @returns {Promise<string>} Raw TLE text (3 lines)
 */
exports.tleUpdate = async (satId) => {
  try {
    const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${satId}`;
    const response = await axios.get(url, { timeout: 15000 });
    const tleData = response.data;

    if (!tleData || typeof tleData !== 'string' || tleData.trim().length === 0) {
      throw new Error(`Empty TLE response for satellite ${satId}`);
    }

    // CelesTrak sometimes returns "No GP data found" for invalid IDs
    if (tleData.includes('No GP data found') || tleData.includes('No TLE data')) {
      throw new Error(`No TLE data found for satellite ${satId}`);
    }

    return tleData;
  } catch (err) {
    console.error("Cannot fetch TLE:", err.message);
    throw err;
  }
};

/**
 * Parse a 3-line TLE string into structured arrays.
 * Handles both \r\n and \n line endings.
 * @param {string} tle - Raw TLE text (line0 = name, line1, line2)
 * @returns {{ tle: string, tle2DArray: string[], tle3DArray: string[][], tleLine1: string, tleLine2: string, satName: string }}
 */
exports.tleSplit = (tle) => {
  try {
    if (!tle || typeof tle !== 'string') {
      throw new Error('TLE must be a non-empty string');
    }

    // Normalize line endings and split
    const tle2DArray = tle.trim().replace(/\r\n/g, '\n').split('\n').map(line => line.trim()).filter(line => line.length > 0);

    if (tle2DArray.length < 2) {
      throw new Error('TLE must have at least 2 lines (line1 + line2)');
    }

    // Determine if TLE has a name line (3-line format) or not (2-line format)
    let satName, tleLine1, tleLine2;
    if (tle2DArray.length >= 3 && tle2DArray[0].charAt(0) !== '1') {
      // 3-line TLE: name + line1 + line2
      satName = tle2DArray[0];
      tleLine1 = tle2DArray[1];
      tleLine2 = tle2DArray[2];
    } else {
      // 2-line TLE: line1 + line2
      satName = '';
      tleLine1 = tle2DArray[0];
      tleLine2 = tle2DArray[1];
    }

    // Split each line into elements by whitespace
    const splitLine = (line) => line.trim().split(/\s+/);
    const tle3DArray = tle2DArray.map(splitLine);

    return {
      tle,
      tle2DArray,
      tle3DArray,
      satName,
      tleLine1,
      tleLine2,
    };
  } catch (err) {
    console.error("Cannot parse TLE:", err.message);
    throw err;
  }
};
