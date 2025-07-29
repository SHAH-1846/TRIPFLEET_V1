/**
 * User Management Routes
 * Handles all user-related endpoints with proper authentication and authorization
 */

const express = require('express');
const router = express.Router();

// Controllers
const userController = require('../controllers/userController');

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
const { userSchemas } = require('../validations/schemas');

/**
 * @route POST /api/v1/users/register-driver
 * @desc Register a new driver with complete profile and vehicle information
 * @access Public (requires phone verification token)
 */
router.post('/register-driver',
  sanitizeInput,
  validateRequest(userSchemas.registerDriver),
  userController.registerDriver
);

/**
 * @route POST /api/v1/users/register-customer
 * @desc Register a new customer with basic profile information
 * @access Public (requires phone verification token)
 */
router.post('/register-customer',
  sanitizeInput,
  validateRequest(userSchemas.registerCustomer),
  userController.registerCustomer
);

/**
 * @route GET /api/v1/users/profile
 * @desc Get current user's profile with complete information
 * @access Private (authenticated users)
 */
router.get('/profile',
  authenticateToken,
  userController.getProfile
);

/**
 * @route PUT /api/v1/users/profile
 * @desc Update current user's profile information
 * @access Private (authenticated users)
 */
router.put('/profile',
  authenticateToken,
  sanitizeInput,
  validateRequest(userSchemas.updateProfile),
  userController.updateProfile
);

/**
 * @route DELETE /api/v1/users/profile
 * @desc Delete current user's account (soft delete)
 * @access Private (authenticated users)
 */
router.delete('/profile',
  authenticateToken,
  userController.deleteAccount
);

/**
 * @route GET /api/v1/users
 * @desc Get all users with pagination and filtering (admin only)
 * @access Private (admin users)
 */
router.get('/',
  authenticateToken,
  requireRole(['admin']),
  pagination,
  userController.getAllUsers
);

/**
 * @route PUT /api/v1/users/:userId/user-type
 * @desc Update user type (admin only)
 * @access Private (admin users)
 */
router.put('/:userId/user-type',
  authenticateToken,
  requireRole(['admin']),
  validateObjectId('userId'),
  sanitizeInput,
  validateRequest(userSchemas.updateUserType),
  userController.updateUserType
);

/**
 * @route GET /api/v1/users/:userId
 * @desc Get specific user by ID (admin only)
 * @access Private (admin users)
 */
router.get('/:userId',
  authenticateToken,
  requireRole(['admin']),
  validateObjectId('userId'),
  userController.getUserById
);

/**
 * @route PUT /api/v1/users/:userId/status
 * @desc Update user status (active/inactive) (admin only)
 * @access Private (admin users)
 */
router.put('/:userId/status',
  authenticateToken,
  requireRole(['admin']),
  validateObjectId('userId'),
  sanitizeInput,
  validateRequest(userSchemas.updateUserStatus),
  userController.updateUserStatus
);

/**
 * @route DELETE /api/v1/users/:userId
 * @desc Hard delete user (admin only)
 * @access Private (admin users)
 */
router.delete('/:userId',
  authenticateToken,
  requireRole(['admin']),
  validateObjectId('userId'),
  userController.deleteUser
);

module.exports = router;