/**
 * Document Management Controller
 * Handles document upload, management, and operations
 */

const fs = require("fs");
const path = require("path");
const { Types } = require("mongoose");

// Models
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
const { fileSchemas } = require("../validations/schemas");

/**
 * Upload document
 * @route POST /api/v1/documents/upload
 */
exports.uploadDocument = async (req, res) => {
  try {
    // Determine user context from token
    const tokenType = req.user?.type;
    let userId = req.user?.user_id;
    let phone = req.user?.phone;
    let otpId = req.user?.id;
    let user = null;

    if (tokenType === 'phone_verified_login') {
      // Registered user: must exist and be active
      user = await require("../db/models/users").findById(userId);
      if (!user || !user.isActive) {
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        const response = unauthorized("User not found or inactive");
        return res.status(response.statusCode).json(response);
      }
    } else if (tokenType === 'phone_verified_registration') {
      // Unregistered user: allow upload, associate with phone/otpId
      userId = null;
      // phone and otpId are available from token
    } else {
      // Invalid or missing token type
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      const response = unauthorized("Invalid or missing authentication context");
      return res.status(response.statusCode).json(response);
    }

    // Check if file exists
    if (!req.file) {
      const response = badRequest("Document file is required");
      return res.status(response.statusCode).json(response);
    }

    // Validate request data
    const { error, value } = fileSchemas.uploadDocument.validate(req.body, { 
      abortEarly: false, 
      stripUnknown: true 
    });

    if (error) {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      const response = badRequest("Validation failed", errors);
      return res.status(response.statusCode).json(response);
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp'
    ];
    
    if (!allowedTypes.includes(req.file.mimetype)) {
      // Delete uploaded file
      fs.unlinkSync(req.file.path);
      
      const response = badRequest("Invalid file type. Only PDF, DOC, DOCX, JPEG, PNG, and WebP are allowed");
      return res.status(response.statusCode).json(response);
    }

    // Validate file size (max 20MB)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (req.file.size > maxSize) {
      // Delete uploaded file
      fs.unlinkSync(req.file.path);
      
      const response = badRequest("File size too large. Maximum size is 20MB");
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

    // Create document record
    const documentData = {
      originalName: req.file.originalname,
      filename: filename,
      url: `/uploads/documents/${value.type}/${filename}`,
      filePath: newPath,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      type: value.type,
      category: value.category || 'general',
      uploadedBy: userId || undefined,
      phone: !userId && phone ? phone : undefined,
      otpId: !userId && otpId ? otpId : undefined,
      isActive: true
    };
    

    const newDocument = await Documents.create(documentData);

    const response = created(
      { 
        document: {
          _id: newDocument._id,
          originalName: newDocument.originalName,
          filename: newDocument.filename,
          url: newDocument.url,
          fileSize: newDocument.fileSize,
          mimeType: newDocument.mimeType,
          type: newDocument.type,
          category: newDocument.category,
          uploadedAt: newDocument.createdAt,
          phone: newDocument.phone,
          otpId: newDocument.otpId
        }
      },
      "Document uploaded successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Upload document error:", error);
    
    // Clean up uploaded file if it exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    const response = serverError("Failed to upload document");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get all documents with pagination and filtering
 * @route GET /api/v1/documents
 */
exports.getAllDocuments = async (req, res) => {
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
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'driver' || userType.name === 'customer') {
      filter.uploadedBy = userId;
    }
    // Admin can see all documents
    
    if (type) {
      filter.type = type;
    }
    
    if (category) {
      filter.category = category;
    }
    
    if (uploadedBy) {
      filter.uploadedBy = uploadedBy;
    }

    // Get documents with pagination
    const documentsData = await Documents.find(filter)
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-filePath'); // Don't expose file paths

    // Get total count
    const total = await Documents.countDocuments(filter);

    const response = success(
      documentsData,
      "Documents retrieved successfully",
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
    console.error("Get all documents error:", error);
    const response = serverError("Failed to retrieve documents");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get specific document by ID
 * @route GET /api/v1/documents/:documentId
 */
exports.getDocumentById = async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await require("../db/models/users").findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get document
    const document = await Documents.findById(documentId)
      .populate('uploadedBy', 'name email');

    if (!document) {
      const response = notFound("Document not found");
      return res.status(response.statusCode).json(response);
    }

    // Check access permissions
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'driver' || userType.name === 'customer') {
      if (document.uploadedBy._id.toString() !== userId) {
        const response = forbidden("Access denied");
        return res.status(response.statusCode).json(response);
      }
    }

    // Don't expose file path in response
    const documentData = {
      _id: document._id,
      originalName: document.originalName,
      filename: document.filename,
      url: document.url,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      type: document.type,
      category: document.category,
      uploadedBy: document.uploadedBy,
      uploadedAt: document.createdAt,
      updatedAt: document.updatedAt
    };

    const response = success(
      { document: documentData },
      "Document retrieved successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get document by ID error:", error);
    const response = serverError("Failed to retrieve document");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Update document information
 * @route PUT /api/v1/documents/:documentId
 */
exports.updateDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await require("../db/models/users").findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get document
    const document = await Documents.findById(documentId);
    if (!document) {
      const response = notFound("Document not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can update this document
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'driver' || userType.name === 'customer') {
      if (document.uploadedBy.toString() !== userId) {
        const response = forbidden("Access denied");
        return res.status(response.statusCode).json(response);
      }
    }

    // Update document
    const updatedDocument = await Documents.findByIdAndUpdate(
      documentId,
      { 
        category: req.body.category,
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('uploadedBy', 'name email')
    .select('-filePath');

    const response = updated(
      { document: updatedDocument },
      "Document updated successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Update document error:", error);
    const response = serverError("Failed to update document");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Delete document
 * @route DELETE /api/v1/documents/:documentId
 */
exports.deleteDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await require("../db/models/users").findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get document
    const document = await Documents.findById(documentId);
    if (!document) {
      const response = notFound("Document not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can delete this document
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'driver' || userType.name === 'customer') {
      if (document.uploadedBy.toString() !== userId) {
        const response = forbidden("Access denied");
        return res.status(response.statusCode).json(response);
      }
    }

    // Check if document is being used
    const isDocumentUsed = await checkDocumentUsage(documentId);
    if (isDocumentUsed) {
      const response = badRequest("Cannot delete document that is being used");
      return res.status(response.statusCode).json(response);
    }

    // Delete file from filesystem
    if (fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
    }

    // Soft delete document record
    await Documents.findByIdAndUpdate(documentId, {
      isActive: false,
      deletedAt: new Date(),
      deletedBy: userId,
      updatedAt: new Date()
    });

    const response = deleted("Document deleted successfully");
    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Delete document error:", error);
    const response = serverError("Failed to delete document");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get document statistics
 * @route GET /api/v1/documents/stats
 */
exports.getDocumentStats = async (req, res) => {
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
    const userType = await require("../db/models/user_types").findById(user.user_type);
    
    if (userType.name === 'driver' || userType.name === 'customer') {
      filter.uploadedBy = userId;
    }
    // Admin can see all stats

    // Get statistics
    const stats = await Documents.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          totalSize: { $sum: '$fileSize' },
          avgSize: { $avg: '$fileSize' },
          byType: {
            $push: {
              type: '$type',
              category: '$category'
            }
          }
        }
      }
    ]);

    // Process type statistics
    const typeStats = {};
    if (stats[0] && stats[0].byType) {
      stats[0].byType.forEach(item => {
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
          byType: typeStats
        }
      },
      "Document statistics retrieved successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get document stats error:", error);
    const response = serverError("Failed to retrieve document statistics");
    return res.status(response.statusCode).json(response);
  }
};

// Helper function to check if document is being used
const checkDocumentUsage = async (documentId) => {
  try {
    // Check if document is used in user profiles
    const userProfile = await require("../db/models/users").findOne({ 
      $or: [
        { drivingLicense: documentId },
        { registrationCertificate: documentId }
      ]
    });
    if (userProfile) return true;

    // Check if document is used in vehicles
    const vehicleDocuments = await require("../db/models/vehicles").findOne({ 
      $or: [
        { registrationCertificate: documentId },
        { drivingLicense: documentId }
      ]
    });
    if (vehicleDocuments) return true;

    return false;
  } catch (error) {
    console.error("Check document usage error:", error);
    return false;
  }
};
