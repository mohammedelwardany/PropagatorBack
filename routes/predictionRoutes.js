const express = require('express');
const router = express.Router();
const predictionController = require('../controllers/predictionController');

// Forward propagation — predict future sessions
router.post('/', predictionController.predictCommunicationSessions);

// Back-propagation — predict sessions using a past TLE from DB
router.post('/backpropagate', predictionController.backPropagate);

// Get TLE history for a satellite (for back-propagation selection)
router.get('/tle-history/:satid', predictionController.getTLEHistory);

module.exports = router;
