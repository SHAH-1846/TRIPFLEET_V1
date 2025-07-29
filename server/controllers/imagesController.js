/**
 * Image Management Controller
 * Handles image upload, management, and operations
 */

const fs = require("fs");
const path = require("path");
const { Types } = require("mongoose");

// Models
const images = require("../db/models/images");

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
const { fileSchemas } = require("../validations/schemas");

/**
 * Upload image
 * @route POST /api/v1/images/upload
 */
exports.uploadImage = async (req, res) => {
  try {
    const tokenType = req.user?.type;
    let userId = req.user?.user_id;
    let phone = req.user?.phone;
    let otpId = req.user?.id;

    if (tokenType === "phone_verified_login") {
      //Registered user : must exist and be active
      const user = await require("../db/models/users").findById(userId);
      if (!user || !user.isActive) {
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        const response = unauthorized("User not found or inactive");
        return res.status(response.statusCode).json(response);
      }
    } else if (tokenType === "phone_verified_registration") {
      // Unregistered user: allow upload, associate with phone/otpId
      userId = null;
      // phone and otpId are available from token
    } else {
      // Invalid or missing token type
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      const response = unauthorized(
        "Invalid or missing authentication context"
      );
      return res.status(response.statusCode).json(response);
    }

    // Check if file exists
    if (!req.file) {
      const response = badRequest("Image file is required");
      return res.status(response.statusCode).json(response);
    }

    // Validate request data
    const { error, value } = fileSchemas.uploadImage.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));
      const response = badRequest("Validation failed", errors);
      return res.status(response.statusCode).json(response);
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(req.file.mimetype)) {
      // Delete uploaded file
      fs.unlinkSync(req.file.path);

      const response = badRequest(
        "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed"
      );
      return res.status(response.statusCode).json(response);
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (req.file.size > maxSize) {
      // Delete uploaded file
      fs.unlinkSync(req.file.path);

      const response = badRequest("File size too large. Maximum size is 10MB");
      return res.status(response.statusCode).json(response);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = path.extname(req.file.originalname);
    const filename = `${timestamp}_${randomString}${fileExtension}`;

    // Create new file path
    const newPath = path.join(path.dirname(req.file.path), filename);

    // Rename file
    fs.renameSync(req.file.path, newPath);

    // Create image record
    const imageData = {
      originalName: req.file.originalname,
      filename: filename,
      url: `/uploads/images/${value.type}/${filename}`,
      filePath: newPath,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      type: value.type,
      category: value.category || "general",
      uploadedBy: userId || undefined,
      phone: !userId && phone ? phone : undefined,
      otpId: !userId && otpId ? otpId : undefined,
      isActive: true,
    };

    const newImage = await images.create(imageData);

    const response = created(
      {
        image: {
          _id: newImage._id,
          originalName: newImage.originalName,
          filename: newImage.filename,
          url: newImage.url,
          fileSize: newImage.fileSize,
          mimeType: newImage.mimeType,
          type: newImage.type,
          category: newImage.category,
          uploadedAt: newImage.createdAt,
        },
      },
      "Image uploaded successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Upload image error:", error);

    // Clean up uploaded file if it exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    const response = serverError("Failed to upload image");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get all images with pagination and filtering
 * @route GET /api/v1/images
 */
exports.getAllImages = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 10, type, category, uploadedBy } = req.query;
    const skip = (page - 1) * limit;

    // Check if user exists and is active
    const user = await require("../db/models/users").findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Build filter object
    const filter = { isActive: true };

    // Filter by user role
    const userType = await require("../db/models/user_types").findById(
      user.user_type
    );
    if (userType.name === "driver" || userType.name === "customer") {
      filter.uploadedBy = userId;
    }
    // Admin can see all images

    if (type) {
      filter.type = type;
    }

    if (category) {
      filter.category = category;
    }

    if (uploadedBy) {
      filter.uploadedBy = uploadedBy;
    }

    // Get images with pagination
    const imagesData = await images
      .find(filter)
      .populate("uploadedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select("-filePath"); // Don't expose file paths

    // Get total count
    const total = await images.countDocuments(filter);

    const response = success(imagesData, "Images retrieved successfully", 200, {
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
    console.error("Get all images error:", error);
    const response = serverError("Failed to retrieve images");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get specific image by ID
 * @route GET /api/v1/images/:imageId
 */
exports.getImageById = async (req, res) => {
  try {
    const { imageId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await require("../db/models/users").findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get image
    const image = await images
      .findById(imageId)
      .populate("uploadedBy", "name email");

    if (!image) {
      const response = notFound("Image not found");
      return res.status(response.statusCode).json(response);
    }

    // Check access permissions
    const userType = await require("../db/models/user_types").findById(
      user.user_type
    );
    if (userType.name === "driver" || userType.name === "customer") {
      if (image.uploadedBy._id.toString() !== userId) {
        const response = forbidden("Access denied");
        return res.status(response.statusCode).json(response);
      }
    }

    // Don't expose file path in response
    const imageData = {
      _id: image._id,
      originalName: image.originalName,
      filename: image.filename,
      url: image.url,
      fileSize: image.fileSize,
      mimeType: image.mimeType,
      type: image.type,
      category: image.category,
      uploadedBy: image.uploadedBy,
      uploadedAt: image.createdAt,
      updatedAt: image.updatedAt,
    };

    const response = success(
      { image: imageData },
      "Image retrieved successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get image by ID error:", error);
    const response = serverError("Failed to retrieve image");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Update image information
 * @route PUT /api/v1/images/:imageId
 */
exports.updateImage = async (req, res) => {
  try {
    const { imageId } = req.params;
    const userId = req.user.user_id;

    // Determine user context from token
    const tokenType = req.user?.type;
    let phone = req.user?.phone;
    let otpId = req.user?.id;

    // Get image
    const image = await images.findById(imageId);
    if (!image) {
      const response = notFound("Image not found");
      return res.status(response.statusCode).json(response);
    }

    if (tokenType === "phone_verified_login") {
      // Registered user: must exist and be active
      const user = await require("../db/models/users").findById(userId);
      if (!user || !user.isActive) {
        const response = unauthorized("User not found or inactive");
        return res.status(response.statusCode).json(response);
      }
      // Only allow if image.uploadedBy == userId
      if (!image.uploadedBy || image.uploadedBy.toString() !== userId) {
        const response = forbidden("Access denied");
        return res.status(response.statusCode).json(response);
      }
    } else if (tokenType === "phone_verified_registration") {
      // Only allow if image.phone == token.phone && image.otpId == token.id
      if (!image.phone || !image.otpId || image.phone !== phone || image.otpId.toString() !== otpId) {
        const response = forbidden("Access denied");
        return res.status(response.statusCode).json(response);
      }
    } else {
      const response = unauthorized("Invalid or missing authentication context");
      return res.status(response.statusCode).json(response);
    }

    // Update image
    const updatedImage = await images
      .findByIdAndUpdate(
        imageId,
        {
          category: req.body.category,
          updatedAt: new Date(),
        },
        { new: true }
      )
      .populate("uploadedBy", "name email")
      .select("-filePath");

    const response = updated(
      { image: updatedImage },
      "Image updated successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Update image error:", error);
    const response = serverError("Failed to update image");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Delete image
 * @route DELETE /api/v1/images/:imageId
 */
exports.deleteImage = async (req, res) => {
  try {
    const { imageId } = req.params;
    const userId = req.user.user_id;
    const tokenType = req.user?.type;
    let phone = req.user?.phone;
    let otpId = req.user?.id;


    // Get image and check if active
    const image = await images.findById(imageId);
    if (!image || image.isActive === false) {
      const response = notFound("Image not found or already deleted");
      return res.status(response.statusCode).json(response);
    }

    if (tokenType === "phone_verified_login") {
      // Registered user: must exist and be active
      const user = await require("../db/models/users").findById(userId);
      if (!user || !user.isActive) {
        const response = unauthorized("User not found or inactive");
        return res.status(response.statusCode).json(response);
      }
      // Only allow if image.uploadedBy == userId
      if (!image.uploadedBy || image.uploadedBy.toString() !== userId) {
        const response = forbidden("Access denied");
        return res.status(response.statusCode).json(response);
      }
    } else if (tokenType === "phone_verified_registration") {
      // Only allow if image.phone == token.phone && image.otpId == token.id
      if (!image.phone || !image.otpId || image.phone !== phone || image.otpId.toString() !== otpId) {
        const response = forbidden("Access denied");
        return res.status(response.statusCode).json(response);
      }
    } else {
      const response = unauthorized("Invalid or missing authentication context");
      return res.status(response.statusCode).json(response);
    }

    // Check if image is being used
    const isImageUsed = await checkImageUsage(imageId);
    if (isImageUsed) {
      const response = badRequest("Cannot delete image that is being used");
      return res.status(response.statusCode).json(response);
    }

    // Delete file from filesystem
    if (fs.existsSync(image.filePath)) {
      fs.unlinkSync(image.filePath);
    }

    // Soft delete image record
    await images.findByIdAndUpdate(imageId, {
      isActive: false,
      deletedAt: new Date(),
      deletedBy: userId,
      updatedAt: new Date(),
    });

    const response = deleted("Image deleted successfully");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Delete image error:", error);
    const response = serverError("Failed to delete image");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get image statistics
 * @route GET /api/v1/images/stats
 */
exports.getImageStats = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await require("../db/models/users").findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Build filter based on user role
    const filter = { isActive: true };
    const userType = await require("../db/models/user_types").findById(
      user.user_type
    );

    if (userType.name === "driver" || userType.name === "customer") {
      filter.uploadedBy = userId;
    }
    // Admin can see all stats

    // Get statistics
    const stats = await images.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          totalSize: { $sum: "$fileSize" },
          avgSize: { $avg: "$fileSize" },
          byType: {
            $push: {
              type: "$type",
              category: "$category",
            },
          },
        },
      },
    ]);

    // Process type statistics
    const typeStats = {};
    if (stats[0] && stats[0].byType) {
      stats[0].byType.forEach((item) => {
        if (!typeStats[item.type]) {
          typeStats[item.type] = 0;
        }
        typeStats[item.type]++;
      });
    }

    const response = success(
      {
        stats: {
          total: stats[0]?.total || 0,
          totalSize: stats[0]?.totalSize || 0,
          avgSize: stats[0]?.avgSize || 0,
          byType: typeStats,
        },
      },
      "Image statistics retrieved successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get image stats error:", error);
    const response = serverError("Failed to retrieve image statistics");
    return res.status(response.statusCode).json(response);
  }
};

// Helper function to check if image is being used
const checkImageUsage = async (imageId) => {
  try {
    // Check if image is used in user profiles
    const userProfile = await require("../db/models/users").findOne({
      profilePicture: imageId,
    });
    if (userProfile) return true;

    // Check if image is used in vehicles
    const vehicleImages = await require("../db/models/vehicles").findOne({
      $or: [{ truckImages: imageId }, { profilePicture: imageId }],
    });
    if (vehicleImages) return true;

    // Check if image is used in customer requests
    const customerRequestImages =
      await require("../db/models/customer_requests").findOne({
        attachments: imageId,
      });
    if (customerRequestImages) return true;

    return false;
  } catch (error) {
    console.error("Check image usage error:", error);
    return false;
  }
};
