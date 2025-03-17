const axios = require('axios');



exports.tleUpdate = async (satId) => {
    try {
      const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${satId}`;
      const response = await axios.get(url);
      const tleData = response.data;
  
      // Handle or return the TLE data as needed
      return tleData;
      
    } catch (err) {
      console.log("cannot handle get TLE:", err);
      throw err; // Re-throw error if needed for further handling
    }
  };

exports.tleSplit = (tle) => {
    try { 
      // Helper function to split line into elements by spaces
      const splitLine = (line) => line.trim().split(/\s+/);
      
      console.log(tle)
      const tle2DArray = tle.trim().split('\n');
      // Convert each line into a 2D array where each sub-array contains elements split by spaces
      const tle3DArray = tle2DArray.map(splitLine);
      
  
      return{tle,tle2DArray,tle3DArray}
  
    } catch (err) {
      console.log("cannot handle split tle:",err);
    }
  };
  

