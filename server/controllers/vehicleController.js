/**
 * Vehicle Management Controller
 * Handles vehicle registration, management, and operations
 */

const { Types } = require("mongoose");

// Models
const vehicles = require("../db/models/vehicles");
const users = require("../db/models/users");
const vehicle_types = require("../db/models/vehicle_types");
const vehicle_body_types = require("../db/models/vehicle_body_types");
const images = require("../db/models/images");
const Documents = require("../db/models/documents");

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
  serverError,
} = require("../utils/response-handler");

// Validation schemas
const { vehicleSchemas } = require("../validations/schemas");

/**
 * Check if user has a driving license
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - True if user has driving license
 */
const userHasDrivingLicense = async (userId) => {
  try {
    const user = await users.findById(userId).select('drivingLicense');
    return user && user.drivingLicense;
  } catch (error) {
    console.error('Error checking driving license:', error);
    return false;
  }
};

/**
 * Create a new vehicle
 * @route POST /api/v1/vehicles
 */
exports.createVehicle = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Validate request data
    const { error, value } = vehicleSchemas.createVehicle.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
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

    // Check if user is a driver
    const userType = await require("../db/models/user_types").findById(
      user.user_type
    );
    if (userType.name !== "driver") {
      const response = forbidden("Only drivers can register vehicles");
      return res.status(response.statusCode).json(response);
    }

    // Check if vehicle number already exists (unique across all vehicles)
    // Drivers can register multiple vehicles, but vehicle numbers must be unique
    const vehicleNumberExists = await vehicles.findOne({
      vehicleNumber: value.vehicleNumber.toUpperCase(),
      isActive: true,
    });
    console.log("vehicleNumberExists : ", vehicleNumberExists);
    if (vehicleNumberExists) {
      const response = conflict("Vehicle number already registered");
      return res.status(response.statusCode).json(response);
    }



    // Validate vehicle type and body type
    const vehicleType = await vehicle_types.findById(value.vehicleType);
    if (!vehicleType) {
      const response = badRequest("Invalid vehicle type");
      return res.status(response.statusCode).json(response);
    }

    const vehicleBodyType = await vehicle_body_types.findById(
      value.vehicleBodyType
    );
    if (!vehicleBodyType) {
      const response = badRequest("Invalid vehicle body type");
      return res.status(response.statusCode).json(response);
    }

    // Validate goods accepted type (if provided)
    if (value.goodsAccepted) {
      const goodsAccepted = require("../db/models/goods_accepted");
      const goodsAcceptedType = await goodsAccepted.findById(value.goodsAccepted);
      if (!goodsAcceptedType) {
        const response = badRequest("Invalid goods accepted type");
        return res.status(response.statusCode).json(response);
      }
    }

    // Validate document and image references
    const validImageIds = await validateImageReferences(value.truckImages, userId);
    const validDocumentIds = await validateDocumentReferences([
      value.registrationCertificate,
    ], userId);

    if (!validImageIds.isValid || !validDocumentIds.isValid) {
      const response = badRequest("Invalid image or document references", {
        images: validImageIds.errors,
        documents: validDocumentIds.errors,
      });
      return res.status(response.statusCode).json(response);
    }

    // Check if this is the user's first vehicle registration
    const existingVehicles = await vehicles.find({ user: userId, isActive: true });
    const isFirstVehicle = existingVehicles.length === 0;

    // Validate drivingLicense based on whether this is the first vehicle
    if (isFirstVehicle) {
      // For first vehicle, drivingLicense is required
      if (!value.drivingLicense) {
        const response = badRequest("Driving license is required for your first vehicle registration");
        return res.status(response.statusCode).json(response);
      }

      // Validate that the drivingLicense document exists and is uploaded by the same user
      const validDrivingLicense = await validateDocumentReference(value.drivingLicense, userId);
      if (!validDrivingLicense.isValid) {
        const response = badRequest("Invalid driving license reference", {
          drivingLicense: validDrivingLicense.errors,
        });
        return res.status(response.statusCode).json(response);
      }

      // Update user's drivingLicense field
      await users.findByIdAndUpdate(userId, { drivingLicense: value.drivingLicense });
    } else {
      // For subsequent vehicles, drivingLicense is optional
      if (value.drivingLicense) {
        const validDrivingLicense = await validateDocumentReference(value.drivingLicense, userId);
        if (!validDrivingLicense.isValid) {
          const response = badRequest("Invalid driving license reference", {
            drivingLicense: validDrivingLicense.errors,
          });
          return res.status(response.statusCode).json(response);
        }
      }
    }

    // Check if terms and conditions are accepted
    if (!value.termsAndConditionsAccepted) {
      const response = badRequest("You must accept the terms and conditions to register a vehicle");
      return res.status(response.statusCode).json(response);
    }

    // Create vehicle with enhanced data
    const vehicleData = {
      user: userId,
      vehicleNumber: value.vehicleNumber.toUpperCase(),
      vehicleType: value.vehicleType,
      vehicleBodyType: value.vehicleBodyType,
      vehicleCapacity: value.vehicleCapacity,
      termsAndConditionsAccepted: value.termsAndConditionsAccepted,
      registrationCertificate: value.registrationCertificate,
      truckImages: value.truckImages,
      isActive: true,
      isVerified: false,
      isAvailable: true,
    };

    // Add goodsAccepted only if provided
    if (value.goodsAccepted) {
      vehicleData.goodsAccepted = value.goodsAccepted;
    }

    // Add drivingLicense to vehicle documents if provided (for subsequent vehicles)
    if (!isFirstVehicle && value.drivingLicense) {
      if (!vehicleData.documents) {
        vehicleData.documents = [];
      }
      vehicleData.documents.push(value.drivingLicense);
    }

    const newVehicle = await vehicles.create(vehicleData);

    // Populate vehicle data for response
    const populatedVehicle = await vehicles
      .findById(newVehicle._id)
      .populate("user", "name email phone")
      .populate("vehicleType", "name")
      .populate("vehicleBodyType", "name")
      .populate("registrationCertificate", "url filename")
      .populate("truckImages", "url filename")
      .populate("documents", "url filename");

    const response = created(
      { vehicle: populatedVehicle },
      "Vehicle registered successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Create vehicle error:", error);
    const response = serverError("Failed to register vehicle");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get user's driving license information
 * @route GET /api/v1/vehicles/driving-license
 */
exports.getUserDrivingLicense = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Check if user is a driver
    const userType = await require("../db/models/user_types").findById(
      user.user_type
    );
    if (userType.name !== "driver") {
      const response = forbidden("Only drivers can access driving license information");
      return res.status(response.statusCode).json(response);
    }

    // Get user with populated driving license
    const userWithLicense = await users
      .findById(userId)
      .populate("drivingLicense", "url filename uploadedAt");

    const hasDrivingLicense = !!userWithLicense.drivingLicense;

    const response = success(
      {
        hasDrivingLicense,
        drivingLicense: hasDrivingLicense ? userWithLicense.drivingLicense : null,
      },
      "Driving license information retrieved successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get user driving license error:", error);
    const response = serverError("Failed to retrieve driving license information");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get all vehicle types
 * @route GET /api/v1/vehicles/types
 */
exports.getAllVehicleTypes = async (req, res) => {
  try {
    const types = await vehicle_types
      .find({ status: "active" })
      .select("name description icon status");
    const response = success(types, "Vehicle types retrieved successfully");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get all vehicle types error:", error);
    const response = serverError("Failed to retrieve vehicle types");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get all goods accepted types
 * @route GET /api/v1/vehicles/goods-accepted
 */
exports.getAllGoodsAccepted = async (req, res) => {
  try {
    const goodsAccepted = require("../db/models/goods_accepted");
    const types = await goodsAccepted
      .find({ status: "active" })
      .select("name description status");
    const response = success(types, "Goods accepted types retrieved successfully");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get all goods accepted error:", error);
    const response = serverError("Failed to retrieve goods accepted types");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get all vehicle body types
 * @route GET /api/v1/vehicles/body-types
 */
exports.getAllVehicleBodyTypes = async (req, res) => {
  try {
    const types = await vehicle_body_types
      .find({ status: "active" })
      .select("name description status");
    const response = success(types, "Vehicle body types retrieved successfully");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get all vehicle body types error:", error);
    const response = serverError("Failed to retrieve vehicle body types");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get all vehicles with pagination and filtering
 * @route GET /api/v1/vehicles
 */
exports.getAllVehicles = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const userRole = req.userRole;
    
    const {
      page = 1,
      limit = 10,
      vehicleType,
      bodyType,
      status,
      available,
      search,
    } = req.query;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = { isActive: true };

    // Role-based filtering
    if (userRole === "customer") {
      // Customers can only see verified and available vehicles
      filter.isVerified = true;
      filter.isAvailable = true;
    } else if (userRole === "driver") {
      // Drivers can see all vehicles but with limited data
      // They can see their own vehicles with full data
      filter.$or = [
        { user: userId }, // Own vehicles
        { isVerified: true, isAvailable: true } // Other verified available vehicles
      ];
    }
    // Admins can see all vehicles (no additional filtering)

    if (vehicleType) {
      filter.vehicleType = vehicleType;
    }

    if (bodyType) {
      filter.vehicleBodyType = bodyType;
    }

    if (status && userRole !== "customer") {
      filter.isVerified = status === "verified";
    }

    if (available !== undefined && userRole !== "customer") {
      filter.isAvailable = available === "true";
    }

    if (search) {
      filter.$or = [
        { vehicleNumber: { $regex: search, $options: "i" } },
        { "user.name": { $regex: search, $options: "i" } },
      ];
    }

    // Determine what data to populate based on user role
    let populateOptions = [
      "vehicleType",
      "vehicleBodyType"
    ];

    if (userRole === "admin") {
      // Admins get full data
      populateOptions.push(
        { path: "user", select: "name email phone" },
        "registrationCertificate",
        "truckImages",
        "documents"
      );
    } else if (userRole === "driver") {
      // Drivers get limited data for other vehicles, full data for their own
      populateOptions.push(
        { path: "user", select: "name" },
        "truckImages"
      );
    } else if (userRole === "customer") {
      // Customers get minimal data
      populateOptions.push(
        { path: "user", select: "name" },
        "truckImages"
      );
    }

    // Get vehicles with pagination
    const vehiclesData = await vehicles
      .find(filter)
      .populate(populateOptions)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Apply additional data filtering based on role
    const filteredVehiclesData = vehiclesData.map(vehicle => {
      const vehicleObj = vehicle.toObject();
      
      if (userRole === "driver") {
        // If it's not the driver's own vehicle, limit sensitive data
        if (vehicle.user._id.toString() !== userId) {
          delete vehicleObj.registrationCertificate;
          delete vehicleObj.documents;
          delete vehicleObj.user.email;
          delete vehicleObj.user.phone;
        }
      } else if (userRole === "customer") {
        // Customers get minimal data
        delete vehicleObj.registrationCertificate;
        delete vehicleObj.documents;
        delete vehicleObj.user.email;
        delete vehicleObj.user.phone;
      }
      
      return vehicleObj;
    });

    // Get total count
    const total = await vehicles.countDocuments(filter);

    const response = success(
      filteredVehiclesData,
      "Vehicles retrieved successfully",
      200,
      {
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      }
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get all vehicles error:", error);
    const response = serverError("Failed to retrieve vehicles");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get specific vehicle by ID
 * @route GET /api/v1/vehicles/:vehicleId
 */
exports.getVehicleById = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get vehicle with populated data
    const vehicle = await vehicles
      .findById(vehicleId)
      .populate("user", "name email phone")
      .populate("vehicleType", "name")
      .populate("vehicleBodyType", "name")
      .populate("registrationCertificate", "url filename")
      .populate("truckImages", "url filename")
      .populate("documents", "url filename");

    if (!vehicle) {
      const response = notFound("Vehicle not found");
      return res.status(response.statusCode).json(response);
    }

    // Check access permissions
    const userType = await require("../db/models/user_types").findById(
      user.user_type
    );
    if (userType.name === "driver" && vehicle.user._id.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    const response = success({ vehicle }, "Vehicle retrieved successfully");

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get vehicle by ID error:", error);
    const response = serverError("Failed to retrieve vehicle");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Update vehicle information
 * @route PUT /api/v1/vehicles/:vehicleId
 */
exports.updateVehicle = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const userId = req.user.user_id;

    // Validate request data
    const { error, value } = vehicleSchemas.updateVehicle.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
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

    // Get vehicle
    const vehicle = await vehicles.findById(vehicleId);
    if (!vehicle) {
      const response = notFound("Vehicle not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can update this vehicle
    const userType = await require("../db/models/user_types").findById(
      user.user_type
    );
    if (userType.name === "driver" && vehicle.user.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if vehicle number is being changed and if it's already taken
    if (
      value.vehicleNumber &&
      value.vehicleNumber.toUpperCase() !== vehicle.vehicleNumber
    ) {
      const vehicleNumberExists = await vehicles.findOne({
        vehicleNumber: value.vehicleNumber.toUpperCase(),
        isActive: true,
        _id: { $ne: vehicleId },
      });

      if (vehicleNumberExists) {
        const response = conflict("Vehicle number already registered");
        return res.status(response.statusCode).json(response);
      }

      value.vehicleNumber = value.vehicleNumber.toUpperCase();
    }

    // Validate vehicle type and body type if being updated
    if (value.vehicleType) {
      const vehicleType = await vehicle_types.findById(value.vehicleType);
      if (!vehicleType) {
        const response = badRequest("Invalid vehicle type");
        return res.status(response.statusCode).json(response);
      }
    }

    if (value.vehicleBodyType) {
      const vehicleBodyType = await vehicle_body_types.findById(
        value.vehicleBodyType
      );
      if (!vehicleBodyType) {
        const response = badRequest("Invalid vehicle body type");
        return res.status(response.statusCode).json(response);
      }
    }

    // Validate goods accepted type if being updated
    if (value.goodsAccepted) {
      const goodsAccepted = require("../db/models/goods_accepted");
      const goodsAcceptedType = await goodsAccepted.findById(value.goodsAccepted);
      if (!goodsAcceptedType) {
        const response = badRequest("Invalid goods accepted type");
        return res.status(response.statusCode).json(response);
      }
    }

    // Validate and process truckImages if being updated
    if (value.truckImages !== undefined) {
      // Validate image references
      const validImageIds = await validateImageReferences(value.truckImages, userId);
      if (!validImageIds.isValid) {
        const response = badRequest(
          "Invalid image references",
          validImageIds.errors
        );
        return res.status(response.statusCode).json(response);
      }

      // Use helper function for comprehensive validation
      const currentTruckImages = vehicle.truckImages || [];
      const validationResult = validateTruckImagesOperation(currentTruckImages, value.truckImages);
      
      if (!validationResult.isValid) {
        const response = badRequest(
          "Truck images validation failed",
          validationResult.errors
        );
        return res.status(response.statusCode).json(response);
      }

      // Log operation details for debugging
      console.log('Truck images operation:', {
        vehicleId,
        currentCount: currentTruckImages.length,
        newCount: value.truckImages.length,
        toAdd: validationResult.operation.toAdd.length,
        toRemove: validationResult.operation.toRemove.length
      });
    }

    if (value.registrationCertificate) {
      const validDocumentIds = await validateDocumentReferences([
        value.registrationCertificate,
      ], userId);
      if (!validDocumentIds.isValid) {
        const response = badRequest(
          "Invalid document references",
          validDocumentIds.errors
        );
        return res.status(response.statusCode).json(response);
      }
    }

    // Validate drivingLicense if provided
    if (value.drivingLicense) {
      const validDrivingLicense = await validateDocumentReference(value.drivingLicense, userId);
      if (!validDrivingLicense.isValid) {
        const response = badRequest("Invalid driving license reference", {
          drivingLicense: validDrivingLicense.errors,
        });
        return res.status(response.statusCode).json(response);
      }

      // Update user's drivingLicense field
      await users.findByIdAndUpdate(userId, { drivingLicense: value.drivingLicense });
    }

    // Update vehicle
    try {
      const updatedVehicle = await vehicles
        .findByIdAndUpdate(
          vehicleId,
          {
            ...value,
            updatedAt: new Date(),
          },
          { new: true }
        )
        .populate("user", "name email phone")
        .populate("vehicleType", "name")
        .populate("vehicleBodyType", "name")
        .populate("registrationCertificate", "url filename")
        .populate("truckImages", "url filename")
        .populate("documents", "url filename");

      const response = updated(
        { vehicle: updatedVehicle },
        "Vehicle updated successfully"
      );

      return res.status(response.statusCode).json(response);
    } catch (error) {
      if (error.message === 'At least 4 truck images are required') {
        const response = badRequest("At least 4 truck images are required in the database");
        return res.status(response.statusCode).json(response);
      }
      throw error; // Re-throw other errors to be caught by the outer catch block
    }
  } catch (error) {
    console.error("Update vehicle error:", error);
    const response = serverError("Failed to update vehicle");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Update vehicle availability status
 * @route PUT /api/v1/vehicles/:vehicleId/availability
 */
exports.updateVehicleAvailability = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { isAvailable } = req.body;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get vehicle
    const vehicle = await vehicles.findById(vehicleId);
    if (!vehicle) {
      const response = notFound("Vehicle not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can update this vehicle
    const userType = await require("../db/models/user_types").findById(
      user.user_type
    );
    if (userType.name === "driver" && vehicle.user.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Update availability
    const updatedVehicle = await vehicles
      .findByIdAndUpdate(
        vehicleId,
        {
          isAvailable: isAvailable,
          updatedAt: new Date(),
        },
        { new: true }
      )
      .populate("user", "name email phone")
      .populate("vehicleType", "name")
      .populate("vehicleBodyType", "name");

    const response = updated(
      { vehicle: updatedVehicle },
      "Vehicle availability updated successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Update vehicle availability error:", error);
    const response = serverError("Failed to update vehicle availability");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Verify vehicle (admin only)
 * @route PUT /api/v1/vehicles/:vehicleId/verify
 */
exports.verifyVehicle = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { isVerified, verificationNotes } = req.body;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Check if user is admin
    const userType = await require("../db/models/user_types").findById(
      user.user_type
    );
    if (userType.name !== "admin") {
      const response = forbidden("Only admins can verify vehicles");
      return res.status(response.statusCode).json(response);
    }

    // Get vehicle
    const vehicle = await vehicles.findById(vehicleId);
    if (!vehicle) {
      const response = notFound("Vehicle not found");
      return res.status(response.statusCode).json(response);
    }

    // Update verification status
    const updatedVehicle = await vehicles
      .findByIdAndUpdate(
        vehicleId,
        {
          isVerified: isVerified,
          verificationNotes: verificationNotes,
          verifiedAt: new Date(),
          verifiedBy: userId,
          updatedAt: new Date(),
        },
        { new: true }
      )
      .populate("user", "name email phone")
      .populate("vehicleType", "name")
      .populate("vehicleBodyType", "name");

    const response = updated(
      { vehicle: updatedVehicle },
      "Vehicle verification status updated successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Verify vehicle error:", error);
    const response = serverError("Failed to verify vehicle");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Delete vehicle (soft delete)
 * @route DELETE /api/v1/vehicles/:vehicleId
 */
exports.deleteVehicle = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get vehicle
    const vehicle = await vehicles.findById(vehicleId);
    if (!vehicle) {
      const response = notFound("Vehicle not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can delete this vehicle
    const userType = await require("../db/models/user_types").findById(
      user.user_type
    );
    if (userType.name === "driver" && vehicle.user.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if vehicle has active bookings
    const activeBookings = await require("../db/models/bookings").find({
      vehicle: vehicleId,
      status: { $in: ["confirmed", "in_progress"] },
    });

    if (activeBookings.length > 0) {
      const response = badRequest("Cannot delete vehicle with active bookings");
      return res.status(response.statusCode).json(response);
    }

    // Soft delete vehicle
    await vehicles.findByIdAndUpdate(vehicleId, {
      isActive: false,
      deletedAt: new Date(),
      deletedBy: userId,
      updatedAt: new Date(),
    });

    const response = deleted("Vehicle deleted successfully");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Delete vehicle error:", error);
    const response = serverError("Failed to delete vehicle");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get vehicle statistics
 * @route GET /api/v1/vehicles/stats
 */
exports.getVehicleStats = async (req, res) => {
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
    const userType = await require("../db/models/user_types").findById(
      user.user_type
    );

    if (userType.name === "driver") {
      filter.user = userId;
    }
    // Admin can see all stats

    // Get statistics
    const stats = await vehicles.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          verified: { $sum: { $cond: ["$isVerified", 1, 0] } },
          unverified: { $sum: { $cond: ["$isVerified", 0, 1] } },
          available: { $sum: { $cond: ["$isAvailable", 1, 0] } },
          unavailable: { $sum: { $cond: ["$isAvailable", 0, 1] } },
          avgCapacity: { $avg: "$vehicleCapacity" },
        },
      },
    ]);

    const response = success(
      { stats: stats[0] || {} },
      "Vehicle statistics retrieved successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get vehicle stats error:", error);
    const response = serverError("Failed to retrieve vehicle statistics");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get vehicle truck images count and details
 * @route GET /api/v1/vehicles/:vehicleId/truck-images
 */
exports.getVehicleTruckImages = async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get vehicle
    const vehicle = await vehicles.findById(vehicleId)
      .populate("truckImages", "url filename")
      .select("truckImages user");

    if (!vehicle) {
      const response = notFound("Vehicle not found");
      return res.status(response.statusCode).json(response);
    }

    // Check access permissions
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === "driver" && vehicle.user.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    const truckImagesCount = vehicle.truckImages ? vehicle.truckImages.length : 0;
    const isMinimumMet = truckImagesCount >= 4;

    const response = success({
      vehicleId,
      truckImagesCount,
      isMinimumMet,
      minimumRequired: 4,
      truckImages: vehicle.truckImages || [],
      canAddMore: true,
      canRemove: truckImagesCount > 4
    }, "Vehicle truck images retrieved successfully");

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get vehicle truck images error:", error);
    const response = serverError("Failed to retrieve vehicle truck images");
    return res.status(response.statusCode).json(response);
  }
};

// Helper functions
const validateImageReference = async (imageId, userId) => {
  try {
    if (!Types.ObjectId.isValid(imageId)) {
      return { isValid: false, errors: ["Invalid image ID format"] };
    }

    const image = await images.findById(imageId);
    if (!image) {
      return { isValid: false, errors: ["Image not found"] };
    }

    // Check if the image was uploaded by the same user
    if (!image.uploadedBy || image.uploadedBy.toString() !== userId) {
      return { isValid: false, errors: ["Image does not belong to you"] };
    }

    return { isValid: true, errors: [] };
  } catch (error) {
    console.error('Image validation error:', error);
    return { isValid: false, errors: ["Image validation failed"] };
  }
};

const validateImageReferences = async (imageIds, userId) => {
  const errors = [];

  for (const imageId of imageIds) {
    if (imageId) {
      const result = await validateImageReference(imageId, userId);
      if (!result.isValid) {
        errors.push(...result.errors);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
};

/**
 * Helper function to validate truck images operations
 * @param {Array} currentImages - Current truck images in database
 * @param {Array} newImages - New truck images array
 * @returns {Object} Validation result
 */
const validateTruckImagesOperation = (currentImages, newImages) => {
  const errors = [];
  
  // Check minimum requirement
  if (newImages.length < 4) {
    errors.push(`At least 4 truck images are required. Current count: ${newImages.length}`);
  }
  
  // Check for duplicates
  const uniqueImages = [...new Set(newImages)];
  if (uniqueImages.length !== newImages.length) {
    errors.push("Truck images array contains duplicate image IDs");
  }
  
  // Check if removing too many images
  const currentImageIds = currentImages.map(img => img.toString());
  const imagesToRemove = currentImageIds.filter(img => !newImages.includes(img));
  const imagesToAdd = newImages.filter(img => !currentImageIds.includes(img));
  
  if (imagesToRemove.length > 0) {
    const remainingAfterRemoval = newImages.length;
    if (remainingAfterRemoval < 4) {
      errors.push(`Cannot remove ${imagesToRemove.length} images. At least 4 truck images must remain. Current: ${remainingAfterRemoval}`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    operation: {
      toAdd: imagesToAdd,
      toRemove: imagesToRemove,
      totalAfterOperation: newImages.length
    }
  };
};

const validateDocumentReference = async (documentId, userId) => {
  try {
    if (!Types.ObjectId.isValid(documentId)) {
      return { isValid: false, errors: ["Invalid document ID format"] };
    }

    const document = await Documents.findById(documentId);
    if (!document) {
      return { isValid: false, errors: ["Document not found"] };
    }

    // Check if the document was uploaded by the same user
    if (document.uploadedBy && document.uploadedBy.toString() !== userId) {
      return { isValid: false, errors: ["Document does not belong to you"] };
    }

    return { isValid: true, errors: [] };
  } catch (error) {
    console.error('Document validation error:', error);
    return { isValid: false, errors: ["Document validation failed"] };
  }
};

const validateDocumentReferences = async (documentIds, userId) => {
  const errors = [];

  for (const documentId of documentIds) {
    if (documentId) {
      const result = await validateDocumentReference(documentId, userId);
      if (!result.isValid) {
        errors.push(...result.errors);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
};
