/**
 * Trip Management Controller
 * Handles trip creation, management, and operations
 */

const { Types } = require("mongoose");

// Models
const trips = require("../db/models/trips");
const users = require("../db/models/users");
const vehicles = require("../db/models/vehicles");
const bookings = require("../db/models/bookings");

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
const { tripSchemas } = require("../validations/schemas");

/**
 * Create a new trip
 * @route POST /api/v1/trips
 */
exports.createTrip = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Validate request data
    const { error, value } = tripSchemas.createTrip.validate(req.body, { 
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

    // Check if user is a customer
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name !== 'customer') {
      const response = forbidden("Only customers can create trips");
      return res.status(response.statusCode).json(response);
    }

    // Validate pickup date is in the future
    const pickupDate = new Date(value.pickupDate);
    const now = new Date();
    if (pickupDate <= now) {
      const response = badRequest("Pickup date must be in the future");
      return res.status(response.statusCode).json(response);
    }

    // Create trip with enhanced data
    const tripData = {
      customer: userId,
      pickupLocation: {
        address: value.pickupLocation.address,
        coordinates: {
          lat: value.pickupLocation.coordinates.lat,
          lng: value.pickupLocation.coordinates.lng
        }
      },
      dropLocation: {
        address: value.dropLocation.address,
        coordinates: {
          lat: value.dropLocation.coordinates.lat,
          lng: value.dropLocation.coordinates.lng
        }
      },
      goodsType: value.goodsType,
      weight: value.weight,
      description: value.description,
      pickupDate: pickupDate,
      budget: value.budget,
      status: 'pending',
      isActive: true
    };

    const newTrip = await trips.create(tripData);

    // Populate trip data for response
    const populatedTrip = await trips.findById(newTrip._id)
      .populate('customer', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType');

    const response = created(
      { trip: populatedTrip },
      "Trip created successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Create trip error:", error);
    const response = serverError("Failed to create trip");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get all trips with pagination and filtering
 * @route GET /api/v1/trips
 */
exports.getAllTrips = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 10, status, search, dateFrom, dateTo } = req.query;
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
      filter.customer = userId;
    } else if (userType.name === 'driver') {
      filter.driver = userId;
    }
    // Admin can see all trips
    
    if (status) {
      filter.status = status;
    }
    
    if (search) {
      filter.$or = [
        { goodsType: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'pickupLocation.address': { $regex: search, $options: 'i' } },
        { 'dropLocation.address': { $regex: search, $options: 'i' } }
      ];
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

    // Get trips with pagination
    const tripsData = await trips.find(filter)
      .populate('customer', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await trips.countDocuments(filter);

    const response = success(
      tripsData,
      "Trips retrieved successfully",
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
    console.error("Get all trips error:", error);
    const response = serverError("Failed to retrieve trips");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get specific trip by ID
 * @route GET /api/v1/trips/:tripId
 */
exports.getTripById = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get trip with populated data
    const trip = await trips.findById(tripId)
      .populate('customer', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType truckImages');

    if (!trip) {
      const response = notFound("Trip not found");
      return res.status(response.statusCode).json(response);
    }

    // Check access permissions
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'customer' && trip.customer._id.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }
    
    if (userType.name === 'driver' && trip.driver && trip.driver._id.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Get related bookings
    const relatedBookings = await bookings.find({ trip: tripId })
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType')
      .sort({ createdAt: -1 });

    const response = success(
      { 
        trip,
        bookings: relatedBookings
      },
      "Trip retrieved successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get trip by ID error:", error);
    const response = serverError("Failed to retrieve trip");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Update trip information
 * @route PUT /api/v1/trips/:tripId
 */
exports.updateTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.user_id;

    // Validate request data
    const { error, value } = tripSchemas.updateTrip.validate(req.body, { 
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

    // Get trip
    const trip = await trips.findById(tripId);
    if (!trip) {
      const response = notFound("Trip not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can update this trip
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'customer' && trip.customer.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if trip can be updated (not completed or cancelled)
    if (['completed', 'cancelled'].includes(trip.status)) {
      const response = badRequest("Cannot update completed or cancelled trip");
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

    // Update trip
    const updatedTrip = await trips.findByIdAndUpdate(
      tripId,
      { 
        ...value,
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('customer', 'name email phone')
    .populate('driver', 'name email phone')
    .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType');

    const response = updated(
      { trip: updatedTrip },
      "Trip updated successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Update trip error:", error);
    const response = serverError("Failed to update trip");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Cancel trip
 * @route PUT /api/v1/trips/:tripId/cancel
 */
exports.cancelTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get trip
    const trip = await trips.findById(tripId);
    if (!trip) {
      const response = notFound("Trip not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can cancel this trip
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'customer' && trip.customer.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if trip can be cancelled
    if (['completed', 'cancelled'].includes(trip.status)) {
      const response = badRequest("Trip is already completed or cancelled");
      return res.status(response.statusCode).json(response);
    }

    // Check if trip has active bookings
    const activeBookings = await bookings.find({ 
      trip: tripId, 
      status: { $in: ['confirmed', 'in_progress'] } 
    });

    if (activeBookings.length > 0) {
      const response = badRequest("Cannot cancel trip with active bookings");
      return res.status(response.statusCode).json(response);
    }

    // Cancel trip
    const cancelledTrip = await trips.findByIdAndUpdate(
      tripId,
      { 
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: userId,
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('customer', 'name email phone')
    .populate('driver', 'name email phone')
    .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType');

    const response = updated(
      { trip: cancelledTrip },
      "Trip cancelled successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Cancel trip error:", error);
    const response = serverError("Failed to cancel trip");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Complete trip
 * @route PUT /api/v1/trips/:tripId/complete
 */
exports.completeTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get trip
    const trip = await trips.findById(tripId);
    if (!trip) {
      const response = notFound("Trip not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can complete this trip (driver only)
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name !== 'driver') {
      const response = forbidden("Only drivers can complete trips");
      return res.status(response.statusCode).json(response);
    }

    if (trip.driver && trip.driver.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if trip can be completed
    if (trip.status === 'completed') {
      const response = badRequest("Trip is already completed");
      return res.status(response.statusCode).json(response);
    }

    if (trip.status === 'cancelled') {
      const response = badRequest("Cannot complete cancelled trip");
      return res.status(response.statusCode).json(response);
    }

    // Check if trip has confirmed booking
    const confirmedBooking = await bookings.findOne({ 
      trip: tripId, 
      status: 'confirmed',
      driver: userId
    });

    if (!confirmedBooking) {
      const response = badRequest("No confirmed booking found for this trip");
      return res.status(response.statusCode).json(response);
    }

    // Complete trip
    const completedTrip = await trips.findByIdAndUpdate(
      tripId,
      { 
        status: 'completed',
        completedAt: new Date(),
        completedBy: userId,
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('customer', 'name email phone')
    .populate('driver', 'name email phone')
    .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType');

    // Update booking status
    await bookings.findByIdAndUpdate(confirmedBooking._id, {
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date()
    });

    const response = updated(
      { trip: completedTrip },
      "Trip completed successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Complete trip error:", error);
    const response = serverError("Failed to complete trip");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Delete trip (soft delete)
 * @route DELETE /api/v1/trips/:tripId
 */
exports.deleteTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get trip
    const trip = await trips.findById(tripId);
    if (!trip) {
      const response = notFound("Trip not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can delete this trip
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'customer' && trip.customer.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if trip can be deleted
    if (['in_progress', 'completed'].includes(trip.status)) {
      const response = badRequest("Cannot delete trip that is in progress or completed");
      return res.status(response.statusCode).json(response);
    }

    // Soft delete trip
    await trips.findByIdAndUpdate(tripId, {
      isActive: false,
      deletedAt: new Date(),
      deletedBy: userId,
      updatedAt: new Date()
    });

    const response = deleted("Trip deleted successfully");
    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Delete trip error:", error);
    const response = serverError("Failed to delete trip");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get trip statistics
 * @route GET /api/v1/trips/stats
 */
exports.getTripStats = async (req, res) => {
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
    
    if (userType.name === 'customer') {
      filter.customer = userId;
    } else if (userType.name === 'driver') {
      filter.driver = userId;
    }
    // Admin can see all stats

    // Get statistics
    const stats = await trips.aggregate([
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
          totalBudget: { $sum: '$budget' },
          avgBudget: { $avg: '$budget' }
        }
      }
    ]);

    const response = success(
      { stats: stats[0] || {} },
      "Trip statistics retrieved successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get trip stats error:", error);
    const response = serverError("Failed to retrieve trip statistics");
    return res.status(response.statusCode).json(response);
  }
};
