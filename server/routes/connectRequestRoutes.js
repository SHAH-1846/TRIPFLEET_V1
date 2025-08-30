/**
 * Connect Request Management Routes
 * Handles all connect request-related endpoints with proper authentication and authorization
 */

const express = require('express');
const router = express.Router();

// Controllers
const connectRequestController = require('../controllers/connectRequestController');

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
const { connectRequestSchemas } = require('../validations/schemas');

/**
 * @route POST /api/v1/connect-requests
 * @desc Send a connect request to another user
 * @access Private (authenticated users)
 */
router.post('/',
  authenticateToken,
  sanitizeInput,
  validateRequest(connectRequestSchemas.sendRequest),
  connectRequestController.sendRequest
);

/**
 * @route GET /api/v1/connect-requests
 * @desc Get connect requests for the current user
 * @access Private (authenticated users)
 */
router.get('/',
  authenticateToken,
  pagination,
  connectRequestController.getConnectRequests
);

/**
 * @route GET /api/v1/connect-requests/:requestId
 * @desc Get specific connect request by ID
 * @access Private (authenticated users involved in the request)
 */
router.get('/:requestId',
  authenticateToken,
  validateObjectId('requestId'),
  connectRequestController.getConnectRequestById
);

/**
 * @route PUT /api/v1/connect-requests/:requestId/respond
 * @desc Respond to a connect request (accept/reject)
 * @access Private (recipient only)
 */
router.put('/:requestId/respond',
  authenticateToken,
  validateObjectId('requestId'),
  sanitizeInput,
  validateRequest(connectRequestSchemas.respondToRequest),
  connectRequestController.respondToRequest
);

/**
 * @route PUT /api/v1/connect-requests/:requestId/accept
 * @desc Accept a connect request (for mutual acceptance)
 * @access Private (initiator only)
 */
router.put('/:requestId/accept',
  authenticateToken,
  validateObjectId('requestId'),
  connectRequestController.acceptRequest
);

/**
 * @route DELETE /api/v1/connect-requests/:requestId
 * @desc Delete a connect request (soft delete)
 * @access Private (initiator only)
 */
router.delete('/:requestId',
  authenticateToken,
  validateObjectId('requestId'),
  connectRequestController.deleteConnectRequest
);

// Get connect request verification details for cross-checking
router.get(
  "/:requestId/verification",
  authenticateToken,
  sanitizeInput,
  validateObjectId,
  connectRequestController.getConnectRequestVerification
);

module.exports = router;
