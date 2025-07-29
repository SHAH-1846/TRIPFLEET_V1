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
  serverError 
} = require("../utils/response-handler");

// Validation schemas
const { vehicleSchemas } = require("../validations/schemas");

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

    // Check if user is a driver
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name !== 'driver') {
      const response = forbidden("Only drivers can register vehicles");
      return res.status(response.statusCode).json(response);
    }

    // Check if user already has a vehicle
    const existingVehicle = await vehicles.findOne({ user: userId, isActive: true });
    if (existingVehicle) {
      const response = conflict("Driver already has a registered vehicle");
      return res.status(response.statusCode).json(response);
    }

    // Check if vehicle number already exists
    const vehicleNumberExists = await vehicles.findOne({ 
      vehicleNumber: value.vehicleNumber.toUpperCase(),
      isActive: true
    });
    if (vehicleNumberExists) {
      const response = conflict("Vehicle number already registered");
      return res.status(response.statusCode).json(response);
    }

    // Validate document and image references
    const validImageIds = await validateImageReferences(value.truckImages);
    const validDocumentIds = await validateDocumentReferences([value.registrationCertificate]);

    if (!validImageIds.isValid || !validDocumentIds.isValid) {
      const response = badRequest("Invalid image or document references", {
        images: validImageIds.errors,
        documents: validDocumentIds.errors
      });
      return res.status(response.statusCode).json(response);
    }

    // Validate vehicle type and body type
    const vehicleType = await vehicle_types.findById(value.vehicleType);
    if (!vehicleType) {
      const response = badRequest("Invalid vehicle type");
      return res.status(response.statusCode).json(response);
    }

    const vehicleBodyType = await vehicle_body_types.findById(value.vehicleBodyType);
    if (!vehicleBodyType) {
      const response = badRequest("Invalid vehicle body type");
      return res.status(response.statusCode).json(response);
    }

    // Create vehicle with enhanced data
    const vehicleData = {
      user: userId,
      vehicleNumber: value.vehicleNumber.toUpperCase(),
      vehicleType: value.vehicleType,
      vehicleBodyType: value.vehicleBodyType,
      vehicleCapacity: value.vehicleCapacity,
      goodsAccepted: value.goodsAccepted,
      registrationCertificate: value.registrationCertificate,
      truckImages: value.truckImages,
      isActive: true,
      isVerified: false,
      isAvailable: true
    };

    const newVehicle = await vehicles.create(vehicleData);

    // Populate vehicle data for response
    const populatedVehicle = await vehicles.findById(newVehicle._id)
      .populate('user', 'name email phone')
      .populate('vehicleType', 'name')
      .populate('vehicleBodyType', 'name')
      .populate('registrationCertificate', 'url filename')
      .populate('truckImages', 'url filename');

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
 * Get all vehicles with pagination and filtering
 * @route GET /api/v1/vehicles
 */
exports.getAllVehicles = async (req, res) => {
  try {
    const { page = 1, limit = 10, vehicleType, bodyType, status, available, search } = req.query;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = { isActive: true };
    
    if (vehicleType) {
      filter.vehicleType = vehicleType;
    }
    
    if (bodyType) {
      filter.vehicleBodyType = bodyType;
    }
    
    if (status) {
      filter.isVerified = status === 'verified';
    }
    
    if (available !== undefined) {
      filter.isAvailable = available === 'true';
    }
    
    if (search) {
      filter.$or = [
        { vehicleNumber: { $regex: search, $options: 'i' } },
        { 'user.name': { $regex: search, $options: 'i' } }
      ];
    }

    // Get vehicles with pagination
    const vehiclesData = await vehicles.find(filter)
      .populate('user', 'name email phone')
      .populate('vehicleType', 'name')
      .populate('vehicleBodyType', 'name')
      .populate('registrationCertificate', 'url filename')
      .populate('truckImages', 'url filename')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await vehicles.countDocuments(filter);

    const response = success(
      vehiclesData,
      "Vehicles retrieved successfully",
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
    const vehicle = await vehicles.findById(vehicleId)
      .populate('user', 'name email phone')
      .populate('vehicleType', 'name')
      .populate('vehicleBodyType', 'name')
      .populate('registrationCertificate', 'url filename')
      .populate('truckImages', 'url filename');

    if (!vehicle) {
      const response = notFound("Vehicle not found");
      return res.status(response.statusCode).json(response);
    }

    // Check access permissions
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'driver' && vehicle.user._id.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    const response = success(
      { vehicle },
      "Vehicle retrieved successfully"
    );

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

    // Get vehicle
    const vehicle = await vehicles.findById(vehicleId);
    if (!vehicle) {
      const response = notFound("Vehicle not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can update this vehicle
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'driver' && vehicle.user.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if vehicle number is being changed and if it's already taken
    if (value.vehicleNumber && value.vehicleNumber.toUpperCase() !== vehicle.vehicleNumber) {
      const vehicleNumberExists = await vehicles.findOne({ 
        vehicleNumber: value.vehicleNumber.toUpperCase(),
        isActive: true,
        _id: { $ne: vehicleId }
      });
      
      if (vehicleNumberExists) {
        const response = conflict("Vehicle number already registered");
        return res.status(response.statusCode).json(response);
      }
      
      value.vehicleNumber = value.vehicleNumber.toUpperCase();
    }

    // Validate references if being updated
    if (value.truckImages) {
      const validImageIds = await validateImageReferences(value.truckImages);
      if (!validImageIds.isValid) {
        const response = badRequest("Invalid image references", validImageIds.errors);
        return res.status(response.statusCode).json(response);
      }
    }

    if (value.registrationCertificate) {
      const validDocumentIds = await validateDocumentReferences([value.registrationCertificate]);
      if (!validDocumentIds.isValid) {
        const response = badRequest("Invalid document references", validDocumentIds.errors);
        return res.status(response.statusCode).json(response);
      }
    }

    // Update vehicle
    const updatedVehicle = await vehicles.findByIdAndUpdate(
      vehicleId,
      { 
        ...value,
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('user', 'name email phone')
    .populate('vehicleType', 'name')
    .populate('vehicleBodyType', 'name')
    .populate('registrationCertificate', 'url filename')
    .populate('truckImages', 'url filename');

    const response = updated(
      { vehicle: updatedVehicle },
      "Vehicle updated successfully"
    );

    return res.status(response.statusCode).json(response);

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
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'driver' && vehicle.user.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Update availability
    const updatedVehicle = await vehicles.findByIdAndUpdate(
      vehicleId,
      { 
        isAvailable: isAvailable,
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('user', 'name email phone')
    .populate('vehicleType', 'name')
    .populate('vehicleBodyType', 'name');

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
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name !== 'admin') {
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
    const updatedVehicle = await vehicles.findByIdAndUpdate(
      vehicleId,
      { 
        isVerified: isVerified,
        verificationNotes: verificationNotes,
        verifiedAt: new Date(),
        verifiedBy: userId,
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('user', 'name email phone')
    .populate('vehicleType', 'name')
    .populate('vehicleBodyType', 'name');

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
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'driver' && vehicle.user.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if vehicle has active bookings
    const activeBookings = await require("../db/models/bookings").find({ 
      vehicle: vehicleId, 
      status: { $in: ['confirmed', 'in_progress'] } 
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
      updatedAt: new Date()
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
    const userType = await require("../db/models/user_types").findById(user.user_type);
    
    if (userType.name === 'driver') {
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
          verified: { $sum: { $cond: ['$isVerified', 1, 0] } },
          unverified: { $sum: { $cond: ['$isVerified', 0, 1] } },
          available: { $sum: { $cond: ['$isAvailable', 1, 0] } },
          unavailable: { $sum: { $cond: ['$isAvailable', 0, 1] } },
          avgCapacity: { $avg: '$vehicleCapacity' }
        }
      }
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

// Helper functions
const validateImageReference = async (imageId) => {
  try {
    if (!Types.ObjectId.isValid(imageId)) {
      return { isValid: false, errors: ["Invalid image ID format"] };
    }

    const image = await images.findById(imageId);
    if (!image) {
      return { isValid: false, errors: ["Image not found"] };
    }

    return { isValid: true, errors: [] };
  } catch (error) {
    return { isValid: false, errors: ["Image validation failed"] };
  }
};

const validateImageReferences = async (imageIds) => {
  const errors = [];
  
  for (const imageId of imageIds) {
    if (imageId) {
      const result = await validateImageReference(imageId);
      if (!result.isValid) {
        errors.push(...result.errors);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
};

const validateDocumentReference = async (documentId) => {
  try {
    if (!Types.ObjectId.isValid(documentId)) {
      return { isValid: false, errors: ["Invalid document ID format"] };
    }

    const document = await Documents.findById(documentId);
    if (!document) {
      return { isValid: false, errors: ["Document not found"] };
    }

    return { isValid: true, errors: [] };
  } catch (error) {
    return { isValid: false, errors: ["Document validation failed"] };
  }
};

const validateDocumentReferences = async (documentIds) => {
  const errors = [];
  
  for (const documentId of documentIds) {
    if (documentId) {
      const result = await validateDocumentReference(documentId);
      if (!result.isValid) {
        errors.push(...result.errors);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
};
