/**
 * Customer Request Management Routes
 * Handles all customer request-related endpoints with proper authentication and authorization
 */

const express = require('express');
const router = express.Router();

// Controllers
const customerRequestController = require('../controllers/customerRequestController');

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
const { customerRequestSchemas } = require('../validations/schemas');

/**
 * @route POST /api/v1/customer-requests
 * @desc Create a new customer request
 * @access Private (customer users)
 */
router.post('/',
  authenticateToken,
  requireRole(['customer']),
  sanitizeInput,
  validateRequest(customerRequestSchemas.createRequest),
  customerRequestController.createRequest
);

/**
 * @route GET /api/v1/customer-requests
 * @desc Get all customer requests with pagination and filtering
 * @access Private (authenticated users)
 */
router.get('/',
  authenticateToken,
  pagination,
  customerRequestController.getAllRequests
);

/**
 * @route GET /api/v1/customer-requests/stats
 * @desc Get customer request statistics
 * @access Private (authenticated users)
 */
router.get('/stats',
  authenticateToken,
  customerRequestController.getRequestStats
);

/**
 * @route GET /api/v1/customer-requests/:requestId
 * @desc Get specific customer request by ID
 * @access Private (authenticated users - request owner, assigned driver, or admin)
 */
router.get('/:requestId',
  authenticateToken,
  validateObjectId('requestId'),
  customerRequestController.getRequestById
);

/**
 * @route PUT /api/v1/customer-requests/:requestId
 * @desc Update customer request information
 * @access Private (request owner or admin)
 */
router.put('/:requestId',
  authenticateToken,
  validateObjectId('requestId'),
  sanitizeInput,
  validateRequest(customerRequestSchemas.updateRequest),
  customerRequestController.updateRequest
);

/**
 * @route PUT /api/v1/customer-requests/:requestId/assign
 * @desc Assign request to driver (admin only)
 * @access Private (admin users)
 */
router.put('/:requestId/assign',
  authenticateToken,
  requireRole(['admin']),
  validateObjectId('requestId'),
  sanitizeInput,
  validateRequest(customerRequestSchemas.assignRequest),
  customerRequestController.assignRequest
);

/**
 * @route PUT /api/v1/customer-requests/:requestId/status
 * @desc Update request status
 * @access Private (request owner, assigned driver, or admin)
 */
router.put('/:requestId/status',
  authenticateToken,
  validateObjectId('requestId'),
  sanitizeInput,
  validateRequest(customerRequestSchemas.updateStatus),
  customerRequestController.updateRequestStatus
);

/**
 * @route DELETE /api/v1/customer-requests/:requestId
 * @desc Delete customer request (soft delete)
 * @access Private (request owner or admin)
 */
router.delete('/:requestId',
  authenticateToken,
  validateObjectId('requestId'),
  customerRequestController.deleteRequest
);

module.exports = router;