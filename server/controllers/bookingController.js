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
const BookingRewardSettings = require('../db/models/booking_reward_settings');
const tokenController = require('./tokenController');

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

    // Enforce connectRequest presence and validate initiator/recipient and linkage
    const conn = await connect_requests.findById(value.connectRequestId);
    if (!conn || !conn.isActive) {
      const response = badRequest("Invalid connect request");
      return res.status(response.statusCode).json(response);
    }

    // Connect request must link the same trip and customer request
    if (conn.trip.toString() !== value.tripId || conn.customerRequest.toString() !== value.customerRequestId) {
      const response = forbidden("Connect request does not match the provided trip or customer request");
      return res.status(response.statusCode).json(response);
    }

    // Only initiator or recipient of the connect request can create a booking
    const isParticipant = [conn.initiator.toString(), conn.recipient.toString()].includes(userId);
    if (!isParticipant) {
      const response = forbidden("Only the initiator or recipient of the connect request can create a booking");
      return res.status(response.statusCode).json(response);
    }

    // Ensure the two participants are exactly the driver and customer we derived
    const participants = new Set([conn.initiator.toString(), conn.recipient.toString()]);
    const expected = new Set([driverId.toString(), customerId.toString()]);
    // Sets must match 1:1
    const sameParticipants = participants.size === expected.size && [...participants].every(v => expected.has(v));
    if (!sameParticipants) {
      const response = forbidden("Connect request participants must be the same driver and customer for this booking");
      return res.status(response.statusCode).json(response);
    }

    const connectRequestId = conn._id;

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
      .populate('customer', 'name email phone')
      .populate('customerRequest');

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

    // Role-based visibility: admin sees all; others see where they are initiator or recipient
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name !== 'admin') {
      filter.$or = [
        { initiator: userId },
        { recipient: userId },
      ];
    }

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
      .populate('customerRequest', 'customer')
      .populate('driver', 'name email phone')
      .populate('customer', 'name email phone')
      .populate('initiator', 'name email phone')
      .populate('recipient', 'name email phone')
      .populate('connectRequest', 'initiator recipient')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Add canAcceptOrRejectCancellationRequest field to each booking
    const enhancedBookingsData = bookingsData.map(booking => {
      const bookingObj = booking.toObject();

      // Determine if user can accept/reject cancellation request
      // User can accept/reject if:
      // 1. There's a pending cancellation (cancellationPending is true)
      // 2. User is NOT the one who requested the cancellation
      // 3. User is either initiator or recipient of the booking
      let canAcceptOrRejectCancellationRequest = false;

      if (bookingObj.cancellationPending && bookingObj.cancellationRequestedBy) {
        const cancellationRequestedById = bookingObj.cancellationRequestedBy.toString();
        const isUserTheRequester = cancellationRequestedById === userId;
        const isUserParticipant = [
          bookingObj.initiator?._id?.toString() || bookingObj.initiator?.toString(),
          bookingObj.recipient?._id?.toString() || bookingObj.recipient?.toString()
        ].includes(userId);

        canAcceptOrRejectCancellationRequest = !isUserTheRequester && isUserParticipant;
      }

      return {
        ...bookingObj,
        canAcceptOrRejectCancellationRequest
      };
    });

    // Get total count
    const total = await bookings.countDocuments(filter);

    const response = success(
      enhancedBookingsData,
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
      .populate('trip', 'pickupLocation dropLocation goodsType weight budget status')
      .populate('customerRequest', 'customer')
      .populate('driver', 'name email phone')
      .populate('customer', 'name email phone')
      .populate('initiator', 'name email phone')
      .populate('recipient', 'name email phone')
      .populate('connectRequest', 'initiator recipient');

    if (!booking) {
      const response = notFound("Booking not found");
      return res.status(response.statusCode).json(response);
    }

    // Check access permissions: allow admin, otherwise initiator or recipient only
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name !== 'admin') {
      const initiatorId = booking.initiator && booking.initiator._id ? booking.initiator._id.toString() : booking.initiator.toString();
      const recipientId = booking.recipient && booking.recipient._id ? booking.recipient._id.toString() : booking.recipient.toString();
      if (initiatorId !== userId && recipientId !== userId) {
        const response = forbidden("Access denied");
        return res.status(response.statusCode).json(response);
      }
    }

    // Add canAcceptOrRejectCancellationRequest field to booking
    const bookingObj = booking.toObject();

    // Determine if user can accept/reject cancellation request
    // User can accept/reject if:
    // 1. There's a pending cancellation (cancellationPending is true)
    // 2. User is NOT the one who requested the cancellation
    // 3. User is either initiator or recipient of the booking
    let canAcceptOrRejectCancellationRequest = false;

    if (bookingObj.cancellationPending && bookingObj.cancellationRequestedBy) {
      const cancellationRequestedById = bookingObj.cancellationRequestedBy.toString();
      const isUserTheRequester = cancellationRequestedById === userId;
      const isUserParticipant = [
        bookingObj.initiator?._id?.toString() || bookingObj.initiator?.toString(),
        bookingObj.recipient?._id?.toString() || bookingObj.recipient?.toString()
      ].includes(userId);

      canAcceptOrRejectCancellationRequest = !isUserTheRequester && isUserParticipant;
    }

    const enhancedBooking = {
      ...bookingObj,
      canAcceptOrRejectCancellationRequest
    };

    const response = success(
      { booking: enhancedBooking },
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
      .populate('customerRequest', 'customer')
      .populate('driver', 'name email phone')
      .populate('customer', 'name email phone')
      .populate('initiator', 'name email phone')
      .populate('recipient', 'name email phone')
      .populate('connectRequest', 'initiator recipient');

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
      .populate('customerRequest')
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
        $or: [{ trip: booking.trip._id }, { customerRequest: booking.customerRequest }],
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

    // ---- New: Credit tokens to driver based on booking_reward_settings ----
    const rewardSettings = await BookingRewardSettings.findOne({ isActive: true }).sort({ effectiveAt: -1 }).lean();

    if (rewardSettings && updatedBooking.customerRequest) {
      const distanceKm = updatedBooking.customerRequest.distance?.value ? updatedBooking.customerRequest.distance.value / 1000 : 0;
      const slab = rewardSettings.distanceSlabs.find(s => distanceKm >= s.minKm && distanceKm < s.maxKm);
      if (slab) {
        const tokensToCredit = Math.floor((slab.baseTokens * rewardSettings.confirmationPct) / 100);
        if (tokensToCredit > 0) {
          await tokenController.creditTokens(
            updatedBooking.driver,
            tokensToCredit,
            `Booking confirmation reward for booking ${bookingId} (${distanceKm.toFixed(1)} km)`,
            userId
          );
        }
      }
    }

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

    // Validate request data
    const { error, value } = bookingSchemas.cancelBooking.validate(req.body, {
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
    const booking = await bookings.findById(bookingId)
      .populate('trip', 'status')
      .populate('initiator', 'name')
      .populate('recipient', 'name');

    if (!booking) {
      const response = notFound("Booking not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user is participant (initiator or recipient) unless admin
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name !== 'admin') {
      const initiatorId = booking.initiator && booking.initiator._id ? booking.initiator._id.toString() : booking.initiator.toString();
      const recipientId = booking.recipient && booking.recipient._id ? booking.recipient._id.toString() : booking.recipient.toString();
      if (initiatorId !== userId && recipientId !== userId) {
        const response = forbidden("Access denied");
        return res.status(response.statusCode).json(response);
      }
    }

    // If already cancelled or completed, block
    if (['completed', 'cancelled', "rejected", "expired", "picked_up", "delivered"].includes(booking.status)) {
      const response = badRequest("Booking is already cancelled/rejected/expired/picked_up/delivered/completed");
      return res.status(response.statusCode).json(response);
    }

    // Helper to update CR back to pending
    const setCustomerRequestPending = async (crId) => {
      if (!crId) return;
      await customer_requests.updateOne(
        { _id: crId },
        { $set: { status: '684da120412825ef8b404712', updatedAt: new Date() } }
      );
    };

    // Helper to claw back confirmation reward if booking had been confirmed before
    const clawbackConfirmationReward = async (bk) => {
      try {
        // Consider it confirmed if it has acceptedAt or the last known status was 'confirmed'
        const wasConfirmed = !!bk.acceptedAt || bk.status === 'confirmed';
        if (!wasConfirmed) return;

        // Ensure we have the customer request distance
        const cr = await customer_requests.findById(bk.customerRequest).lean();
        const distanceKm = cr?.distance?.value ? cr.distance.value / 1000 : 0;

        // Load active reward settings
        const rewardSettings = await BookingRewardSettings.findOne({ isActive: true }).sort({ effectiveAt: -1 }).lean();
        if (!rewardSettings) return;

        const slab = rewardSettings.distanceSlabs.find(s => distanceKm >= s.minKm && distanceKm < s.maxKm);
        if (!slab) return;

        const confirmationTokens = Math.floor((slab.baseTokens * rewardSettings.confirmationPct) / 100);
        console.log("confirmationTokens : ", confirmationTokens);
        if (confirmationTokens > 0) {
          // Optional idempotency: if your booking doc has flags, check them here (e.g., confirmationRewardCredited && !confirmationRewardClawedBack)
          await tokenController.debitTokens(
            bk.driver, // driver user id
            confirmationTokens,
            `Clawback: booking cancelled after confirmation (${distanceKm.toFixed(1)} km, booking ${bk._id})`,
            userId,
            `booking:${bk._id}:confirmation_clawback`
          );

          // If you maintain flags on booking, set them here to avoid double clawbacks:
          // await bookings.updateOne({ _id: bk._id }, { $set: { confirmationRewardClawedBack: true } });
        }
      } catch (clawErr) {
        console.error("Clawback error on cancellation:", clawErr);
        // Do not block overall cancellation; optionally notify ops.
      }
    };

    // Two-step cancellation when confirmed: first participant requests, second confirms
    if (booking.status === 'confirmed') {
      // If no pending request, create one by current user
      if (!booking.cancellationPending) {
        const updatedBooking = await bookings.findByIdAndUpdate(
          bookingId,
          {
            cancellationPending: true,
            cancellationRequestedBy: userId,
            cancellationRequestedAt: new Date(),
            cancellationReason: value.cancellationReason,
            updatedAt: new Date(),
          },
          { new: true }
        )
          .populate('trip')
          .populate('driver', 'name email phone')
          .populate('customer', 'name email phone');

        const response = updated(
          { booking: updatedBooking },
          "Cancellation request created. Awaiting other party's confirmation."
        );
        return res.status(response.statusCode).json(response);
      }

      // If there is a pending request, only the other party can confirm
      const requestedBy = booking.cancellationRequestedBy?.toString();
      if (requestedBy === userId) {
        const response = forbidden("You have already requested cancellation. Await the other party's action.");
        return res.status(response.statusCode).json(response);
      }

      // Other party confirms -> cancel
      const updatedBooking = await bookings.findByIdAndUpdate(
        bookingId,
        {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: userId,
          cancellationPending: false,
          cancellationAcceptedBy: userId,
          cancellationAcceptedAt: new Date(),
          // Keep existing cancellationReason from the initial request
          updatedAt: new Date(),
        },
        { new: true }
      )
        .populate('trip')
        .populate('driver', 'name email phone')
        .populate('customer', 'name email phone');

      // Update customerRequest status to pending after booking cancellation
      await setCustomerRequestPending(updatedBooking?.customerRequest);

      // Claw back confirmation reward (if previously credited)
      await clawbackConfirmationReward(booking);

      // // Update customerRequest status to pending after booking cancellation
      // if (updatedBooking && updatedBooking.customerRequest) { // ADDED
      //   await customer_requests.updateOne( // ADDED
      //     { _id: updatedBooking.customerRequest }, // ADDED
      //     { $set: { status: '684da120412825ef8b404712', updatedAt: new Date() } } // ADDED
      //   ); // ADDED
      // } // ADDED


      const response = updated(
        { booking: updatedBooking },
        "Booking cancelled successfully"
      );
      return res.status(response.statusCode).json(response);
    }

    // If not confirmed (e.g., pending), allow direct cancel by either participant
    const updatedBooking = await bookings.findByIdAndUpdate(
      bookingId,
      {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancellationReason: value.cancellationReason,
        cancellationPending: false,
        updatedAt: new Date()
      },
      { new: true }
    )
      .populate('trip')
      .populate('driver', 'name email phone')
      .populate('customer', 'name email phone');


    // Update customerRequest status to pending after booking cancellation
    await setCustomerRequestPending(updatedBooking?.customerRequest);

    // For non-confirmed cancellations, no clawback is needed by default.
    // If there are edge-cases where a booking previously became confirmed, add a guard like above:
    // await clawbackConfirmationReward(booking);

    // Update customerRequest status to pending after booking cancellation
    // if (updatedBooking && updatedBooking.customerRequest) { // ADDED
    //   await customer_requests.updateOne( // ADDED
    //     { _id: updatedBooking.customerRequest }, // ADDED
    //     { $set: { status: '684da120412825ef8b404712', updatedAt: new Date() } } // ADDED
    //   ); // ADDED
    // } // ADDED

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
