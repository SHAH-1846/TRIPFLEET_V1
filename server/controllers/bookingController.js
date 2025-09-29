/**
 * Booking Management Controller
 * Handles booking creation, management, and operations
 */

const { Types } = require("mongoose");

// Models
const bookings = require("../db/models/bookings");
const trips = require("../db/models/trips");
const vehicles = require("../db/models/vehicles");
const users = require("../db/models/users");
const customer_requests = require("../db/models/customer_requests");
const connect_requests = require("../db/models/connect_requests");
const customer_request_status = require("../db/models/customer_request_status");

// Utils
const { 
  success, 
  created, 
  updated, 
  deleted, 
  badRequest, 
  unauthorized, 
  forbidden, 
  notFound, 
  conflict, 
  serverError 
} = require("../utils/response-handler");

// Validation schemas
const { bookingSchemas } = require("../validations/schemas");

/**
 * Create a new booking
 * @route POST /api/v1/bookings
 */
exports.createBooking = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Validate request data
    const { error, value } = bookingSchemas.createBooking.validate(req.body, { 
      abortEarly: false, 
      stripUnknown: true 
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      const response = badRequest("Validation failed", errors);
      return res.status(response.statusCode).json(response);
    }

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Allow both roles to initiate a booking using identifiers
    const userType = await require("../db/models/user_types").findById(user.user_type);
    const isDriver = userType.name?.toLowerCase() === 'driver';
    const isCustomer = userType.name?.toLowerCase() === 'customer';

    const trip = await trips.findById(value.tripId);
    if (!trip || !trip.isActive) {
      const response = notFound("Trip not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    const customerRequest = await customer_requests.findById(value.customerRequestId);
    if (!customerRequest || !customerRequest.isActive) {
      const response = notFound("Customer request not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Validate role pairing by ownership of trip/customerRequest
    let driverId, customerId;
    if (isDriver) {
      if (!trip.tripAddedBy || trip.tripAddedBy.toString() !== userId) {
        const response = forbidden("Trip does not belong to the driver (initiator)");
        return res.status(response.statusCode).json(response);
      }
      driverId = userId;
      customerId = customerRequest.user;
    } else if (isCustomer) {
      if (!customerRequest.user || customerRequest.user.toString() !== userId) {
        const response = forbidden("Customer request does not belong to the customer (initiator)");
        return res.status(response.statusCode).json(response);
      }
      customerId = userId;
      driverId = trip.tripAddedBy;
    } else {
      const response = forbidden("Only drivers or customers can initiate bookings");
      return res.status(response.statusCode).json(response);
    }

    // Prevent duplicate active bookings between same trip and customerRequest
    const existingBooking = await bookings.findOne({
      trip: value.tripId,
      customerRequest: value.customerRequestId,
      status: { $in: ['pending', 'confirmed'] }
    });
    if (existingBooking) {
      const response = conflict("A booking already exists for this trip and customer request");
      return res.status(response.statusCode).json(response);
    }

    // If provided, associate connectRequest
    let connectRequestId = null;
    if (value.connectRequestId) {
      const conn = await connect_requests.findById(value.connectRequestId);
      if (!conn || !conn.isActive) {
        const response = badRequest("Invalid connect request");
        return res.status(response.statusCode).json(response);
      }
      connectRequestId = conn._id;
    }

    // Optional pickupDate validation
    let pickupDate = value.pickupDate ? new Date(value.pickupDate) : null;
    if (pickupDate && pickupDate <= new Date()) {
      const response = badRequest("Pickup date must be in the future");
      return res.status(response.statusCode).json(response);
    }

    const bookingData = {
      trip: value.tripId,
      customerRequest: value.customerRequestId,
      driver: driverId,
      customer: customerId,
      initiator: userId,
      recipient: isDriver ? customerId : driverId,
      connectRequest: connectRequestId,
      price: value.price,
      pickupDate: pickupDate || undefined,
      notes: value.notes,
      status: 'pending',
      isActive: true,
    };

    const newBooking = await bookings.create(bookingData);

    // Populate booking data for response
    const populatedBooking = await bookings.findById(newBooking._id)
      .populate('trip')
      .populate('driver', 'name email phone')
      .populate('customer', 'name email phone');

    const response = created({ booking: populatedBooking }, "Booking initiated successfully");

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Create booking error:", error);
    const response = serverError("Failed to create booking");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get all bookings with pagination and filtering
 * @route GET /api/v1/bookings
 */
exports.getAllBookings = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 10, status, tripId, dateFrom, dateTo } = req.query;
    const skip = (page - 1) * limit;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Build filter object
    const filter = { isActive: true };
    
    // Filter by user role
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'customer') {
      // Customers see bookings for their trips
      const userTrips = await trips.find({ customer: userId }).select('_id');
      const tripIds = userTrips.map(trip => trip._id);
      filter.trip = { $in: tripIds };
    } else if (userType.name === 'driver') {
      // Drivers see their own bookings
      filter.driver = userId;
    }
    // Admin can see all bookings
    
    if (status) {
      filter.status = status;
    }
    
    if (tripId) {
      filter.trip = tripId;
    }
    
    if (dateFrom || dateTo) {
      filter.pickupDate = {};
      if (dateFrom) {
        filter.pickupDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.pickupDate.$lte = new Date(dateTo);
      }
    }

    // Get bookings with pagination
    const bookingsData = await bookings.find(filter)
      .populate('trip', 'pickupLocation dropLocation goodsType weight budget status')
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await bookings.countDocuments(filter);

    const response = success(
      bookingsData,
      "Bookings retrieved successfully",
      200,
      {
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get all bookings error:", error);
    const response = serverError("Failed to retrieve bookings");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get specific booking by ID
 * @route GET /api/v1/bookings/:bookingId
 */
exports.getBookingById = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get booking with populated data
    const booking = await bookings.findById(bookingId)
      .populate('trip', 'pickupLocation dropLocation goodsType weight budget status customer')
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType truckImages');

    if (!booking) {
      const response = notFound("Booking not found");
      return res.status(response.statusCode).json(response);
    }

    // Check access permissions
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'customer' && booking.trip.customer.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }
    
    if (userType.name === 'driver' && booking.driver._id.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    const response = success(
      { booking },
      "Booking retrieved successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get booking by ID error:", error);
    const response = serverError("Failed to retrieve booking");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Update booking information
 * @route PUT /api/v1/bookings/:bookingId
 */
exports.updateBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.user_id;

    // Validate request data
    const { error, value } = bookingSchemas.updateBooking.validate(req.body, { 
      abortEarly: false, 
      stripUnknown: true 
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      const response = badRequest("Validation failed", errors);
      return res.status(response.statusCode).json(response);
    }

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get booking
    const booking = await bookings.findById(bookingId);
    if (!booking) {
      const response = notFound("Booking not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can update this booking
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'driver' && booking.driver.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if booking can be updated
    if (['completed', 'cancelled'].includes(booking.status)) {
      const response = badRequest("Cannot update completed or cancelled booking");
      return res.status(response.statusCode).json(response);
    }

    // Validate pickup date if being updated
    if (value.pickupDate) {
      const pickupDate = new Date(value.pickupDate);
      const now = new Date();
      if (pickupDate <= now) {
        const response = badRequest("Pickup date must be in the future");
        return res.status(response.statusCode).json(response);
      }
    }

    // Update booking
    const updatedBooking = await bookings.findByIdAndUpdate(
      bookingId,
      { 
        ...value,
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('trip', 'pickupLocation dropLocation goodsType weight budget status')
    .populate('driver', 'name email phone')
    .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType');

    const response = updated(
      { booking: updatedBooking },
      "Booking updated successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Update booking error:", error);
    const response = serverError("Failed to update booking");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Accept booking (customer only)
 * @route PUT /api/v1/bookings/:bookingId/accept
 */
exports.acceptBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get booking
    const booking = await bookings.findById(bookingId)
      .populate('trip', 'customer status');
    
    if (!booking) {
      const response = notFound("Booking not found");
      return res.status(response.statusCode).json(response);
    }

    // Only the recipient can accept
    if (booking.recipient.toString() !== userId) {
      const response = forbidden("Only the recipient can accept this booking");
      return res.status(response.statusCode).json(response);
    }

    // Check if booking can be accepted
    if (booking.status !== 'pending') {
      const response = badRequest("Booking is not in pending status");
      return res.status(response.statusCode).json(response);
    }

    // Check if trip is still available
    // If the trip has a confirmed booking, block
    const confirmedExists = await bookings.findOne({ trip: booking.trip._id, status: 'confirmed' });
    if (confirmedExists) {
      const response = badRequest("Trip already has a confirmed booking");
      return res.status(response.statusCode).json(response);
    }

    // Accept booking and set confirmed
    const updatedBooking = await bookings.findByIdAndUpdate(
      bookingId,
      { 
        status: 'confirmed',
        recipientAccepted: true,
        acceptedAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('trip')
    .populate('driver', 'name email phone')
    .populate('customer', 'name email phone');

    // Business rules on acceptance:
    // 1) Update customerRequest status -> booked (684da132412825ef8b404715)
    const BOOKED_STATUS_ID = '684da132412825ef8b404715';
    await customer_requests.findByIdAndUpdate(booking.customerRequest, {
      status: BOOKED_STATUS_ID,
      updatedAt: new Date(),
    });

    // 2) Block trip edits by marking trip status to a suitable locked state (e.g., confirmed status id if using ref)
    // Here we only prevent via logic in trip update; but we also set updatedAt
    await trips.findByIdAndUpdate(booking.trip._id, { updatedAt: new Date() });

    // 3) Reject other pending bookings for this trip OR same customerRequest
    await bookings.updateMany(
      { 
        $or: [ { trip: booking.trip._id }, { customerRequest: booking.customerRequest } ],
        _id: { $ne: bookingId },
        status: 'pending'
      },
      {
        status: 'rejected',
        rejectedAt: new Date(),
        updatedAt: new Date()
      }
    );

    // 4) Auto-cancel pending connectRequests of this customerRequest (both directions) not yet accepted
    await connect_requests.updateMany(
      {
        customerRequest: booking.customerRequest,
        status: { $in: ['pending', 'hold'] },
        isActive: true,
      },
      {
        status: 'rejected',
        rejectedAt: new Date(),
        updatedAt: new Date(),
      }
    );

    const response = updated(
      { booking: updatedBooking },
      "Booking accepted successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Accept booking error:", error);
    const response = serverError("Failed to accept booking");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Reject booking (customer only)
 * @route PUT /api/v1/bookings/:bookingId/reject
 */
exports.rejectBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get booking
    const booking = await bookings.findById(bookingId)
      .populate('trip', 'customer status');
    
    if (!booking) {
      const response = notFound("Booking not found");
      return res.status(response.statusCode).json(response);
    }

    // Only recipient can reject
    if (booking.recipient.toString() !== userId) {
      const response = forbidden("Only the recipient can reject this booking");
      return res.status(response.statusCode).json(response);
    }

    // Check if booking can be rejected
    if (booking.status !== 'pending') {
      const response = badRequest("Booking is not in pending status");
      return res.status(response.statusCode).json(response);
    }

    // Reject booking
    const updatedBooking = await bookings.findByIdAndUpdate(
      bookingId,
      { 
        status: 'rejected',
        rejectedAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('trip')
    .populate('driver', 'name email phone')
    .populate('customer', 'name email phone');

    const response = updated(
      { booking: updatedBooking },
      "Booking rejected successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Reject booking error:", error);
    const response = serverError("Failed to reject booking");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Cancel booking
 * @route PUT /api/v1/bookings/:bookingId/cancel
 */
exports.cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get booking
    const booking = await bookings.findById(bookingId)
      .populate('trip', 'customer status');
    
    if (!booking) {
      const response = notFound("Booking not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can cancel this booking
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'driver' && booking.driver.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }
    
    if (userType.name === 'customer' && booking.customer.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if booking can be cancelled
    if (['completed', 'cancelled'].includes(booking.status)) {
      const response = badRequest("Booking is already completed or cancelled");
      return res.status(response.statusCode).json(response);
    }

    // Cancel booking
    const updatedBooking = await bookings.findByIdAndUpdate(
      bookingId,
      { 
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: userId,
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('trip')
    .populate('driver', 'name email phone')
    .populate('customer', 'name email phone');

    // If booking was confirmed, reset trip status
    // No direct trip mutation; flow controlled by status APIs

    const response = updated(
      { booking: updatedBooking },
      "Booking cancelled successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Cancel booking error:", error);
    const response = serverError("Failed to cancel booking");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Complete booking (driver only)
 * @route PUT /api/v1/bookings/:bookingId/complete
 */
exports.completeBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get booking
    const booking = await bookings.findById(bookingId);
    if (!booking) {
      const response = notFound("Booking not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can complete this booking (driver only)
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name !== 'driver') {
      const response = forbidden("Only drivers can complete bookings");
      return res.status(response.statusCode).json(response);
    }

    if (booking.driver.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if booking can be completed
    if (booking.status !== 'confirmed') {
      const response = badRequest("Booking must be confirmed to complete");
      return res.status(response.statusCode).json(response);
    }

    // Complete booking
    const updatedBooking = await bookings.findByIdAndUpdate(
      bookingId,
      { 
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('trip')
    .populate('driver', 'name email phone')
    .populate('customer', 'name email phone');

    // Update trip status
    await trips.findByIdAndUpdate(booking.trip, {
      updatedAt: new Date()
    });

    const response = updated(
      { booking: updatedBooking },
      "Booking completed successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Complete booking error:", error);
    const response = serverError("Failed to complete booking");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Delete booking (soft delete)
 * @route DELETE /api/v1/bookings/:bookingId
 */
exports.deleteBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get booking
    const booking = await bookings.findById(bookingId);
    if (!booking) {
      const response = notFound("Booking not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can delete this booking
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'driver' && booking.driver.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if booking can be deleted
    if (['in_progress', 'completed'].includes(booking.status)) {
      const response = badRequest("Cannot delete booking that is in progress or completed");
      return res.status(response.statusCode).json(response);
    }

    // Soft delete booking
    await bookings.findByIdAndUpdate(bookingId, {
      isActive: false,
      deletedAt: new Date(),
      deletedBy: userId,
      updatedAt: new Date()
    });

    const response = deleted("Booking deleted successfully");
    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Delete booking error:", error);
    const response = serverError("Failed to delete booking");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get booking statistics
 * @route GET /api/v1/bookings/stats
 */
exports.getBookingStats = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Build filter based on user role
    const filter = { isActive: true };
    const userType = await require("../db/models/user_types").findById(user.user_type);
    
    if (userType.name === 'driver') {
      filter.driver = userId;
    } else if (userType.name === 'customer') {
      // Customers see bookings for their trips
      const userTrips = await trips.find({ customer: userId }).select('_id');
      const tripIds = userTrips.map(trip => trip._id);
      filter.trip = { $in: tripIds };
    }
    // Admin can see all stats

    // Get statistics
    const stats = await bookings.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          confirmed: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          totalRevenue: { $sum: '$price' },
          avgPrice: { $avg: '$price' }
        }
      }
    ]);

    const response = success(
      { stats: stats[0] || {} },
      "Booking statistics retrieved successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get booking stats error:", error);
    const response = serverError("Failed to retrieve booking statistics");
    return res.status(response.statusCode).json(response);
  }
};
