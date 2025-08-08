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
    if (userType.name !== 'driver') {
      const response = forbidden("Only customers can create trips");
      return res.status(response.statusCode).json(response);
    }

    // Validate trip dates are in the future and end is after start
    const tripStartDate = new Date(value.tripStartDate);
    const tripEndDate = new Date(value.tripEndDate);
    const now = new Date();
    if (tripStartDate <= now) {
      const response = badRequest("Trip start date must be in the future");
      return res.status(response.statusCode).json(response);
    }
    if (tripEndDate <= tripStartDate) {
      const response = badRequest("Trip end date must be after start date");
      return res.status(response.statusCode).json(response);
    }

    // Validate coordinates format
    if (!value.tripStartLocation.coordinates || !value.tripStartLocation.coordinates.lat || !value.tripStartLocation.coordinates.lng) {
      const response = badRequest("Invalid trip start location coordinates");
      return res.status(response.statusCode).json(response);
    }

    if (!value.tripDestination.coordinates || !value.tripDestination.coordinates.lat || !value.tripDestination.coordinates.lng) {
      const response = badRequest("Invalid trip destination coordinates");
      return res.status(response.statusCode).json(response);
    }

    // Determine routeGeoJSON coordinates
    let routeGeoJSONCoordinates = [];
    console.log("routeGeoJSON from request:", value.routeGeoJSON);
    
    if (
      value.routeGeoJSON &&
      Array.isArray(value.routeGeoJSON.coordinates) &&
      value.routeGeoJSON.coordinates.length >= 2 &&
      value.routeGeoJSON.coordinates.every(
        coord => Array.isArray(coord) && coord.length === 2 &&
          typeof coord[0] === 'number' && typeof coord[1] === 'number'
      )
    ) {
      console.log("Using provided routeGeoJSON coordinates");
      routeGeoJSONCoordinates = value.routeGeoJSON.coordinates;
    } else {
      console.log("Using fallback routeGeoJSON coordinates (start to end only)");
      routeGeoJSONCoordinates = [
        [value.tripStartLocation.coordinates.lng, value.tripStartLocation.coordinates.lat],
        [value.tripDestination.coordinates.lng, value.tripDestination.coordinates.lat]
      ];
    }
    
    console.log("Final routeGeoJSONCoordinates:", routeGeoJSONCoordinates);

    const tripData = {
      customer: userId,
      tripAddedBy: userId, // The user creating the trip
      tripStartLocation: {
        address: value.tripStartLocation.address,
        coordinates: [
          value.tripStartLocation.coordinates.lng,
          value.tripStartLocation.coordinates.lat
        ]
      },
      tripDestination: {
        address: value.tripDestination.address,
        coordinates: [
          value.tripDestination.coordinates.lng,
          value.tripDestination.coordinates.lat
        ]
      },
      goodsType: value.goodsType,
      weight: value.weight,
      description: value.description,
      tripStartDate: tripStartDate,
      tripEndDate: tripEndDate,
      isActive: true,
      currentLocation: {
        type: "Point",
        coordinates: [
          value.tripStartLocation.coordinates.lng,
          value.tripStartLocation.coordinates.lat
        ]
      },
      routeGeoJSON: {
        type: "LineString",
        coordinates: routeGeoJSONCoordinates
      },
      // Add optional fields if provided
      ...(value.distance && { distance: value.distance }),
      ...(value.duration && { duration: value.duration }),
      ...(value.vehicle && { vehicle: value.vehicle }),
      ...(value.driver && { driver: value.driver })
    };
    console.log("tripData", tripData);

    const newTrip = await trips.create(tripData);

    // Populate trip data for response
    const populatedTrip = await trips.findById(newTrip._id)
      .populate('customer', 'name email phone')
      .populate('tripAddedBy', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
      .populate('goodsType', 'name description');

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
        { 'tripStartLocation.address': { $regex: search, $options: 'i' } },
        { 'tripDestination.address': { $regex: search, $options: 'i' } }
      ];
    }
    
    if (dateFrom || dateTo) {
      filter.tripStartDate = {};
      if (dateFrom) {
        filter.tripStartDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.tripStartDate.$lte = new Date(dateTo);
      }
    }

    // Get trips with pagination
    const tripsData = await trips.find(filter)
      .populate('customer', 'name email phone')
      .populate('tripAddedBy', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
      .populate('goodsType', 'name description')
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
      .populate('tripAddedBy', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType truckImages')
      .populate('goodsType', 'name description');

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

    // Validate trip dates if being updated
    if (value.tripStartDate) {
      const tripStartDate = new Date(value.tripStartDate);
      const now = new Date();
      if (tripStartDate <= now) {
        const response = badRequest("Trip start date must be in the future");
        return res.status(response.statusCode).json(response);
      }
    }
    if (value.tripEndDate && value.tripStartDate) {
      const tripStartDate = new Date(value.tripStartDate);
      const tripEndDate = new Date(value.tripEndDate);
      if (tripEndDate <= tripStartDate) {
        const response = badRequest("Trip end date must be after start date");
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
    .populate('tripAddedBy', 'name email phone')
    .populate('driver', 'name email phone')
    .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
    .populate('goodsType', 'name description');

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
    .populate('tripAddedBy', 'name email phone')
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
    .populate('tripAddedBy', 'name email phone')
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
