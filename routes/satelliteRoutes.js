const express = require('express');
const router = express.Router();
const satelliteController = require('../controllers/satelliteController');

router.post('/', satelliteController.createSatellite);
router.get('/', satelliteController.getAllSatellites);
router.get('/:id', satelliteController.getSatelliteById);
router.get('/tle/:id', satelliteController.updateSatelliteTLE);
router.delete('/:id', satelliteController.deleteSatellite);

module.exports = router;
