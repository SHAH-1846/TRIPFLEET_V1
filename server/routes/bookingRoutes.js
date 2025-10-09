/**
 * Booking Management Routes
 * Handles all booking-related endpoints with proper authentication and authorization
 */

const express = require('express');
const router = express.Router();

// Controllers
const bookingController = require('../controllers/bookingController');

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
const { bookingSchemas } = require('../validations/schemas');

/**
 * @route POST /api/v1/bookings
 * @desc Create a new booking
 * @access Private (driver users)
 */
router.post('/',
  authenticateToken,
  // Both drivers and customers can initiate a booking
  requireRole(['driver', 'customer']),
  sanitizeInput,
  validateRequest(bookingSchemas.createBooking),
  bookingController.createBooking
);

/**
 * @route GET /api/v1/bookings
 * @desc Get all bookings with pagination and filtering
 * @access Private (authenticated users)
 */
router.get('/',
  authenticateToken,
  pagination,
  bookingController.getAllBookings
);

/**
 * @route GET /api/v1/bookings/stats
 * @desc Get booking statistics
 * @access Private (authenticated users)
 */
router.get('/stats',
  authenticateToken,
  bookingController.getBookingStats
);

/**
 * @route GET /api/v1/bookings/:bookingId
 * @desc Get specific booking by ID
 * @access Private (authenticated users - booking owner or trip owner)
 */
router.get('/:bookingId',
  authenticateToken,
  validateObjectId('bookingId'),
  bookingController.getBookingById
);

/**
 * @route PUT /api/v1/bookings/:bookingId
 * @desc Update booking information
 * @access Private (booking owner or trip owner)
 */
router.put('/:bookingId',
  authenticateToken,
  validateObjectId('bookingId'),
  sanitizeInput,
  validateRequest(bookingSchemas.updateBooking),
  bookingController.updateBooking
);

/**
 * @route PUT /api/v1/bookings/:bookingId/accept
 * @desc Accept booking (customer only)
 * @access Private (trip owner)
 */
router.put('/:bookingId/accept',
  authenticateToken,
  // Recipient (driver or customer) can accept
  requireRole(['driver', 'customer']),
  validateObjectId('bookingId'),
  bookingController.acceptBooking
);

/**
 * @route PUT /api/v1/bookings/:bookingId/reject
 * @desc Reject booking (customer only)
 * @access Private (trip owner)
 */
router.put('/:bookingId/reject',
  authenticateToken,
  requireRole(['driver', 'customer']),
  validateObjectId('bookingId'),
  bookingController.rejectBooking
);

/**
 * @route PUT /api/v1/bookings/:bookingId/cancel
 * @desc Cancel booking
 * @access Private (booking owner or trip owner)
 */
router.put('/:bookingId/cancel',
  authenticateToken,
  validateObjectId('bookingId'),
  sanitizeInput,
  validateRequest(bookingSchemas.cancelBooking),
  bookingController.cancelBooking
);

/**
 * @route PUT /api/v1/bookings/:bookingId/complete
 * @desc Complete booking (driver only)
 * @access Private (assigned driver)
 */
router.put('/:bookingId/complete',
  authenticateToken,
  requireRole(['driver']),
  validateObjectId('bookingId'),
  bookingController.completeBooking
);

/**
 * @route DELETE /api/v1/bookings/:bookingId
 * @desc Delete booking (soft delete)
 * @access Private (booking owner or admin)
 */
router.delete('/:bookingId',
  authenticateToken,
  validateObjectId('bookingId'),
  bookingController.deleteBooking
);

// generate OTPs
router.post('/:bookingId/otp/pickup/generate', authenticateToken, sanitizeInput, bookingController.generatePickupOtp);
router.post('/:bookingId/otp/delivery/generate', authenticateToken, sanitizeInput, bookingController.generateDeliveryOtp);

// verify OTPs and complete milestones
router.post('/:bookingId/pickup/verify-otp', authenticateToken, sanitizeInput, bookingController.verifyPickupOtpAndPickup);
router.post('/:bookingId/delivery/verify-otp', authenticateToken, sanitizeInput, bookingController.verifyDeliveryOtpAndDeliver);

module.exports = router;