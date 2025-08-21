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
require("../db/models/goods_accepted");
require("../db/models/trip_status");

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
 * Validate vehicle ownership
 * @param {string} vehicleId - Vehicle ID to validate
 * @param {string} userId - Current user ID
 * @returns {Object} Validation result with vehicle data or error
 */
const validateVehicleOwnership = async (vehicleId, userId) => {
  try {
    const vehicle = await vehicles.findById(vehicleId);
    if (!vehicle) {
      return { isValid: false, error: "Vehicle not found" };
    }

    if (vehicle.user.toString() !== userId) {
      return { isValid: false, error: "You can only use your own vehicles for trips" };
    }

    return { isValid: true, vehicle };
  } catch (error) {
    console.error("Vehicle ownership validation error:", error);
    return { isValid: false, error: "Failed to validate vehicle ownership" };
  }
};

/**
 * Validate driver assignment
 * @param {string} driverId - Driver ID to validate
 * @param {string} userId - Current user ID
 * @param {boolean} selfDrive - Whether the current user is driving
 * @returns {Object} Validation result with driver data or error
 */
const validateDriverAssignment = async (driverId, userId, selfDrive) => {
  try {
    const driver = await users.findById(driverId);
    if (!driver) {
      return { isValid: false, error: "Driver not found" };
    }

    if (selfDrive) {
      // If self-drive, driver must be the current user
      if (driverId !== userId) {
        return { isValid: false, error: "For self-drive trips, driver must be the current user" };
      }
    } else {
      // If not self-drive, check if driver has active connection with current user
      const driverConnections = require("../db/models/driver_connections");
      const connection = await driverConnections.findOne({
        $or: [
          { requester: userId, requested: driverId },
          { requester: driverId, requested: userId }
        ],
        status: 'accepted',
        isActive: true
      });

      if (!connection) {
        return { isValid: false, error: "Driver must be a connected friend to assign them to your trip" };
      }
    }

    return { isValid: true, driver };
  } catch (error) {
    console.error("Driver assignment validation error:", error);
    return { isValid: false, error: "Failed to validate driver assignment" };
  }
};

/**
 * Check driver availability for the trip period
 * @param {string} driverId - Driver ID to check
 * @param {Date} tripStartDate - Trip start date
 * @param {Date} tripEndDate - Trip end date
 * @param {string} excludeTripId - Trip ID to exclude from check (for updates)
 * @returns {Object} Validation result with availability status or error
 */
const checkDriverAvailability = async (driverId, tripStartDate, tripEndDate, excludeTripId = null) => {
  try {
    const trips = require("../db/models/trips");

    // Find overlapping trips for the driver
    const overlappingTrips = await trips.find({
      driver: driverId,
      _id: { $ne: excludeTripId }, // Exclude current trip for updates
      isActive: true,
      $or: [
        // Trip starts during existing trip
        {
          tripStartDate: { $lte: tripStartDate },
          tripEndDate: { $gt: tripStartDate }
        },
        // Trip ends during existing trip
        {
          tripStartDate: { $lt: tripEndDate },
          tripEndDate: { $gte: tripEndDate }
        },
        // Trip completely contains existing trip
        {
          tripStartDate: { $gte: tripStartDate },
          tripEndDate: { $lte: tripEndDate }
        }
      ]
    });

    if (overlappingTrips.length > 0) {
      return {
        isAvailable: false,
        error: "Driver is already assigned to another trip during this time period"
      };
    }

    return { isAvailable: true };
  } catch (error) {
    console.error("Driver availability check error:", error);
    return { isAvailable: false, error: "Failed to check driver availability" };
  }
};

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
      const response = forbidden("Only drivers can create trips");
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

    // Validate vehicle ownership
    const vehicleValidation = await validateVehicleOwnership(value.vehicle, userId);
    if (!vehicleValidation.isValid) {
      const response = badRequest(vehicleValidation.error);
      return res.status(response.statusCode).json(response);
    }

    // Validate driver assignment
    const driverValidation = await validateDriverAssignment(value.driver, userId, value.selfDrive);
    if (!driverValidation.isValid) {
      const response = badRequest(driverValidation.error);
      return res.status(response.statusCode).json(response);
    }

    // Validate goods type exists in database
    const goodsAccepted = require("../db/models/goods_accepted");
    const goodsType = await goodsAccepted.findById(value.goodsType);
    if (!goodsType) {
      const response = badRequest("Goods type not found");
      return res.status(response.statusCode).json(response);
    }

    // Check driver availability for the trip period
    const availabilityCheck = await checkDriverAvailability(value.driver, tripStartDate, tripEndDate);
    if (!availabilityCheck.isAvailable) {
      const response = conflict(availabilityCheck.error);
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

    // ✅ Map viaRoutes safely
    let viaRoutes = [];
    if (Array.isArray(value.viaRoutes) && value.viaRoutes.length > 0) {
      viaRoutes = value.viaRoutes.map(via => ({
        name: via.name || null,
        coordinates: {
          type: "Point",
          coordinates: [via.coordinates.lng, via.coordinates.lat]
        }
      }));
    }

    const tripData = {
      description: value.description,
      title: value.title,
      tripAddedBy: userId, // The user creating the trip
      tripStartLocation: {
        address: value.pickupLocation.address,
        coordinates: value.pickupLocation.coordinates,
      },
      tripDestination: {
        address: value.pickupLocation.address,
        coordinates: value.pickupLocation.coordinates,
      },
      viaRoutes: viaRoutes,
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
      .populate('tripAddedBy', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
      .populate('goodsType', 'name description')
      .populate('status', 'name description');

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
    const {
      page = 1,
      limit = 10,
      status,
      search,
      dateFrom,
      dateTo,
      currentLocation,
      pickupLocation,
      dropoffLocation,
      pickupDropoffBoth
    } = req.query;
    const skip = (page - 1) * limit;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Build filter object
    const filter = { isActive: true };

    if (status) {
      filter.status = status;
    }

    if (search) {
      // Search only string fields; avoid regex on ObjectId refs (e.g., goodsType)
      filter.$or = [
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

    // Location-based filtering using two-step approach for better accuracy
    console.log("currentLocation", currentLocation);
    console.log("pickupLocation", pickupLocation);
    console.log("dropoffLocation", dropoffLocation);
    console.log("pickupDropoffBoth", pickupDropoffBoth);

    // Helper function to calculate distance between two points in meters
    const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
      const R = 6371; // Radius of the earth in km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c; // Distance in km
      return distance * 1000; // Convert to meters
    };

    // Helper to build an approximate circle polygon around a point (for $geoIntersects on LineString route)
    const makeCirclePolygon = (lng, lat, radiusMeters, steps = 64) => {
      const earthRadius = 6371000; // meters
      const d = radiusMeters / earthRadius; // angular distance in radians
      const latRad = lat * Math.PI / 180;
      const lngRad = lng * Math.PI / 180;

      const coords = [];
      for (let i = 0; i <= steps; i++) {
        const brng = 2 * Math.PI * (i / steps);
        const lat2 = Math.asin(
          Math.sin(latRad) * Math.cos(d) +
          Math.cos(latRad) * Math.sin(d) * Math.cos(brng)
        );
        const lng2 = lngRad + Math.atan2(
          Math.sin(brng) * Math.sin(d) * Math.cos(latRad),
          Math.cos(d) - Math.sin(latRad) * Math.sin(lat2)
        );
        coords.push([(lng2 * 180 / Math.PI), (lat2 * 180 / Math.PI)]);
      }

      return {
        type: "Polygon",
        coordinates: [coords]
      };
    };

    // Parse coordinates from query parameters
    let pickupLat, pickupLng, dropoffLat, dropoffLng, currentLat, currentLng;
    // Radius (meters): configurable via query params `searchRadius` or `radius`, default 5000
    let searchRadius = 5000;
    const radiusParam = typeof req.query.searchRadius !== 'undefined' ? req.query.searchRadius : req.query.radius;
    if (typeof radiusParam !== 'undefined') {
      const parsedRadius = parseInt(radiusParam, 10);
      if (!Number.isNaN(parsedRadius) && parsedRadius > 0) {
        searchRadius = parsedRadius;
      }
    }
    console.log("searchRadius", searchRadius);
    console.log("filter", filter);
    if (currentLocation) {
      try {
        if (Array.isArray(currentLocation)) {
          [currentLng, currentLat] = currentLocation;
        } else if (typeof currentLocation === 'string') {
          [currentLng, currentLat] = currentLocation.split(',').map(coord => parseFloat(coord.trim()));
        }
        console.log("Current location parsed:", { currentLng, currentLat });
      } catch (error) {
        console.error("Invalid current location coordinates:", error);
      }
    }

    if (pickupLocation) {
      try {
        if (Array.isArray(pickupLocation)) {
          [pickupLng, pickupLat] = pickupLocation;
        } else if (typeof pickupLocation === 'string') {
          [pickupLng, pickupLat] = pickupLocation.split(',').map(coord => parseFloat(coord.trim()));
        }
        console.log("Pickup location parsed:", { pickupLng, pickupLat });
      } catch (error) {
        console.error("Invalid pickup location coordinates:", error);
      }
    }

    if (dropoffLocation) {
      try {
        if (Array.isArray(dropoffLocation)) {
          [dropoffLng, dropoffLat] = dropoffLocation;
        } else if (typeof dropoffLocation === 'string') {
          [dropoffLng, dropoffLat] = dropoffLocation.split(',').map(coord => parseFloat(coord.trim()));
        }
        console.log("Dropoff location parsed:", { dropoffLng, dropoffLat });
      } catch (error) {
        console.error("Invalid dropoff location coordinates:", error);
      }
    }

    // Two-step location filtering approach for better accuracy
    let tripsData = [];
    let total = 0;

    if (pickupLat && pickupLng) {
      // Step 1: Find trips near pickup point
      console.log("Step 1: Finding trips near pickup point:", { pickupLng, pickupLat });
      const pickupCircle = makeCirclePolygon(pickupLng, pickupLat, searchRadius);
      const pickupNearbyTrips = await trips
        .find({
          routeGeoJSON: { $geoIntersects: { $geometry: pickupCircle } },
          ...(Object.keys(filter).length ? { $and: [filter] } : {}),
        })
        .populate('tripAddedBy', 'name email phone')
        .populate('driver', 'name email phone')
        .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
        .populate('goodsType', 'name description')
        .populate('status', 'name description')
        .sort({ _id: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      console.log(`Found ${pickupNearbyTrips.length} trips near pickup point`);

      // Step 2: Filter those that also pass near dropoff point
      if (dropoffLat && dropoffLng) {
        console.log("Step 2: Filtering for dropoff proximity:", { dropoffLng, dropoffLat });
        tripsData = pickupNearbyTrips.filter((trip) => {
          if (!trip.routeGeoJSON || !trip.routeGeoJSON.coordinates) {
            return false;
          }

          // Check if any route coordinate is within radius of dropoff location
          return trip.routeGeoJSON.coordinates.some((coord) => {
            const [lng, lat] = coord;
            const dist = getDistanceFromLatLonInMeters(
              lat,
              lng,
              dropoffLat,
              dropoffLng
            );
            return dist <= searchRadius;
          });
        });
        console.log(`After dropoff filtering: ${tripsData.length} trips`);
      } else {
        tripsData = pickupNearbyTrips;
      }

      // Get total count for pagination
      total = await trips.countDocuments({
        routeGeoJSON: { $geoIntersects: { $geometry: pickupCircle } },
        ...(Object.keys(filter).length ? { $and: [filter] } : {}),
      });

    } else if (dropoffLat && dropoffLng) {
      // Only dropoff provided
      console.log("Finding trips near dropoff point:", { dropoffLng, dropoffLat });
      const dropoffCircle = makeCirclePolygon(dropoffLng, dropoffLat, searchRadius);
      tripsData = await trips
        .find({
          routeGeoJSON: { $geoIntersects: { $geometry: dropoffCircle } },
          ...(Object.keys(filter).length ? { $and: [filter] } : {}),
        })
        .populate('tripAddedBy', 'name email phone')
        .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
        .populate('goodsType', 'name description')
        .populate('status', 'name description')
        .sort({ _id: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      total = await trips.countDocuments({
        routeGeoJSON: { $geoIntersects: { $geometry: dropoffCircle } },
        ...(Object.keys(filter).length ? { $and: [filter] } : {}),
      });

    } else if (currentLat && currentLng) {
      // Current location filtering
      console.log("Finding trips near current location:", { currentLng, currentLat });
      const currentCircle = makeCirclePolygon(currentLng, currentLat, searchRadius);
      tripsData = await trips
        .find({
          routeGeoJSON: { $geoIntersects: { $geometry: currentCircle } },
          ...(Object.keys(filter).length ? { $and: [filter] } : {}),
        })
        .populate('tripAddedBy', 'name email phone')
        .populate('driver', 'name email phone')
        .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
        .populate('goodsType', 'name description')
        .populate('status', 'name description')
        .sort({ _id: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      total = await trips.countDocuments({
        routeGeoJSON: { $geoIntersects: { $geometry: currentCircle } },
        ...(Object.keys(filter).length ? { $and: [filter] } : {}),
      });

    } else {
      // No location filtering - use standard approach
      console.log("No location filtering - using standard query");
      tripsData = await trips.find(filter)
        .populate('tripAddedBy', 'name email phone')
        .populate('driver', 'name email phone')
        .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
        .populate('goodsType', 'name description')
        .populate('status', 'name description')
        .sort({ _id: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      total = await trips.countDocuments(filter);
    }

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
      .populate('tripAddedBy', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
      .populate('goodsType', 'name description')
      .populate('status', 'name description');

    if (!trip) {
      const response = notFound("Trip not found");
      return res.status(response.statusCode).json(response);
    }

    // Check access permissions
    const userType = await require("../db/models/user_types").findById(user.user_type);
    // console.log("userId", userId);
    // console.log("trip.tripAddedBy._id.toString()", trip.tripAddedBy._id.toString());
    // if (trip.tripAddedBy._id.toString() !== userId.toString()) {
    //   const response = forbidden("Access denied");
    //   return res.status(response.statusCode).json(response);
    // }

    // if (userType.name === 'driver' && trip.driver && trip.driver._id.toString() !== userId) {
    //   const response = forbidden("Access denied");
    //   return res.status(response.statusCode).json(response);
    // }

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

    // Convert coordinates from {lat, lng} format to [lng, lat] array format if needed
    let updateData = { ...req.body };

    if (updateData.tripStartLocation && updateData.tripStartLocation.coordinates) {
      console.log('Original tripStartLocation coordinates:', updateData.tripStartLocation.coordinates);
      if (typeof updateData.tripStartLocation.coordinates === 'object' &&
        updateData.tripStartLocation.coordinates.lat !== undefined &&
        updateData.tripStartLocation.coordinates.lng !== undefined) {
        // Validate coordinate values
        const lng = parseFloat(updateData.tripStartLocation.coordinates.lng);
        const lat = parseFloat(updateData.tripStartLocation.coordinates.lat);

        if (isNaN(lng) || isNaN(lat)) {
          const response = badRequest("Invalid coordinate values: longitude and latitude must be valid numbers");
          return res.status(response.statusCode).json(response);
        }

        if (lng < -180 || lng > 180) {
          const response = badRequest("Longitude must be between -180 and 180 degrees");
          return res.status(response.statusCode).json(response);
        }

        if (lat < -90 || lat > 90) {
          const response = badRequest("Latitude must be between -90 and 90 degrees");
          return res.status(response.statusCode).json(response);
        }

        // Convert from {lat, lng} to [lng, lat] format (GeoJSON standard)
        updateData.tripStartLocation.coordinates = [lng, lat];
        console.log('Converted tripStartLocation coordinates:', updateData.tripStartLocation.coordinates);
      }
    }

    if (updateData.tripDestination && updateData.tripDestination.coordinates) {
      console.log('Original tripDestination coordinates:', updateData.tripDestination.coordinates);
      if (typeof updateData.tripDestination.coordinates === 'object' &&
        updateData.tripDestination.coordinates.lat !== undefined &&
        updateData.tripDestination.coordinates.lng !== undefined) {
        // Validate coordinate values
        const lng = parseFloat(updateData.tripDestination.coordinates.lng);
        const lat = parseFloat(updateData.tripDestination.coordinates.lat);

        if (isNaN(lng) || isNaN(lat)) {
          const response = badRequest("Invalid coordinate values: longitude and latitude must be valid numbers");
          return res.status(response.statusCode).json(response);
        }

        if (lng < -180 || lng > 180) {
          const response = badRequest("Longitude must be between -180 and 180 degrees");
          return res.status(response.statusCode).json(response);
        }

        if (lat < -90 || lat > 90) {
          const response = badRequest("Latitude must be between -90 and 90 degrees");
          return res.status(response.statusCode).json(response);
        }

        // Convert from {lat, lng} to [lng, lat] format (GeoJSON standard)
        updateData.tripDestination.coordinates = [lng, lat];
        console.log('Converted tripDestination coordinates:', updateData.tripDestination.coordinates);
      }
    }

    console.log('Final updateData for validation:', JSON.stringify(updateData, null, 2));

    // Use the converted data directly (no validation needed since we're doing manual conversion)
    const value = updateData;

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

    // Validate vehicle ownership if vehicle is being updated
    if (value.vehicle) {
      const vehicleValidation = await validateVehicleOwnership(value.vehicle, userId);
      if (!vehicleValidation.isValid) {
        const response = badRequest(vehicleValidation.error);
        return res.status(response.statusCode).json(response);
      }
    }

    // Validate driver assignment if driver is being updated
    if (value.driver) {
      const driverValidation = await validateDriverAssignment(value.driver, userId, value.selfDrive);
      if (!driverValidation.isValid) {
        const response = badRequest(driverValidation.error);
        return res.status(response.statusCode).json(response);
      }

      // Check driver availability for the trip period
      const tripStartDate = value.tripStartDate ? new Date(value.tripStartDate) : new Date(trip.tripStartDate);
      const tripEndDate = value.tripEndDate ? new Date(value.tripEndDate) : new Date(trip.tripEndDate);

      const availabilityCheck = await checkDriverAvailability(value.driver, tripStartDate, tripEndDate, tripId);
      if (!availabilityCheck.isAvailable) {
        const response = conflict(availabilityCheck.error);
        return res.status(response.statusCode).json(response);
      }
    }

    // Validate goods type if being updated
    if (value.goodsType) {
      const goodsAccepted = require("../db/models/goods_accepted");
      const goodsType = await goodsAccepted.findById(value.goodsType);
      if (!goodsType) {
        const response = badRequest("Goods type not found");
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
      .populate('tripAddedBy', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
      .populate('goodsType', 'name description')
      .populate('status', 'name description');

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
    if (trip.tripAddedBy.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if trip can be deleted
    if (['684942f5ff32840ef8e726f1', '684942f5ff32840ef8e726ef'].includes(trip.status)) {
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

    // Build filter - all users can see all trip statistics
    const filter = { isActive: true };

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

/**
 * Update trip status
 * @route PUT /api/v1/trips/:tripId/status
 */
exports.updateTripStatus = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.user_id;

    // Validate request
    const { error, value } = tripSchemas.updateStatus.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
      const response = badRequest('Validation failed', errors);
      return res.status(response.statusCode).json(response);
    }

    // Validate user
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized('User not found or inactive');
      return res.status(response.statusCode).json(response);
    }

    // Fetch trip
    const trip = await trips.findById(tripId);
    if (!trip) {
      const response = notFound('Trip not found');
      return res.status(response.statusCode).json(response);
    }

    // Permission: creator or assigned driver can update status
    const userType = await require("../db/models/user_types").findById(user.user_type);
    const isCreator = trip.tripAddedBy?.toString() === userId;
    const isAssignedDriver = trip.driver?.toString() === userId;
    if (!(isCreator || isAssignedDriver || userType.name === 'admin')) {
      const response = forbidden('Access denied');
      return res.status(response.statusCode).json(response);
    }

    // Validate status exists in trip_status collection
    const TripStatus = require('../db/models/trip_status');
    const statusDoc = await TripStatus.findById(value.status);
    if (!statusDoc) {
      const response = badRequest('Invalid status: not found in trip_status');
      return res.status(response.statusCode).json(response);
    }

    const updateData = {
      status: value.status,
      updatedAt: new Date(),
    };

    // Set timestamps based on status name
    if (statusDoc.name === 'started') {
      updateData.actualStartTime = new Date();
      updateData.isStarted = true;
    }
    if (statusDoc.name === 'completed') {
      updateData.actualEndTime = new Date();
    }

    if (value.notes) {
      updateData.statusNotes = value.notes;
    }

    const updatedTrip = await trips
      .findByIdAndUpdate(tripId, updateData, { new: true })
      .populate('tripAddedBy', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
      .populate('goodsType', 'name description')
      .populate('status', 'name description');

    const response = updated({ trip: updatedTrip }, 'Trip status updated successfully');
    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error('Update trip status error:', error);
    const response = serverError('Failed to update trip status');
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get trips created by the current user ("my trips")
 * Optional: include trips where user is assigned as driver via includeAssigned=true
 * Supports pagination and basic filters similar to getAllTrips
 * @route GET /api/v1/trips/my
 */
exports.getMyTrips = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const {
      page = 1,
      limit = 10,
      status,
      search,
      dateFrom,
      dateTo,
      includeAssigned
    } = req.query;
    const skip = (page - 1) * limit;

    // Validate user
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Build filter for current user's trips
    const filter = { isActive: true };

    if (includeAssigned === 'true') {
      filter.$or = [
        { tripAddedBy: userId },
        { driver: userId }
      ];
    } else {
      filter.tripAddedBy = userId;
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = (filter.$or || []).concat([
        { 'tripStartLocation.address': { $regex: search, $options: 'i' } },
        { 'tripDestination.address': { $regex: search, $options: 'i' } }
      ]);
    }

    if (dateFrom || dateTo) {
      filter.tripStartDate = {};
      if (dateFrom) filter.tripStartDate.$gte = new Date(dateFrom);
      if (dateTo) filter.tripStartDate.$lte = new Date(dateTo);
    }

    const tripsData = await trips.find(filter)
      .populate('tripAddedBy', 'name email phone')
      .populate('driver', 'name email phone')
      .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
      .populate('goodsType', 'name description')
      .populate('status', 'name description')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await trips.countDocuments(filter);

    const response = success(
      tripsData,
      "My trips retrieved successfully",
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
    console.error("Get my trips error:", error);
    const response = serverError("Failed to retrieve my trips");
    return res.status(response.statusCode).json(response);
  }
};
