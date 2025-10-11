// controllers/reviewController.js
const mongoose = require('mongoose');
const reviews = require('../db/models/reviews');
const bookings = require('../db/models/bookings');
const users = require('../db/models/users');
const customer_requests = require('../db/models/customer_requests');
const trips = require('../db/models/trips');
const connect_requests = require('../db/models/connect_requests');
const { reviewsSchemas } = require('../validations/schemas');
const { createReview, updateReview, reportReview } = reviewsSchemas;
const { badRequest, unauthorized, forbidden, notFound, created, updated, serverError } = require('../utils/response-handler');

const asId = (v) => (typeof v === 'string' ? new mongoose.Types.ObjectId(v) : v);

exports.create = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Validate payload
    const { error, value } = createReview.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest('Validation failed', error.details));

    // Auth user
    const user = await users.findById(userId).lean();
    if (!user || !user.isActive) return res.status(401).json(unauthorized('User not found or inactive'));

    // Load booking and ensure delivered
    const booking = await bookings.findById(value.bookingId).lean();
    if (!booking) return res.status(404).json(notFound('Booking not found'));
    if (!['delivered','completed'].includes(booking.status)) {
      return res.status(400).json(badRequest('Reviews allowed only after delivery/completion'));
    }

    // Determine roles and participants
    const driverId = booking.driver?.toString() || booking.recipient?.toString();
    const customerId = booking.customer?.toString() || booking.initiator?.toString();

    if (!driverId || !customerId) {
      return res.status(400).json(badRequest('Booking missing driver/customer references'));
    }

    // rater must be a participant and role must match identity
    const isDriver = userId === driverId;
    const isCustomer = userId === customerId;
    if (!isDriver && !isCustomer) {
      return res.status(403).json(forbidden('Only booking participants may review'));
    }
    if (value.raterRole === 'driver' && !isDriver) {
      return res.status(400).json(badRequest('raterRole mismatch: not the driver'));
    }
    if (value.raterRole === 'customer' && !isCustomer) {
      return res.status(400).json(badRequest('raterRole mismatch: not the customer'));
    }

    // Set ratee based on raterRole
    const rateeRole = value.raterRole === 'driver' ? 'customer' : 'driver';
    const rater = asId(userId);
    const ratee = asId(value.raterRole === 'driver' ? customerId : driverId);

    // Prevent duplicate review by same rater for same booking
    const existing = await reviews.findOne({ booking: value.booking, rater }).lean();
    if (existing) {
      return res.status(400).json(badRequest('Review already submitted for this booking'));
    }

    // Validate related refs coherence (trip, CR, connect)
    if (String(booking.trip) !== value.tripId) {
      return res.status(400).json(badRequest('Trip mismatch for booking'));
    }
    if (String(booking.customerRequest) !== value.customerRequest) {
      return res.status(400).json(badRequest('CustomerRequest mismatch for booking'));
    }
    if (value.connectRequest && String(booking.connectRequest || '') !== value.connectRequest) {
      // Allow empty if booking does not track connectRequest
      return res.status(400).json(badRequest('ConnectRequest mismatch for booking'));
    }

    // Create review
    const doc = await reviews.create({
      booking: asId(value.booking),
      trip: asId(value.trip),
      customerRequest: asId(value.customerRequest),
      connectRequest: value.connectRequest ? asId(value.connectRequest) : undefined,

      driver: asId(driverId),
      customer: asId(customerId),

      rater,
      ratee,
      raterRole: value.raterRole,
      rateeRole,

      rating: value.rating,
      title: value.title,
      comment: value.comment,

      isPublished: true,
      addedBy: rater
    });

    return res.status(201).json(created({ review: doc }, 'Review submitted'));

  } catch (e) {
    console.error('create review error:', e);
    if (e?.code === 11000) {
      return res.status(400).json(badRequest('Duplicate review for this booking'));
    }
    return res.status(500).json(serverError('Failed to submit review'));
  }
};

exports.updateOwn = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.user_id;

    const { error, value } = updateReview.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest('Validation failed', error.details));

    const review = await reviews.findById(reviewId);
    if (!review) return res.status(404).json(notFound('Review not found'));

    if (review.rater.toString() !== userId) {
      return res.status(403).json(forbidden('Only the author can edit the review'));
    }

    // Optional: enforce edit window, e.g., 7 days
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - review.createdAt.getTime() > sevenDaysMs) {
      return res.status(400).json(badRequest('Edit window expired'));
    }

    // Apply changes
    if (value.rating !== undefined) review.rating = value.rating;
    if (value.title !== undefined) review.title = value.title;
    if (value.comment !== undefined) review.comment = value.comment;

    await review.save();
    return res.status(200).json(updated({ review }, 'Review updated'));

  } catch (e) {
    console.error('update review error:', e);
    return res.status(500).json(serverError('Failed to update review'));
  }
};

exports.report = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.user_id;

    const { error, value } = reportReview.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest('Validation failed', error.details));

    const review = await reviews.findById(reviewId);
    if (!review) return res.status(404).json(notFound('Review not found'));

    // Any authenticated user can report; optionally restrict to participants/admin
    review.isReported = true;
    review.reportReason = value.reason;
    await review.save();

    return res.status(200).json(updated({ reviewId }, 'Review reported'));

  } catch (e) {
    console.error('report review error:', e);
    return res.status(500).json(serverError('Failed to report review'));
  }
};

exports.listForUser = async (req, res) => {
  try {
    const { userId } = req.params; // ratee
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { ratee: userId, isPublished: true };
    const [items, total] = await Promise.all([
      reviews.find(filter)
        .populate('rater', 'name')
        .populate('booking', 'status deliveredAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      reviews.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      meta: {
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });

  } catch (e) {
    console.error('listForUser error:', e);
    return res.status(500).json(serverError('Failed to list reviews'));
  }
};

exports.listForBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const items = await reviews.find({ booking: bookingId })
      .populate('rater', 'name')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: items });
  } catch (e) {
    console.error('listForBooking error:', e);
    return res.status(500).json(serverError('Failed to list booking reviews'));
  }
};
