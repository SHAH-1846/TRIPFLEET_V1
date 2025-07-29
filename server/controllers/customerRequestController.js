/**
 * Customer Request Management Controller
 * Handles customer request creation, management, and operations
 */

const { Types } = require("mongoose");

// Models
const customer_requests = require("../db/models/customer_requests");
const users = require("../db/models/users");
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
  serverError 
} = require("../utils/response-handler");

// Validation schemas
const { customerRequestSchemas } = require("../validations/schemas");

/**
 * Create a new customer request
 * @route POST /api/v1/customer-requests
 */
exports.createRequest = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Validate request data
    const { error, value } = customerRequestSchemas.createRequest.validate(req.body, { 
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
      const response = forbidden("Only customers can create requests");
      return res.status(response.statusCode).json(response);
    }

    // Validate attachments if provided
    if (value.attachments && value.attachments.length > 0) {
      const validAttachments = await validateImageReferences(value.attachments);
      if (!validAttachments.isValid) {
        const response = badRequest("Invalid attachment references", validAttachments.errors);
        return res.status(response.statusCode).json(response);
      }
    }

    // Create customer request with enhanced data
    const requestData = {
      customer: userId,
      title: value.title,
      description: value.description,
      category: value.category,
      priority: value.priority,
      attachments: value.attachments || [],
      status: 'open',
      isActive: true
    };

    const newRequest = await customer_requests.create(requestData);

    // Populate request data for response
    const populatedRequest = await customer_requests.findById(newRequest._id)
      .populate('customer', 'name email phone')
      .populate('assignedTo', 'name email phone')
      .populate('attachments', 'url filename');

    const response = created(
      { request: populatedRequest },
      "Customer request created successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Create customer request error:", error);
    const response = serverError("Failed to create customer request");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get all customer requests with pagination and filtering
 * @route GET /api/v1/customer-requests
 */
exports.getAllRequests = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 10, status, category, priority, assignedTo } = req.query;
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
      filter.assignedTo = userId;
    }
    // Admin can see all requests
    
    if (status) {
      filter.status = status;
    }
    
    if (category) {
      filter.category = category;
    }
    
    if (priority) {
      filter.priority = priority;
    }
    
    if (assignedTo) {
      filter.assignedTo = assignedTo;
    }

    // Get requests with pagination
    const requestsData = await customer_requests.find(filter)
      .populate('customer', 'name email phone')
      .populate('assignedTo', 'name email phone')
      .populate('attachments', 'url filename')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await customer_requests.countDocuments(filter);

    const response = success(
      requestsData,
      "Customer requests retrieved successfully",
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
    console.error("Get all customer requests error:", error);
    const response = serverError("Failed to retrieve customer requests");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get specific customer request by ID
 * @route GET /api/v1/customer-requests/:requestId
 */
exports.getRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get request with populated data
    const request = await customer_requests.findById(requestId)
      .populate('customer', 'name email phone')
      .populate('assignedTo', 'name email phone')
      .populate('attachments', 'url filename');

    if (!request) {
      const response = notFound("Customer request not found");
      return res.status(response.statusCode).json(response);
    }

    // Check access permissions
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'customer' && request.customer._id.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }
    
    if (userType.name === 'driver' && request.assignedTo && request.assignedTo._id.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    const response = success(
      { request },
      "Customer request retrieved successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get customer request by ID error:", error);
    const response = serverError("Failed to retrieve customer request");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Update customer request information
 * @route PUT /api/v1/customer-requests/:requestId
 */
exports.updateRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.user_id;

    // Validate request data
    const { error, value } = customerRequestSchemas.updateRequest.validate(req.body, { 
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

    // Get request
    const request = await customer_requests.findById(requestId);
    if (!request) {
      const response = notFound("Customer request not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can update this request
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'customer' && request.customer.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if request can be updated
    if (['resolved', 'closed'].includes(request.status)) {
      const response = badRequest("Cannot update resolved or closed request");
      return res.status(response.statusCode).json(response);
    }

    // Validate attachments if being updated
    if (value.attachments && value.attachments.length > 0) {
      const validAttachments = await validateImageReferences(value.attachments);
      if (!validAttachments.isValid) {
        const response = badRequest("Invalid attachment references", validAttachments.errors);
        return res.status(response.statusCode).json(response);
      }
    }

    // Update request
    const updatedRequest = await customer_requests.findByIdAndUpdate(
      requestId,
      { 
        ...value,
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('customer', 'name email phone')
    .populate('assignedTo', 'name email phone')
    .populate('attachments', 'url filename');

    const response = updated(
      { request: updatedRequest },
      "Customer request updated successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Update customer request error:", error);
    const response = serverError("Failed to update customer request");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Assign request to driver (admin only)
 * @route PUT /api/v1/customer-requests/:requestId/assign
 */
exports.assignRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { driverId } = req.body;
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
      const response = forbidden("Only admins can assign requests");
      return res.status(response.statusCode).json(response);
    }

    // Get request
    const request = await customer_requests.findById(requestId);
    if (!request) {
      const response = notFound("Customer request not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if driver exists and is a driver
    const driver = await users.findById(driverId);
    if (!driver || !driver.isActive) {
      const response = notFound("Driver not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    const driverType = await require("../db/models/user_types").findById(driver.user_type);
    if (driverType.name !== 'driver') {
      const response = badRequest("User is not a driver");
      return res.status(response.statusCode).json(response);
    }

    // Update request assignment
    const updatedRequest = await customer_requests.findByIdAndUpdate(
      requestId,
      { 
        assignedTo: driverId,
        status: 'in_progress',
        assignedAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    )
    .populate('customer', 'name email phone')
    .populate('assignedTo', 'name email phone')
    .populate('attachments', 'url filename');

    const response = updated(
      { request: updatedRequest },
      "Request assigned successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Assign request error:", error);
    const response = serverError("Failed to assign request");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Update request status
 * @route PUT /api/v1/customer-requests/:requestId/status
 */
exports.updateRequestStatus = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, resolutionNotes } = req.body;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get request
    const request = await customer_requests.findById(requestId);
    if (!request) {
      const response = notFound("Customer request not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can update this request
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'customer' && request.customer.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }
    
    if (userType.name === 'driver' && request.assignedTo && request.assignedTo.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Validate status transition
    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      const response = badRequest("Invalid status");
      return res.status(response.statusCode).json(response);
    }

    // Update request status
    const updateData = {
      status: status,
      updatedAt: new Date()
    };

    if (status === 'resolved' || status === 'closed') {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = userId;
      updateData.resolutionNotes = resolutionNotes;
    }

    const updatedRequest = await customer_requests.findByIdAndUpdate(
      requestId,
      updateData,
      { new: true }
    )
    .populate('customer', 'name email phone')
    .populate('assignedTo', 'name email phone')
    .populate('attachments', 'url filename');

    const response = updated(
      { request: updatedRequest },
      "Request status updated successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Update request status error:", error);
    const response = serverError("Failed to update request status");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Delete customer request (soft delete)
 * @route DELETE /api/v1/customer-requests/:requestId
 */
exports.deleteRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get request
    const request = await customer_requests.findById(requestId);
    if (!request) {
      const response = notFound("Customer request not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user can delete this request
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'customer' && request.customer.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Check if request can be deleted
    if (['in_progress', 'resolved'].includes(request.status)) {
      const response = badRequest("Cannot delete request that is in progress or resolved");
      return res.status(response.statusCode).json(response);
    }

    // Soft delete request
    await customer_requests.findByIdAndUpdate(requestId, {
      isActive: false,
      deletedAt: new Date(),
      deletedBy: userId,
      updatedAt: new Date()
    });

    const response = deleted("Customer request deleted successfully");
    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Delete customer request error:", error);
    const response = serverError("Failed to delete customer request");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get customer request statistics
 * @route GET /api/v1/customer-requests/stats
 */
exports.getRequestStats = async (req, res) => {
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
      filter.assignedTo = userId;
    }
    // Admin can see all stats

    // Get statistics
    const stats = await customer_requests.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
          closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
          low: { $sum: { $cond: [{ $eq: ['$priority', 'low'] }, 1, 0] } },
          medium: { $sum: { $cond: [{ $eq: ['$priority', 'medium'] }, 1, 0] } },
          high: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } },
          urgent: { $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] } }
        }
      }
    ]);

    const response = success(
      { stats: stats[0] || {} },
      "Customer request statistics retrieved successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get request stats error:", error);
    const response = serverError("Failed to retrieve customer request statistics");
    return res.status(response.statusCode).json(response);
  }
};

// Helper function to validate image references
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
