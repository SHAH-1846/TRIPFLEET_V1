/**
 * Authentication Routes
 * Handles all authentication-related endpoints
 */

const express = require('express');
const passport = require('passport');
const router = express.Router();

// Controllers
const authController = require('../controllers/authController');

// Middleware
const { 
  authRateLimiter, 
  validateRequest, 
  sanitizeInput 
} = require('../utils/middleware');

// Validation schemas
const { authSchemas } = require('../validations/schemas');

/**
 * @route POST /auth/login
 * @desc User login with email and password
 * @access Public
 */
router.post('/login', 
  authRateLimiter,
  sanitizeInput,
  validateRequest(authSchemas.login),
  authController.login
);

/**
 * @route POST /auth/request-otp
 * @desc Request OTP for phone verification
 * @access Public
 */
router.post('/request-otp',
  authRateLimiter,
  sanitizeInput,
  validateRequest(authSchemas.requestOtp),
  authController.requestOtp
);

/**
 * @route POST /auth/verify-otp
 * @desc Verify OTP and complete phone verification
 * @access Public
 */
router.post('/verify-otp',
  authRateLimiter,
  sanitizeInput,
  validateRequest(authSchemas.verifyOtp),
  authController.verifyOtp
);

/**
 * @route POST /auth/refresh-token
 * @desc Refresh access token using refresh token
 * @access Public
 */
router.post('/refresh-token',
  sanitizeInput,
  validateRequest(authSchemas.refreshToken),
  authController.refreshToken
);

/**
 * @route POST /auth/logout
 * @desc Logout user (invalidate token)
 * @access Private
 */
router.post('/logout',
  authController.logout
);

/**
 * @route GET /auth/google
 * @desc Initiate Google OAuth
 * @access Public
 */
router.get('/google', 
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

/**
 * @route GET /auth/google/callback
 * @desc Google OAuth callback
 * @access Public
 */
router.get('/google/callback', 
  passport.authenticate('google', { 
    failureRedirect: '/auth/error' 
  }), 
  authController.googleOAuth
);

/**
 * @route GET /auth/error
 * @desc OAuth error page
 * @access Public
 */
router.get('/error', (req, res) => {
  res.status(400).json({
    success: false,
    statusCode: 400,
    message: 'OAuth authentication failed',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;