const express = require('express');
const router = express.Router();

// Controllers
const driverConnectionController = require('../controllers/driverConnectionController');

// Middleware
const { 
  authenticateToken, 
  requireRole, 
  validateRequest, 
  sanitizeInput 
} = require('../utils/middleware');

// Validation schemas
const { driverConnectionSchemas } = require('../validations/schemas');

/**
 * @route POST /api/v1/driver-connections/request
 * @desc Send friend request by mobile number
 * @access Private (driver users)
 */
router.post('/request',
  authenticateToken,
  requireRole(['driver']),
  sanitizeInput,
  validateRequest(driverConnectionSchemas.sendFriendRequest),
  driverConnectionController.sendFriendRequest
);

/**
 * @route GET /api/v1/driver-connections/requests
 * @desc Get friend requests (pending/received)
 * @access Private (driver users)
 */
router.get('/requests',
  authenticateToken,
  requireRole(['driver']),
  driverConnectionController.getFriendRequests
);

/**
 * @route PUT /api/v1/driver-connections/:connectionId/respond
 * @desc Respond to friend request (accept/reject)
 * @access Private (driver users)
 */
router.put('/:connectionId/respond',
  authenticateToken,
  requireRole(['driver']),
  sanitizeInput,
  validateRequest(driverConnectionSchemas.respondToRequest),
  driverConnectionController.respondToFriendRequest
);

/**
 * @route GET /api/v1/driver-connections/friends
 * @desc Get confirmed friends list
 * @access Private (driver users)
 */
router.get('/friends',
  authenticateToken,
  requireRole(['driver']),
  driverConnectionController.getFriendsList
);

/**
 * @route DELETE /api/v1/driver-connections/:connectionId
 * @desc Remove friend connection
 * @access Private (driver users)
 */
router.delete('/:connectionId',
  authenticateToken,
  requireRole(['driver']),
  driverConnectionController.removeFriend
);

module.exports = router;
