const predictSessions = require("../utills/propagator_process");
const { tleSplit } = require("../utills/tle_process");
const Satellite = require("../models/satellite");
const Station = require("../models/station");
const Sessions = require("../models/sessions");

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
  } = req.body;

  try {
    console.log(req.body);

    let satelliteData = null;
    let stationData = null;

    if (SatelliteId) {
      satelliteData = await Satellite.findOne({ satid: SatelliteId });
      if (!satelliteData)
        return res.status(404).json({ error: "Satellite not found" });
    }

    if (StationId) {
      stationData = await Station.findById(StationId);
      if (!stationData)
        return res.status(404).json({ error: "Station not found" });
    }

    if (TLE && lat && long && altitude) {
      // Manual prediction
      const splittedTle = tleSplit(TLE);
      const sessions = predictSessions({
        tleLine1: splittedTle.tle2DArray[1],
        tleLine2: splittedTle.tle2DArray[2],
        groundAccess: { lat, long, altitude },
        startDateTime: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
        endDateTime: endDate ? new Date(endDate).toISOString() : new Date(new Date(startDate?startDate:new Date()).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        interval: 0.1,
      });

      if (sessions.error) {
        console.log(sessions.error)
        return res.status(400).json({ error: sessions.error });
      }

      const formattedSessions = sessions.map((session) => ({
        startAtZero: new Date(session.start).toISOString(),
        startAtMin: new Date(session.startAtMinElevation).toISOString(),
        endAtZero: new Date(session.end).toISOString(),
        endAtMin: new Date(session.endAtMinElevation).toISOString(),
        maxElevation: session.maxElevation,
      }));

      return res.json({ sessions: formattedSessions });

    } else if (SatelliteId && StationId) {
      // Existing prediction logic
      const existingSession = await Sessions.findOne({
        satId: SatelliteId,
        stationID: StationId,
      });

      if (existingSession) {
        const lastUpdateEpoch = satelliteData?.TLEs[0]?.lastUpdateEpoch;
        const tleData = tleSplit(TLE || satelliteData?.TLEs[0]?.tle);
        
        // Log the start and end dates for debugging
        console.log('Start Date (ISO):', new Date(startDate).toISOString());
        console.log('End Date (ISO):', new Date(endDate).toISOString());
        console.log('Start Date > End Date:', new Date(startDate).toISOString() > new Date(endDate).toISOString());
        
        // Check if the last session's end time is greater than the provided end date
        const lastSessionEnd = new Date(
          existingSession.Sessions[existingSession.Sessions.length - 1]?.endAtZero
        ).toISOString();
        
        if (lastSessionEnd > new Date(endDate).toISOString()) {
          const newSessions = predictSessions({
            tleLine1: tleData.tle2DArray[1],
            tleLine2: tleData.tle2DArray[2],
            groundAccess: {
              lat: lat || stationData?.lat,
              long: long || stationData?.long,
              altitude: altitude || stationData?.alt,
            },
            startDateTime: startDate
              ? new Date(startDate).toISOString()
              : new Date().toISOString(),
            endDateTime: endDate
              ? new Date(endDate).toISOString()
              : new Date(new Date(startDate).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            interval: 0.1,
          });
        
          // Remove outdated sessions
          existingSession.Sessions = existingSession.Sessions.filter(
            (session) =>
              new Date(session.startAtZero).getTime() <=
              new Date(startDate || new Date()).getTime()
          );
        
          // Format new sessions for saving
          const formattedNewSessions = newSessions.map((session) => ({
            startAtZero: new Date(session.start).toISOString(),
            startAtMin: new Date(session.startAtMinElevation).toISOString(),
            endAtZero: new Date(session.end).toISOString(),
            endAtMin: new Date(session.endAtMinElevation).toISOString(),
            maxElevation: session.maxElevation,
          }));
        
          // Add new sessions to existing sessions
          existingSession.Sessions.push(...formattedNewSessions);
        
          // Save only if the last session's end time is still valid
          // const updatedLastSessionEnd = new Date(
          //   existingSession.Sessions[existingSession.Sessions.length - 1]?.endAtZero
          // ).toISOString();
        
          if (lastSessionEnd > new Date(endDate).toISOString()) {
            await existingSession.save();
          }
        }
        
        // Return the updated sessions
        return res.json({ sessions: existingSession.Sessions });
        
      } else {
        // If no existing session, fall back to new session prediction
        const splittedTle = tleSplit(TLE || satelliteData?.TLEs[0]?.tle);
        const sessions = predictSessions({
          tleLine1: splittedTle.tle2DArray[1],
          tleLine2: splittedTle.tle2DArray[2],
          groundAccess: {
            lat: lat || stationData?.lat,
            long: long || stationData?.long,
            altitude: altitude || stationData?.alt,
          },
          startDateTime: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
          endDateTime: endDate ? new Date(endDate).toISOString() : new Date(new Date(startDate?startDate:new Date()).getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          interval: 0.1,
        });

        if (sessions.error) {
          console.log(sessions.error)
          return res.status(400).json({ error: sessions.error });
        }

        const formattedSessions = sessions.map((session) => ({
          startAtZero: new Date(session.start).toISOString(),
          startAtMin: new Date(session.startAtMinElevation).toISOString(),
          endAtZero: new Date(session.end).toISOString(),
          endAtMin: new Date(session.endAtMinElevation).toISOString(),
          maxElevation: session.maxElevation,
        }));

        const newSession = new Sessions({
          satId: SatelliteId,
          stationID:StationId,
          Sessions: formattedSessions,
        });
        await newSession.save();
        return res.json({ sessions: newSession.Sessions });
      }
    } else {
      console.log("Invalid request")
      return res.status(400).json({ error: "Invalid request. Please provide the necessary data." });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
