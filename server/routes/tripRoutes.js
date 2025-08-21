/**
 * Trip Management Routes
 * Handles all trip-related endpoints with proper authentication and authorization
 */

const express = require('express');
const router = express.Router();

// Controllers
const tripController = require('../controllers/tripController');

// Middleware
const { 
  authenticateToken, 
  requireRole, 
  validateRequest, 
  sanitizeInput,
  validateObjectId,
  pagination
} = require('../utils/middleware');

// Validation schemas
const { tripSchemas } = require('../validations/schemas');

/**
 * @route POST /api/v1/trips
 * @desc Create a new trip
 * @access Private (customer users)
 */
router.post('/',
  authenticateToken,
  requireRole(['driver']),
  sanitizeInput,
  validateRequest(tripSchemas.createTrip),
  tripController.createTrip
);

/**
 * @route GET /api/v1/trips
 * @desc Get all trips with pagination and filtering
 * @access Private (authenticated users)
 */
router.get('/',
  authenticateToken,
  pagination,
  tripController.getAllTrips
);

/**
 * @route GET /api/v1/trips/my
 * @desc Get current user's trips (optionally include trips where user is driver)
 * @access Private (authenticated users)
 */
router.get('/my',
  authenticateToken,
  pagination,
  tripController.getMyTrips
);

/**
 * @route GET /api/v1/trips/stats
 * @desc Get trip statistics
 * @access Private (authenticated users)
 */
router.get('/stats',
  authenticateToken,
  tripController.getTripStats
);

/**
 * @route GET /api/v1/trips/:tripId
 * @desc Get specific trip by ID
 * @access Private (authenticated users - trip owner or assigned driver)
 */
router.get('/:tripId',
  authenticateToken,
  validateObjectId('tripId'),
  tripController.getTripById
);

/**
 * @route PUT /api/v1/trips/:tripId
 * @desc Update trip information
 * @access Private (trip owner or admin)
 */
router.put('/:tripId',
  authenticateToken,
  validateObjectId('tripId'),
  sanitizeInput,
  validateRequest(tripSchemas.updateTrip),
  tripController.updateTrip
);

/**
 * @route PUT /api/v1/trips/:tripId/cancel
 * @desc Cancel trip
 * @access Private (trip owner or admin)
 */
router.put('/:tripId/cancel',
  authenticateToken,
  validateObjectId('tripId'),
  tripController.cancelTrip
);

/**
 * @route PUT /api/v1/trips/:tripId/complete
 * @desc Complete trip (driver only)
 * @access Private (assigned driver)
 */
router.put('/:tripId/complete',
  authenticateToken,
  requireRole(['driver']),
  validateObjectId('tripId'),
  tripController.completeTrip
);

/**
 * @route PUT /api/v1/trips/:tripId/status
 * @desc Update trip status
 * @access Private (trip owner, assigned driver, or admin)
 */
router.put('/:tripId/status',
  authenticateToken,
  validateObjectId('tripId'),
  sanitizeInput,
  validateRequest(tripSchemas.updateStatus),
  tripController.updateTripStatus
);

/**
 * @route DELETE /api/v1/trips/:tripId
 * @desc Delete trip (soft delete)
 * @access Private (trip owner or admin)
 */
router.delete('/:tripId',
  authenticateToken,
  validateObjectId('tripId'),
  tripController.deleteTrip
);

module.exports = router;