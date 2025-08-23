const locations = require("../db/models/locations");
const { success, serverError, badRequest } = require("../utils/response-handler");

/**
 * Get all locations with comprehensive search and filtering capabilities
 * 
 * @route GET /api/v1/locations
 * 
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 * - search: Text search across multiple fields (officeName, district, stateName, pincode, etc.)
 * - stateName: Filter by state name
 * - district: Filter by district name
 * - officeType: Filter by office type (BO, HO, SO, etc.)
 * - pincode: Filter by pincode
 * - circleName: Filter by circle name
 * - regionName: Filter by region name
 * - divisionName: Filter by division name
 * - delivery: Filter by delivery type
 * - nearLocation: "lng,lat" - Find locations near specified coordinates
 * - radius: Search radius in meters for nearLocation (default: 5000)
 * - sortBy: Sort field (officeName, district, stateName, pincode, createdAt)
 * - sortOrder: Sort order (asc, desc, default: asc)
 * 
 * Search Features:
 * - Text search across officeName, district, stateName, pincode, circleName, regionName, divisionName
 * - Geospatial search for locations near specified coordinates
 * - Multiple filter combinations
 * - Pagination and sorting
 * 
 * Example API Calls:
 * 
 * 1. Basic search:
 *    GET /api/v1/locations?search=Kochi
 * 
 * 2. Filter by state and search:
 *    GET /api/v1/locations?stateName=KERALA&search=Ernakulam
 * 
 * 3. Find locations near coordinates:
 *    GET /api/v1/locations?nearLocation=76.2999,9.9785&radius=10000
 * 
 * 4. Filter by office type:
 *    GET /api/v1/locations?officeType=HO&stateName=KERALA
 * 
 * 5. Search by pincode:
 *    GET /api/v1/locations?pincode=682001
 * 
 * 6. Combined search with pagination:
 *    GET /api/v1/locations?search=Airport&stateName=KERALA&officeType=BO&page=1&limit=20
 * 
 * Performance Notes:
 * - Uses text indexes on all searchable fields
 * - Uses geospatial index for location-based queries
 * - Individual and compound indexes for optimal performance
 * - Pagination limits to prevent memory issues
 */
exports.getAllLocations = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      stateName,
      district,
      officeType,
      pincode,
      circleName,
      regionName,
      divisionName,
      delivery,
      nearLocation,
      radius = 5000,
      sortBy = "officeName",
      sortOrder = "asc"
    } = req.query;

    // Validate pagination parameters
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100); // Max 100 items per page
    const skip = (pageNum - 1) * limitNum;

    if (pageNum < 1 || limitNum < 1) {
      const response = badRequest("Invalid pagination parameters");
      return res.status(response.statusCode).json(response);
    }

    // Build filter object
    const filter = { isActive: true };

    // Text search across multiple fields
    if (search) {
      filter.$or = [
        { officeName: { $regex: search, $options: 'i' } },
        { district: { $regex: search, $options: 'i' } },
        { stateName: { $regex: search, $options: 'i' } },
        { pincode: { $regex: search, $options: 'i' } },
        { circleName: { $regex: search, $options: 'i' } },
        { regionName: { $regex: search, $options: 'i' } },
        { divisionName: { $regex: search, $options: 'i' } }
      ];
    }

    // Individual field filters
    if (stateName) {
      filter.stateName = { $regex: stateName, $options: 'i' };
    }

    if (district) {
      filter.district = { $regex: district, $options: 'i' };
    }

    if (officeType) {
      filter.officeType = { $regex: officeType, $options: 'i' };
    }

    if (pincode) {
      filter.pincode = { $regex: pincode, $options: 'i' };
    }

    if (circleName) {
      filter.circleName = { $regex: circleName, $options: 'i' };
    }

    if (regionName) {
      filter.regionName = { $regex: regionName, $options: 'i' };
    }

    if (divisionName) {
      filter.divisionName = { $regex: divisionName, $options: 'i' };
    }

    if (delivery) {
      filter.delivery = { $regex: delivery, $options: 'i' };
    }

    // Geospatial search
    if (nearLocation) {
      try {
        const [lng, lat] = nearLocation.split(',').map(coord => parseFloat(coord.trim()));
        
        if (isNaN(lng) || isNaN(lat) || 
            lng < -180 || lng > 180 || 
            lat < -90 || lat > 90) {
          const response = badRequest("Invalid coordinates format. Use 'longitude,latitude'");
          return res.status(response.statusCode).json(response);
        }

        const radiusInMeters = parseFloat(radius);
        if (isNaN(radiusInMeters) || radiusInMeters <= 0) {
          const response = badRequest("Invalid radius. Must be a positive number");
          return res.status(response.statusCode).json(response);
        }

        // Convert radius to radians for MongoDB geospatial queries
        const earthRadius = 6371000; // meters
        const radiusInRadians = radiusInMeters / earthRadius;

        filter.coordinates = {
          $geoWithin: {
            $centerSphere: [[lng, lat], radiusInRadians]
          }
        };

      } catch (error) {
        const response = badRequest("Invalid nearLocation format. Use 'longitude,latitude'");
        return res.status(response.statusCode).json(response);
      }
    }

    // Build sort object
    const sortOptions = {
      officeName: 1,
      district: 1,
      stateName: 1,
      pincode: 1,
      createdAt: 1
    };

    if (sortOptions.hasOwnProperty(sortBy)) {
      const sortDirection = sortOrder.toLowerCase() === 'desc' ? -1 : 1;
      sortOptions[sortBy] = sortDirection;
    }

    // Execute query with pagination
    const locationsData = await locations
      .find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count for pagination
    const total = await locations.countDocuments(filter);

    // Calculate pagination info
    const totalPages = Math.ceil(total / limitNum);
    const hasNext = pageNum < totalPages;
    const hasPrev = pageNum > 1;

    const response = success(
      locationsData,
      "Locations retrieved successfully",
      200,
      {
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNext,
          hasPrev
        },
        filters: {
          search: search || null,
          stateName: stateName || null,
          district: district || null,
          officeType: officeType || null,
          pincode: pincode || null,
          nearLocation: nearLocation || null,
          radius: nearLocation ? parseFloat(radius) : null
        }
      }
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get locations error:", error);
    const response = serverError("Failed to retrieve locations");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get location statistics and metadata
 * 
 * @route GET /api/v1/locations/stats
 * 
 * Returns:
 * - Total locations count
 * - States count and list
 * - Districts count and list
 * - Office types count and list
 * - Circle names count and list
 * - Sample locations from different states
 */
exports.getLocationStats = async (req, res) => {
  try {
    console.log("📊 Getting location statistics...");

    // Get basic counts
    const totalLocations = await locations.countDocuments({ isActive: true });

    // Get distinct values
    const states = await locations.distinct("stateName");
    const districts = await locations.distinct("district");
    const officeTypes = await locations.distinct("officeType");
    const circleNames = await locations.distinct("circleName");

    // Get sample locations from different states (max 5)
    const sampleLocations = await locations
      .aggregate([
        { $match: { isActive: true } },
        { $group: { _id: "$stateName", sample: { $first: "$$ROOT" } } },
        { $limit: 5 },
        { $replaceRoot: { newRoot: "$sample" } },
        { $project: { 
          officeName: 1, 
          district: 1, 
          stateName: 1, 
          pincode: 1, 
          officeType: 1,
          coordinates: 1
        }}
      ]);

    // Get state-wise location counts (top 10)
    const stateCounts = await locations
      .aggregate([
        { $match: { isActive: true } },
        { $group: { _id: "$stateName", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { stateName: "$_id", count: 1, _id: 0 } }
      ]);

    // Get office type distribution
    const officeTypeCounts = await locations
      .aggregate([
        { $match: { isActive: true } },
        { $group: { _id: "$officeType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $project: { officeType: "$_id", count: 1, _id: 0 } }
      ]);

    const stats = {
      totalLocations,
      states: {
        count: states.length,
        list: states.sort()
      },
      districts: {
        count: districts.length,
        list: districts.sort()
      },
      officeTypes: {
        count: officeTypes.length,
        list: officeTypes.sort()
      },
      circleNames: {
        count: circleNames.length,
        list: circleNames.sort()
      },
      sampleLocations,
      stateCounts,
      officeTypeCounts
    };

    const response = success(
      stats,
      "Location statistics retrieved successfully",
      200
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get location stats error:", error);
    const response = serverError("Failed to retrieve location statistics");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get a single location by ID
 * 
 * @route GET /api/v1/locations/:id
 */
exports.getLocationById = async (req, res) => {
  try {
    const { id } = req.params;

    const location = await locations.findById(id);

    if (!location || !location.isActive) {
      const response = badRequest("Location not found");
      return res.status(response.statusCode).json(response);
    }

    const response = success(
      location,
      "Location retrieved successfully",
      200
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get location by ID error:", error);
    const response = serverError("Failed to retrieve location");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get locations by state name
 * 
 * @route GET /api/v1/locations/state/:stateName
 */
exports.getLocationsByState = async (req, res) => {
  try {
    const { stateName } = req.params;
    const { page = 1, limit = 20, search, officeType } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const skip = (pageNum - 1) * limitNum;

    const filter = { 
      isActive: true,
      stateName: { $regex: stateName, $options: 'i' }
    };

    if (search) {
      filter.$or = [
        { officeName: { $regex: search, $options: 'i' } },
        { district: { $regex: search, $options: 'i' } },
        { pincode: { $regex: search, $options: 'i' } }
      ];
    }

    if (officeType) {
      filter.officeType = { $regex: officeType, $options: 'i' };
    }

    const locationsData = await locations
      .find(filter)
      .sort({ officeName: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await locations.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);

    const response = success(
      locationsData,
      `Locations in ${stateName} retrieved successfully`,
      200,
      {
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1
        }
      }
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get locations by state error:", error);
    const response = serverError("Failed to retrieve locations by state");
    return res.status(response.statusCode).json(response);
  }
};
