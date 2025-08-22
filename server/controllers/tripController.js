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

    // Validate coordinates format - now expecting [lng, lat] arrays
    if (!value.tripStartLocation.coordinates || !Array.isArray(value.tripStartLocation.coordinates) || value.tripStartLocation.coordinates.length !== 2) {
      const response = badRequest("Invalid trip start location coordinates. Expected [lng, lat] array");
      return res.status(response.statusCode).json(response);
    }

    if (!value.tripDestination.coordinates || !Array.isArray(value.tripDestination.coordinates) || value.tripDestination.coordinates.length !== 2) {
      const response = badRequest("Invalid trip destination coordinates. Expected [lng, lat] array");
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
        value.tripStartLocation.coordinates, // Already in [lng, lat] format
        value.tripDestination.coordinates   // Already in [lng, lat] format
      ];
    }

    console.log("Final routeGeoJSONCoordinates:", routeGeoJSONCoordinates);

    // ✅ Map viaRoutes safely - now expecting [lng, lat] arrays
    let viaRoutes = [];
    if (Array.isArray(value.viaRoutes) && value.viaRoutes.length > 0) {
      viaRoutes = value.viaRoutes.map(via => ({
        address: via.address,
        coordinates: via.coordinates // Already in [lng, lat] format - matches locationSchema
      }));
    }

    const tripData = {
      title: value.title,
      description: value.description,
      tripAddedBy: userId, // The user creating the trip
      tripStartLocation: {
        address: value.tripStartLocation.address,
        coordinates: value.tripStartLocation.coordinates, // Already in [lng, lat] format
      },
      tripDestination: {
        address: value.tripDestination.address,
        coordinates: value.tripDestination.coordinates, // Already in [lng, lat] format
      },
      viaRoutes: viaRoutes,
      goodsType: value.goodsType,
      weight: value.weight,
      tripStartDate: tripStartDate,
      tripEndDate: tripEndDate,
      isActive: true,
      currentLocation: {
        type: "Point",
        coordinates: value.tripStartLocation.coordinates // Already in [lng, lat] format - matches locationSchema
      },
      routeGeoJSON: {
        type: "LineString",
        coordinates: routeGeoJSONCoordinates
      },
      vehicle: value.vehicle,
      driver: value.driver,
      selfDrive: value.selfDrive,
      // Add optional fields if provided
      ...(value.distance && { distance: value.distance }),
      ...(value.duration && { duration: value.duration })
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
 * Enhanced with robust geospatial search capabilities
 * 
 * @route GET /api/v1/trips
 * 
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10)
 * - status: Trip status filter
 * - search: Text search in address fields
 * - dateFrom: Start date filter (ISO string)
 * - dateTo: End date filter (ISO string)
 * - pickupLocation: "lng,lat" or [lng, lat] - search for trips near pickup point
 * - dropoffLocation: "lng,lat" or [lng, lat] - search for trips near dropoff point
 * - currentLocation: "lng,lat" or [lng, lat] - search for trips near current location
 * - searchRadius/radius: Search radius in meters (default: 5000)
 * - pickupDropoffBoth: "true"|"false" - if true, require proximity to BOTH pickup and dropoff
 * 
 * Geospatial Search Behavior:
 * - Single point search: Returns trips where ANY of these are within radius:
 *   * tripStartLocation.coordinates
 *   * tripDestination.coordinates  
 *   * any viaRoutes.coordinates
 *   * routeGeoJSON intersects circle
 * - Dual point search (pickup + dropoff):
 *   * If pickupDropoffBoth="true": Requires proximity to BOTH points
 *   * If pickupDropoffBoth="false" or omitted: Requires proximity to pickup, optional to dropoff
 * 
 * Example API Calls:
 * 
 * 1. Find trips near a pickup point:
 *    GET /api/v1/trips?pickupLocation=76.2999,9.9785&searchRadius=5000
 * 
 * 2. Find trips near both pickup and dropoff (require both):
 *    GET /api/v1/trips?pickupLocation=76.2999,9.9785&dropoffLocation=76.9488,8.4875&pickupDropoffBoth=true&searchRadius=5000
 * 
 * 3. Find trips near current location:
 *    GET /api/v1/trips?currentLocation=76.4000,9.8000&radius=3000
 * 
 * 4. Combine with other filters:
 *    GET /api/v1/trips?pickupLocation=76.2999,9.9785&status=684942f5ff32840ef8e726f0&search=Kochi&dateFrom=2025-01-01&searchRadius=10000
 * 
 * Performance Notes:
 * - Uses 2dsphere indexes on all coordinate fields
 * - Avoids $near in $or branches for better index utilization
 * - Uses $geoWithin with $centerSphere for Point fields
 * - Uses $geoIntersects with circle polygon for LineString routeGeoJSON
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
    // Note: This is kept for potential future use but not currently used in the main query
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

    /**
     * Helper to build an approximate circle polygon around a point
     * Used for $geoIntersects queries on LineString routeGeoJSON
     * 
     * @param {number} lng - Longitude of center point
     * @param {number} lat - Latitude of center point  
     * @param {number} radiusMeters - Radius in meters
     * @param {number} steps - Number of polygon vertices (default: 64)
     * @returns {Object} GeoJSON Polygon approximating a circle
     */
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

    /**
     * Build unified $or geospatial filters for a given center point
     * Creates an $or array that matches trips where ANY of these are within radius:
     * - routeGeoJSON intersects circle polygon
     * - tripStartLocation.coordinates within circle
     * - tripDestination.coordinates within circle  
     * - any viaRoutes.coordinates within circle
     * 
     * @param {number} lng - Longitude of center point
     * @param {number} lat - Latitude of center point
     * @param {number} radiusMeters - Search radius in meters
     * @returns {Array} Array of geospatial filter objects for $or query
     */
    const buildGeoOrFilters = (lng, lat, radiusMeters) => {
      const earthRadius = 6371000; // meters
      const radiusRadians = radiusMeters / earthRadius;
      const circlePolygon = makeCirclePolygon(lng, lat, radiusMeters);
      return [
        // 1) Route intersects the circle polygon
        { routeGeoJSON: { $geoIntersects: { $geometry: circlePolygon } } },
        // 2) Start within radius
        { "tripStartLocation.coordinates": { $geoWithin: { $centerSphere: [[lng, lat], radiusRadians] } } },
        // 3) Destination within radius
        { "tripDestination.coordinates": { $geoWithin: { $centerSphere: [[lng, lat], radiusRadians] } } },
        // 4) Any viaRoute within radius
        { "viaRoutes.coordinates": { $geoWithin: { $centerSphere: [[lng, lat], radiusRadians] } } }
      ];
    };

    // Parse coordinates from query parameters with robust validation
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

    /**
     * Helper function to parse and validate coordinates from various input formats
     * Supports both string format ("lng,lat") and array format ([lng, lat])
     * 
     * @param {string|Array} coordInput - Coordinate input in "lng,lat" or [lng, lat] format
     * @param {string} paramName - Name of the parameter for error messages
     * @returns {Object|null} Object with {lng, lat} properties or null if invalid
     */
    const parseCoordinates = (coordInput, paramName) => {
      try {
        let lng, lat;
        
        if (Array.isArray(coordInput)) {
          if (coordInput.length !== 2) {
            throw new Error(`Invalid ${paramName}: expected array with 2 elements [lng, lat]`);
          }
          [lng, lat] = coordInput;
        } else if (typeof coordInput === 'string') {
          const coords = coordInput.split(',').map(coord => parseFloat(coord.trim()));
          if (coords.length !== 2 || coords.some(isNaN)) {
            throw new Error(`Invalid ${paramName}: expected "lng,lat" format`);
          }
          [lng, lat] = coords;
        } else {
          throw new Error(`Invalid ${paramName}: expected string or array`);
        }

        // Validate coordinate ranges
        if (lng < -180 || lng > 180) {
          throw new Error(`Invalid ${paramName}: longitude must be between -180 and 180`);
        }
        if (lat < -90 || lat > 90) {
          throw new Error(`Invalid ${paramName}: latitude must be between -90 and 90`);
        }

        return { lng, lat };
      } catch (error) {
        console.error(`Error parsing ${paramName}:`, error.message);
        return null;
      }
    };

    // Parse current location
    if (currentLocation) {
      const coords = parseCoordinates(currentLocation, 'currentLocation');
      if (coords) {
        currentLng = coords.lng;
        currentLat = coords.lat;
        console.log("Current location parsed:", { currentLng, currentLat });
      }
    }

    // Parse pickup location
    if (pickupLocation) {
      const coords = parseCoordinates(pickupLocation, 'pickupLocation');
      if (coords) {
        pickupLng = coords.lng;
        pickupLat = coords.lat;
        console.log("Pickup location parsed:", { pickupLng, pickupLat });
      }
    }

    // Parse dropoff location
    if (dropoffLocation) {
      const coords = parseCoordinates(dropoffLocation, 'dropoffLocation');
      if (coords) {
        dropoffLng = coords.lng;
        dropoffLat = coords.lat;
        console.log("Dropoff location parsed:", { dropoffLng, dropoffLat });
      }
    }

    // Enhanced geospatial filtering with support for pickupDropoffBoth
    let tripsData = [];
    let total = 0;

    /**
     * Helper function to build the final query with proper population
     * Applies consistent population, sorting, pagination across all queries
     * 
     * @param {Object} queryFilter - MongoDB filter object
     * @returns {Promise} Mongoose query promise
     */
    const buildQueryWithPopulation = (queryFilter) => {
      return trips
        .find(queryFilter)
        .populate('tripAddedBy', 'name email phone')
        .populate('driver', 'name email phone')
        .populate('vehicle', 'vehicleNumber vehicleType vehicleBodyType')
        .populate('goodsType', 'name description')
        .populate('status', 'name description')
        .sort({ _id: -1 })
        .skip(skip)
        .limit(parseInt(limit));
    };

    /**
     * Helper function to get total count for pagination
     * 
     * @param {Object} queryFilter - MongoDB filter object
     * @returns {Promise<number>} Promise resolving to total count
     */
    const getTotalCount = (queryFilter) => {
      return trips.countDocuments(queryFilter);
    };

    if (pickupLat && pickupLng) {
      const pickupOrFilters = buildGeoOrFilters(pickupLng, pickupLat, searchRadius);
      
      if (dropoffLat && dropoffLng) {
        // Both pickup and dropoff provided
        console.log("Finding trips near both pickup and dropoff points:", { 
          pickup: { pickupLng, pickupLat }, 
          dropoff: { dropoffLng, dropoffLat } 
        });
        
        const dropoffOrFilters = buildGeoOrFilters(dropoffLng, dropoffLat, searchRadius);
        
        // Check if pickupDropoffBoth is true (require proximity to BOTH points)
        if (pickupDropoffBoth === 'true') {
          console.log("Requiring proximity to BOTH pickup and dropoff points");
          const finalFilter = {
            $and: [
              filter,
              { $or: pickupOrFilters },
              { $or: dropoffOrFilters }
            ]
          };
          
          tripsData = await buildQueryWithPopulation(finalFilter);
          total = await getTotalCount(finalFilter);
        } else {
          // Default behavior: require proximity to pickup, optional proximity to dropoff
          console.log("Requiring proximity to pickup, optional proximity to dropoff");
          
          // First get trips near pickup
          const pickupFilter = {
            $and: [filter, { $or: pickupOrFilters }]
          };
          
          const pickupTrips = await buildQueryWithPopulation(pickupFilter);
          console.log(`Found ${pickupTrips.length} trips near pickup point`);
          
          // Then filter those that are also near dropoff
          const dropoffFilter = {
            $and: [filter, { $or: pickupOrFilters }, { $or: dropoffOrFilters }]
          };
          
          tripsData = await buildQueryWithPopulation(dropoffFilter);
          total = await getTotalCount(dropoffFilter);
          
          console.log(`After dropoff filtering: ${tripsData.length} trips`);
        }
      } else {
        // Only pickup provided
        console.log("Finding trips near pickup point:", { pickupLng, pickupLat });
        const finalFilter = {
          $and: [filter, { $or: pickupOrFilters }]
        };
        
        tripsData = await buildQueryWithPopulation(finalFilter);
        total = await getTotalCount(finalFilter);
      }
    } else if (dropoffLat && dropoffLng) {
      // Only dropoff provided
      console.log("Finding trips near dropoff point:", { dropoffLng, dropoffLat });
      const dropoffOrFilters = buildGeoOrFilters(dropoffLng, dropoffLat, searchRadius);
      const finalFilter = {
        $and: [filter, { $or: dropoffOrFilters }]
      };
      
      tripsData = await buildQueryWithPopulation(finalFilter);
      total = await getTotalCount(finalFilter);
    } else if (currentLat && currentLng) {
      // Current location filtering
      console.log("Finding trips near current location:", { currentLng, currentLat });
      const currentOrFilters = buildGeoOrFilters(currentLng, currentLat, searchRadius);
      const finalFilter = {
        $and: [filter, { $or: currentOrFilters }]
      };
      
      tripsData = await buildQueryWithPopulation(finalFilter);
      total = await getTotalCount(finalFilter);
    } else {
      // No location filtering - use standard approach
      console.log("No location filtering - using standard query");
      tripsData = await buildQueryWithPopulation(filter);
      total = await getTotalCount(filter);
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

    // Validate and process update data
    let updateData = { ...req.body };

    // Validate coordinates format if provided - now expecting [lng, lat] arrays
    if (updateData.tripStartLocation && updateData.tripStartLocation.coordinates) {
      if (!Array.isArray(updateData.tripStartLocation.coordinates) || updateData.tripStartLocation.coordinates.length !== 2) {
        const response = badRequest("Invalid trip start location coordinates. Expected [lng, lat] array");
        return res.status(response.statusCode).json(response);
      }
      
      // Validate coordinate values
      const [lng, lat] = updateData.tripStartLocation.coordinates;
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
    }

    if (updateData.tripDestination && updateData.tripDestination.coordinates) {
      if (!Array.isArray(updateData.tripDestination.coordinates) || updateData.tripDestination.coordinates.length !== 2) {
        const response = badRequest("Invalid trip destination coordinates. Expected [lng, lat] array");
        return res.status(response.statusCode).json(response);
      }
      
      // Validate coordinate values
      const [lng, lat] = updateData.tripDestination.coordinates;
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
    }

    // Validate viaRoutes if provided
    if (updateData.viaRoutes && Array.isArray(updateData.viaRoutes)) {
      for (const via of updateData.viaRoutes) {
        if (!via.address || !Array.isArray(via.coordinates) || via.coordinates.length !== 2) {
          const response = badRequest("Invalid via route. Each via route must have address and coordinates as [lng, lat] array");
          return res.status(response.statusCode).json(response);
        }
        
        const [lng, lat] = via.coordinates;
        if (isNaN(lng) || isNaN(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
          const response = badRequest("Invalid via route coordinates. Longitude must be between -180 and 180, latitude between -90 and 90");
          return res.status(response.statusCode).json(response);
        }
      }
    }

    console.log('Final updateData for validation:', JSON.stringify(updateData, null, 2));

    // Use the validated data
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
