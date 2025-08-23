const express = require("express");
const router = express.Router();
const locationController = require("../controllers/locationController");

/**
 * Location Routes
 * 
 * This module defines all routes for the locations API
 * Provides comprehensive search and filtering capabilities for Indian postal locations
 */

// Get all locations with search and filtering
router.get("/", locationController.getAllLocations);

// Get location statistics and metadata
router.get("/stats", locationController.getLocationStats);

// Get a single location by ID
router.get("/:id", locationController.getLocationById);

// Get locations by state name
router.get("/state/:stateName", locationController.getLocationsByState);

module.exports = router;
