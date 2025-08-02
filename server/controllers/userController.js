/**
 * User Management Controller
 * Handles user registration, profile management, and user operations
 */

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Types } = require("mongoose");

// Models
const users = require("../db/models/users");
const user_types = require("../db/models/user_types");
const vehicles = require("../db/models/vehicles");
const images = require("../db/models/images");
const Documents = require("../db/models/documents");
const OTP = require("../db/models/otp");

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
const { sendSMS } = require("../utils/sms");

// Validation schemas
const { userSchemas } = require("../validations/schemas");

// Constants
const TOKEN_EXPIRY = "10d";
const DRIVER_USER_TYPE_ID = "68484d1eefb856d41ac28c56";
const CUSTOMER_USER_TYPE_ID = "68484d1eefb856d41ac28c57";

/**
 * Register Driver with complete profile and vehicle information
 * @route POST /api/v1/users/register-driver
 */
exports.registerDriver = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      const response = unauthorized("Access token required");
      return res.status(response.statusCode).json(response);
    }

    // Verify token and extract OTP record ID
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.PRIVATE_KEY);
    } catch (jwtError) {
      const response = unauthorized("Invalid or expired token");
      return res.status(response.statusCode).json(response);
    }

    if (decoded.type !== "phone_verified_registration") {
      const response = unauthorized(
        "Invalid token type. Please verify your phone number first."
      );
      return res.status(response.statusCode).json(response);
    }

    // Find OTP record to get phone number
    const otpRecord = await OTP.findById(decoded.id);
    if (!otpRecord) {
      const response = badRequest(
        "Phone verification required. Please request OTP again."
      );
      return res.status(response.statusCode).json(response);
    }

    const phone = otpRecord.phone;
    const documents = req.body.documents || [];

    // Validate request data
    const { error, value } = userSchemas.registerDriver.validate(req.body, {
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

    // Check if user already exists
    const existingUser = await users.findOne({
      $or: [{ email: value.email.toLowerCase() }, { phone }],
    });

    if (existingUser) {
      const response = conflict(
        "User already exists with this email or phone number"
      );
      return res.status(response.statusCode).json(response);
    }

    // Validate document and image references
    // Note: For registration, we'll validate that files exist but not ownership since user doesn't exist yet
    const validImageIds = await validateImageReferences([
      value.profilePicture,
      ...value.truckImages,
    ], null); // null for registration since user doesn't exist yet
    const validDocumentIds = await validateDocumentReferences([
      value.drivingLicense,
      value.registrationCertificate,
    ], null); // null for registration since user doesn't exist yet

    if (!validImageIds.isValid || !validDocumentIds.isValid) {
      const response = badRequest("Invalid image or document references", {
        images: validImageIds.errors,
        documents: validDocumentIds.errors,
      });
      return res.status(response.statusCode).json(response);
    }

    // Normalize vehicle number
    const normalizeVehicleNumber = (vehicleNumber) => {
      return vehicleNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    };

    const vehicleNumber = normalizeVehicleNumber(value.vehicleNumber);

    // Check if vehicle number already exists
    const existingVehicle = await vehicles.findOne({ vehicleNumber });
    if (existingVehicle) {
      const response = conflict("Vehicle number already registered");
      return res.status(response.statusCode).json(response);
    }

    // Create user with enhanced data
    const userData = {
      name: value.name,
      phone,
      whatsappNumber: value.whatsappNumber,
      email: value.email.toLowerCase(),
      user_type: DRIVER_USER_TYPE_ID,
      drivingLicense: value.drivingLicense,
      profilePicture: value.profilePicture,
      termsAndConditionsAccepted: value.termsAndConditionsAccepted,
      privacyPolicyAccepted: value.privacyPolicyAccepted,
      isActive: true,
      isPhoneVerified: true,
      isEmailVerified: false,
      lastLogin: new Date(),
    };

    const newUser = await users.create(userData);

    // Create vehicle with enhanced data
    const vehicleData = {
      user: newUser._id,
      vehicleNumber,
      vehicleType: value.vehicleType,
      vehicleBodyType: value.vehicleBodyType,
      vehicleCapacity: value.vehicleCapacity,
      goodsAccepted: value.goodsAccepted,
      registrationCertificate: value.registrationCertificate,
      truckImages: value.truckImages,
      isActive: true,
      isVerified: false,
    };

    const newVehicle = await vehicles.create(vehicleData);

    // Clean up OTP record
    await OTP.findByIdAndDelete(otpRecord._id);

    // Generate access token
    const accessToken = jwt.sign(
      {
        user_id: newUser._id,
        user_type: "driver",
        email: newUser.email,
      },
      process.env.PRIVATE_KEY,
      { expiresIn: TOKEN_EXPIRY }
    );

    // Populate user data for response
    const populatedUser = await users
      .findById(newUser._id)
      .populate("user_type", "name")
      .populate("profilePicture", "url")
      .select("-password");

    const response = created(
      {
        user: populatedUser,
        vehicle: newVehicle,
        accessToken,
      },
      "Driver registered successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Driver registration error:", error);
    const response = serverError("Driver registration failed");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Register Customer with basic profile information
 * @route POST /api/v1/users/register-customer
 */
exports.registerProfile = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      const response = unauthorized("Access token required");
      return res.status(response.statusCode).json(response);
    }

    // Verify token and extract OTP record ID
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.PRIVATE_KEY);
    } catch (jwtError) {
      const response = unauthorized("Invalid or expired token");
      return res.status(response.statusCode).json(response);
    }

    if (decoded.type !== "phone_verified_registration") {
      const response = unauthorized(
        "Invalid token type. Please verify your phone number first."
      );
      return res.status(response.statusCode).json(response);
    }

    // Find OTP record to get phone number
    const otpRecord = await OTP.findById(decoded.id);
    if (!otpRecord) {
      const response = badRequest(
        "Phone verification required. Please request OTP again."
      );
      return res.status(response.statusCode).json(response);
    }

    const phone = otpRecord.phone;

    // Validate request data
    const { error, value } = userSchemas.registerProfile.validate(req.body, {
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

    // Validate whatsappNumber: must be a valid phone
    const phonePattern = /^\+?[1-9]\d{7,14}$/;
    if (!value.whatsappNumber || !phonePattern.test(value.whatsappNumber)) {
      const response = badRequest("Invalid WhatsApp number format");
      return res.status(response.statusCode).json(response);
    }

    // Check if user already exists (by email, phone, or whatsappNumber)
    const existingUser = await users.findOne({
      $or: [
        { email: value.email.toLowerCase() },
        { phone },
        { whatsappNumber: value.whatsappNumber },
      ],
    });

    if (existingUser) {
      let conflictField = "email or phone number";
      if (existingUser.whatsappNumber === value.whatsappNumber) {
        conflictField = "WhatsApp number";
      }
      const response = conflict(
        `User already exists with this ${conflictField}`
      );
      return res.status(response.statusCode).json(response);
    }

    // Validate profile picture if provided
    if (value.profilePicture) {
      // Validate if it's a proper MongoDB ObjectId
      if (!Types.ObjectId.isValid(value.profilePicture)) {
        const response = badRequest("Invalid profile picture ID format");
        return res.status(response.statusCode).json(response);
      }
      // Validate image exists
      const image = await images.findById(value.profilePicture);
      if (!image) {
        const response = badRequest("Profile picture image not found");
        return res.status(response.statusCode).json(response);
      }
      // Validate image.phone matches registration phone (for unregistered users)
      if (image.phone && image.phone !== phone) {
        const response = forbidden(
          "Profile picture was not uploaded by this phone number"
        );
        return res.status(response.statusCode).json(response);
      }
    }

    // Make user_type required and validate as ObjectId and existence
    if (!value.user_type) {
      const response = badRequest("user_type is required");
      return res.status(response.statusCode).json(response);
    }
    if (!Types.ObjectId.isValid(value.user_type)) {
      const response = badRequest("Invalid user_type ID format");
      return res.status(response.statusCode).json(response);
    }
    const userTypeExists = await user_types.findById(value.user_type);
    if (!userTypeExists) {
      const response = badRequest("user_type does not exist");
      return res.status(response.statusCode).json(response);
    }
    // Block registration if user_type is admin (by name or by known admin ObjectId)
    const ADMIN_USER_TYPE_ID = "68484d1eefb856d41ac28c54";
    if (
      (userTypeExists.name && userTypeExists.name.toLowerCase() === "admin") ||
      value.user_type === ADMIN_USER_TYPE_ID
    ) {
      const response = forbidden("Registration as admin is not allowed");
      return res.status(response.statusCode).json(response);
    }

    const userData = {
      name: value.name,
      phone,
      whatsappNumber: value.whatsappNumber,
      email: value.email.toLowerCase(),
      user_type: new Types.ObjectId(value.user_type), // Must be a valid ObjectId from frontend
      profilePicture: value.profilePicture,
      termsAndConditionsAccepted: true,
      privacyPolicyAccepted: true,
      isActive: true,
      isPhoneVerified: true,
      isEmailVerified: false,
      lastLogin: new Date(),
    };

    const newUser = await users.create(userData);

    // If profilePicture is provided, update image record with uploadedBy
    if (value.profilePicture) {
      await images.findByIdAndUpdate(value.profilePicture, {
        uploadedBy: newUser._id,
        phone: undefined, // clear phone association
        otpId: undefined, // clear otpId association
        updatedAt: new Date(),
      });
    }

    // Clean up OTP record
    await OTP.findByIdAndDelete(otpRecord._id);

    // Generate access token
    const accessToken = jwt.sign(
      {
        user_id: newUser._id,
        user_type: "customer",
        email: newUser.email,
      },
      process.env.PRIVATE_KEY,
      { expiresIn: TOKEN_EXPIRY }
    );

    // Populate user data for response
    const populatedUser = await users
      .findById(newUser._id)
      .populate("user_type", "name")
      .populate("profilePicture", "url")
      .select("-password");

    const response = created(
      {
        user: populatedUser,
        accessToken,
      },
      "Registration successful"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Customer registration error:", error);
    const response = serverError("Customer registration failed");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get user profile with complete information
 * @route GET /api/v1/users/profile
 */
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const user = await users
      .findById(userId)
      .populate("user_type", "name")
      .populate("profilePicture", "url filename")
      .select("-password");

    if (!user) {
      const response = notFound("User not found");
      return res.status(response.statusCode).json(response);
    }

    // Get additional data based on user type
    let additionalData = {};

    if (user.user_type.name === "driver") {
      const vehicle = await vehicles
        .findOne({ user: userId })
        .populate("vehicleType", "name")
        .populate("vehicleBodyType", "name")
        .populate("registrationCertificate", "url filename")
        .populate("truckImages", "url filename");

      additionalData.vehicle = vehicle;
    }

    const response = success(
      {
        user,
        ...additionalData,
      },
      "Profile retrieved successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get profile error:", error);
    const response = serverError("Failed to retrieve profile");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Update user profile information
 * @route PUT /api/v1/users/profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Validate request data
    const { error, value } = userSchemas.updateProfile.validate(req.body, {
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

    // Check if user exists
    const existingUser = await users.findById(userId);
    if (!existingUser) {
      const response = notFound("User not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if email is being changed and if it's already taken
    if (value.email && value.email.toLowerCase() !== existingUser.email) {
      const emailExists = await users.findOne({
        email: value.email.toLowerCase(),
        _id: { $ne: userId },
      });

      if (emailExists) {
        const response = conflict("Email already in use");
        return res.status(response.statusCode).json(response);
      }

      value.email = value.email.toLowerCase();
      value.isEmailVerified = false; // Reset email verification
    }

    // Check if WhatsApp number is being changed and if it's already taken
    if (value.whatsappNumber && value.whatsappNumber !== existingUser.whatsappNumber) {
      const whatsappNumberExists = await users.findOne({
        whatsappNumber: value.whatsappNumber,
        _id: { $ne: userId },
      });

      if (whatsappNumberExists) {
        const response = conflict("WhatsApp number already in use");
        return res.status(response.statusCode).json(response);
      }
    }

    // Validate profile picture if being updated
    if (value.profilePicture) {
      const validImage = await validateImageReference(value.profilePicture);
      if (!validImage.isValid) {
        const response = badRequest(
          "Invalid profile picture reference",
          validImage.errors
        );
        return res.status(response.statusCode).json(response);
      }
    }

    // Update user
    const updatedUser = await users
      .findByIdAndUpdate(
        userId,
        {
          ...value,
          updatedAt: new Date(),
        },
        { new: true }
      )
      .populate("user_type", "name")
      .populate("profilePicture", "url filename")
      .select("-password");

    const response = updated(
      { user: updatedUser },
      "Profile updated successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Update profile error:", error);
    const response = serverError("Failed to update profile");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Update user type (admin only)
 * @route PUT /api/v1/users/:userId/user-type
 */
exports.updateUserType = async (req, res) => {
  try {
    const { userId } = req.params;
    const { userType } = req.body;

    // Validate request data
    const { error, value } = userSchemas.updateUserType.validate(req.body, {
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

    // Check if user exists
    const user = await users.findById(userId);
    if (!user) {
      const response = notFound("User not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user type exists
    const userTypeExists = await user_types.findById(value.userType);
    if (!userTypeExists) {
      const response = badRequest("Invalid user type");
      return res.status(response.statusCode).json(response);
    }

    // Update user type
    const updatedUser = await users
      .findByIdAndUpdate(
        userId,
        {
          user_type: value.userType,
          updatedAt: new Date(),
        },
        { new: true }
      )
      .populate("user_type", "name")
      .select("-password");

    const response = updated(
      { user: updatedUser },
      "User type updated successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Update user type error:", error);
    const response = serverError("Failed to update user type");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Update user status (active/inactive) (admin only)
 * @route PUT /api/v1/users/:userId/status
 */
exports.updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body; // expecting { status: 'active' } or { status: 'inactive' }

    // Validate status value
    if (!["active", "inactive"].includes(status)) {
      const response = badRequest("Status must be 'active' or 'inactive'");
      return res.status(response.statusCode).json(response);
    }

    // Check if user exists
    const user = await users.findById(userId);
    if (!user) {
      const response = notFound("User not found");
      return res.status(response.statusCode).json(response);
    }

    // Update status
    user.isActive = status === "active";
    user.updatedAt = new Date();
    await user.save();

    const updatedUser = await users
      .findById(userId)
      .populate("user_type", "name")
      .populate("profilePicture", "url filename")
      .select("-password");

    const response = updated(
      { user: updatedUser },
      `User status updated to ${status}`
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Update user status error:", error);
    const response = serverError("Failed to update user status");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get all users with pagination and filtering
 * @route GET /api/v1/users
 */
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, userType, status, search } = req.query;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};

    if (userType) {
      filter.user_type = userType;
    }

    if (status) {
      filter.isActive = status === "active";
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    // Get users with pagination
    const users = await users
      .find(filter)
      .populate("user_type", "name")
      .populate("profilePicture", "url")
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await users.countDocuments(filter);

    const response = success(users, "Users retrieved successfully", 200, {
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get all users error:", error);
    const response = serverError("Failed to retrieve users");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Delete user account
 * @route DELETE /api/v1/users/profile
 */
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Check if user exists
    const user = await users.findById(userId);
    if (!user) {
      const response = notFound("User not found");
      return res.status(response.statusCode).json(response);
    }

    // Soft delete - mark as inactive
    await users.findByIdAndUpdate(userId, {
      isActive: false,
      deletedAt: new Date(),
      updatedAt: new Date(),
    });

    const response = deleted("Account deleted successfully");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Delete account error:", error);
    const response = serverError("Failed to delete account");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get specific user by ID (admin only)
 * @route GET /api/v1/users/:userId
 */
exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await users
      .findById(userId)
      .populate("user_type", "name")
      .populate("profilePicture", "url filename")
      .select("-password");

    if (!user) {
      const response = notFound("User not found");
      return res.status(response.statusCode).json(response);
    }

    // Get additional data based on user type
    let additionalData = {};
    if (user.user_type && user.user_type.name === "driver") {
      const vehicle = await vehicles
        .findOne({ user: userId })
        .populate("vehicleType", "name")
        .populate("vehicleBodyType", "name")
        .populate("registrationCertificate", "url filename")
        .populate("truckImages", "url filename");
      additionalData.vehicle = vehicle;
    }

    const response = success(
      { user, ...additionalData },
      "User retrieved successfully"
    );
    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get user by ID error:", error);
    const response = serverError("Failed to retrieve user");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Hard delete user (admin only)
 * @route DELETE /api/v1/users/:userId
 */
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await users.findById(userId);
    if (!user) {
      const response = notFound("User not found");
      return res.status(response.statusCode).json(response);
    }

    // Hard delete user
    await users.findByIdAndDelete(userId);

    const response = deleted("User deleted successfully");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Delete user error:", error);
    const response = serverError("Failed to delete user");
    return res.status(response.statusCode).json(response);
  }
};

// Helper functions
const validateImageReference = async (imageId, userId = null) => {
  try {
    if (!Types.ObjectId.isValid(imageId)) {
      return { isValid: false, errors: ["Invalid image ID format"] };
    }

    const image = await images.findById(imageId);
    if (!image) {
      return { isValid: false, errors: ["Image not found"] };
    }

    // Check ownership only if userId is provided (not for registration)
    if (userId && image.uploadedBy && image.uploadedBy.toString() !== userId) {
      return { isValid: false, errors: ["Image does not belong to you"] };
    }

    return { isValid: true, errors: [] };
  } catch (error) {
    return { isValid: false, errors: ["Image validation failed"] };
  }
};

const validateImageReferences = async (imageIds, userId = null) => {
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

const validateDocumentReference = async (documentId, userId = null) => {
  try {
    if (!Types.ObjectId.isValid(documentId)) {
      return { isValid: false, errors: ["Invalid document ID format"] };
    }
    
    const document = await Documents.findById(documentId);
    if (!document) {
      return { isValid: false, errors: ["Document not found"] };
    }

    // Check ownership only if userId is provided (not for registration)
    if (userId && document.uploadedBy && document.uploadedBy.toString() !== userId) {
      return { isValid: false, errors: ["Document does not belong to you"] };
    }

    return { isValid: true, errors: [] };
  } catch (error) {
    return { isValid: false, errors: ["Document validation failed"] };
  }
};

const validateDocumentReferences = async (documentIds, userId = null) => {
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
