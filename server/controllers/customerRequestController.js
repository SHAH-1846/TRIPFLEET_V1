/**
 * Customer Request Management Controller
 * Handles customer request creation, management, and operations
 */

const { Types } = require("mongoose");
const mongoose = require("mongoose");

// Models
const customer_requests = require("../db/models/customer_requests");
const users = require("../db/models/users");
const images = require("../db/models/images");
const customerRequestStatus = require("../db/models/customer_request_status");

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

    // Validate images/documents if provided
    if (value.images && value.images.length > 0) {
      const validImages = await validateImageReferences(value.images, userId);
      if (!validImages.isValid) {
        const response = badRequest("Invalid image references", validImages.errors);
        return res.status(response.statusCode).json(response);
      }
    }
    if (value.documents && value.documents.length > 0) {
      const validDocs = await validateImageReferences(value.documents, userId);
      if (!validDocs.isValid) {
        const response = badRequest("Invalid document references", validDocs.errors);
        return res.status(response.statusCode).json(response);
      }
    }

    // Create customer request aligned with model (coordinates are [lng, lat])
    const requestData = {
      title: value.title,
      description: value.description,
      user: userId,
      pickupLocation: {
        address: value.pickupLocation.address,
        coordinates: value.pickupLocation.coordinates,
      },
      dropoffLocation: {
        address: value.dropoffLocation.address,
        coordinates: value.dropoffLocation.coordinates,
      },
      ...(value.distance && { distance: value.distance }),
      ...(value.duration && { duration: value.duration }),
      packageDetails: value.packageDetails || {},
      images: value.images || [],
      documents: value.documents || [],
      pickupTime: value.pickupTime || null,
      status: value.status || undefined,
    };

    // Validate status if provided
    if (requestData.status) {
      const statusExists = await customerRequestStatus.exists({ _id: requestData.status });
      if (!statusExists) {
        const response = badRequest("Invalid status: not found in customer_request_status");
        return res.status(response.statusCode).json(response);
      }
    }

    const newRequest = await customer_requests.create(requestData);

    // Populate request data for response
    const populatedRequest = await customer_requests.findById(newRequest._id)
      .populate('user', 'name email phone')
      .populate('images', 'url filename')
      .populate('documents', 'url filename')
      .populate('status', 'name description');

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
    const {
      page = 1,
      limit = 10,
      status,
      category,
      priority,
      assignedTo,
      q, // search query
      dateFrom,
      dateTo,
      currentLocation,
      startLocation,
      destination,
      searchRadius,
      radius,
    } = req.query;
    const skip = (page - 1) * limit;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Base filter and dynamic conditions
    const baseFilter = { isActive: true };
    const andConditions = [];

    // Filter by user role
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'customer') {
      baseFilter.user = userId;
    } else if (userType.name === 'driver') {
      // Drivers can see all active requests
      // If the business rule is to hide already booked, keep the exclusion below
      // booked status: 684da132412825ef8b404715
      const excludeStatuses = [
        '684da132412825ef8b404715',
        '684da13e412825ef8b404716',
        '684da149412825ef8b404717'
      ].map((id) => new mongoose.Types.ObjectId(id)); // use `new` per item

      baseFilter.status = { $nin: excludeStatuses };
      console.log("status : ", baseFilter);
    }
    // Admin can see all requests

    if (status) baseFilter.status = status;
    if (category) baseFilter.category = category;
    if (priority) baseFilter.priority = priority;
    if (assignedTo) baseFilter.assignedTo = assignedTo;

    // Search across addresses and description
    if (q && typeof q === 'string' && q.trim().length > 0) {
      const regex = { $regex: q.trim(), $options: 'i' };
      andConditions.push({
        $or: [
          { title: regex },
          { description: regex },
          { 'pickupLocation.address': regex },
          { 'dropoffLocation.address': regex },
          { 'packageDetails.description': regex },
        ],
      });
    }

    // Date filtering by pickupTime
    if (dateFrom || dateTo) {
      const dateCond = {};
      if (dateFrom) dateCond.$gte = new Date(dateFrom);
      if (dateTo) dateCond.$lte = new Date(dateTo);
      andConditions.push({ pickupTime: dateCond });
    }

    // Location-based filtering
    let startLng, startLat, destLng, destLat, currentLng, currentLat;
    let effectiveRadius = 5000; // meters
    const radiusParam = typeof searchRadius !== 'undefined' ? searchRadius : radius;
    if (typeof radiusParam !== 'undefined') {
      const parsed = parseInt(radiusParam, 10);
      if (!Number.isNaN(parsed) && parsed > 0) effectiveRadius = parsed;
    }

    const parseLngLat = (input) => {
      if (!input) return [];
      try {
        if (Array.isArray(input)) return input.map((v) => parseFloat(v));
        if (typeof input === 'string') return input.split(',').map((c) => parseFloat(c.trim()));
      } catch (_) { }
      return [];
    };

    const [slng, slat] = parseLngLat(startLocation);
    if (Number.isFinite(slng) && Number.isFinite(slat)) {
      startLng = slng; startLat = slat;
    }
    const [dlng, dlat] = parseLngLat(destination);
    if (Number.isFinite(dlng) && Number.isFinite(dlat)) {
      destLng = dlng; destLat = dlat;
    }
    const [clng, clat] = parseLngLat(currentLocation);
    if (Number.isFinite(clng) && Number.isFinite(clat)) {
      currentLng = clng; currentLat = clat;
    }

    const radiusInRadians = effectiveRadius / 6371000; // meters to radians
    const withinCircle = (field, lng, lat) => ({
      [field]: { $geoWithin: { $centerSphere: [[lng, lat], radiusInRadians] } },
    });

    // start + destination corridor (pickup near start AND dropoff near destination)
    if (
      Number.isFinite(startLng) && Number.isFinite(startLat) &&
      Number.isFinite(destLng) && Number.isFinite(destLat)
    ) {
      andConditions.push(withinCircle('pickupLocation.coordinates', startLng, startLat));
      andConditions.push(withinCircle('dropoffLocation.coordinates', destLng, destLat));
    } else if (Number.isFinite(startLng) && Number.isFinite(startLat)) {
      andConditions.push(withinCircle('pickupLocation.coordinates', startLng, startLat));
    } else if (Number.isFinite(destLng) && Number.isFinite(destLat)) {
      andConditions.push(withinCircle('dropoffLocation.coordinates', destLng, destLat));
    }

    if (Number.isFinite(currentLng) && Number.isFinite(currentLat)) {
      andConditions.push({
        $or: [
          withinCircle('pickupLocation.coordinates', currentLng, currentLat),
          withinCircle('dropoffLocation.coordinates', currentLng, currentLat),
        ],
      });
    }

    const filter = andConditions.length > 0 ? { ...baseFilter, $and: andConditions } : baseFilter;

    

    // Get requests with pagination
    // Exclude booked customer requests from driver listings
    if (userType.name === 'driver') {
      // booked status: 684da132412825ef8b404715
      // filter.status = { $ne: '684da132412825ef8b404715' };
      filter.status = {
        $nin: [
          '684da132412825ef8b404715',
          '684da13e412825ef8b404716',
          '684da149412825ef8b404717'
        ]
      };
    }

    const requestsData = await customer_requests
      .find(filter)
      .populate('user', 'name email phone')
      .populate('images', 'url filename')
      .populate('documents', 'url filename')
      .populate('status', 'name description')
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
          hasPrev: page > 1,
        },
      }
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get all customer requests error:", error);
    const response = serverError("Failed to retrieve customer requests");
    return res.status(response.statusCode).json(response);
  }
};

// controllers/customerRequestController.js
exports.getMyCustomerRequests = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const {
      page = 1,
      limit = 10,
      status,
      q,
      dateFrom,
      dateTo
    } = req.query;
    const skip = (page - 1) * limit;

    // Validate user
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Only requests created by this user
    const filter = { isActive: true, user: userId };

    if (status) filter.status = status;

    // Search by title/description/addresses
    if (q && typeof q === 'string' && q.trim().length > 0) {
      const regex = { $regex: q.trim(), $options: 'i' };
      filter.$or = [
        { title: regex },
        { description: regex },
        { 'pickupLocation.address': regex },
        { 'dropoffLocation.address': regex },
        { 'packageDetails.description': regex },
      ];
    }

    // Date range on pickupTime
    if (dateFrom || dateTo) {
      filter.pickupTime = {};
      if (dateFrom) filter.pickupTime.$gte = new Date(dateFrom);
      if (dateTo) filter.pickupTime.$lte = new Date(dateTo);
    }

    const requestsData = await customer_requests
      .find(filter)
      .populate('status', 'name description')
      .populate('images', 'url filename')
      .populate('documents', 'url filename')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await customer_requests.countDocuments(filter);

    const response = success(
      requestsData,
      "My customer requests retrieved successfully",
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
    console.error("Get my customer requests error:", error);
    const response = serverError("Failed to retrieve my customer requests");
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
      .populate('user', 'name email phone')
      .populate('images', 'url filename')
      .populate('documents', 'url filename')
      .populate('status', 'name description');

    if (!request) {
      const response = notFound("Customer request not found");
      return res.status(response.statusCode).json(response);
    }

    // Check access permissions
    const userType = await require("../db/models/user_types").findById(user.user_type);
    if (userType.name === 'customer' && request.user._id.toString() !== userId) {
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

    // Only the original creator can update the request
    if (request.user.toString() !== userId) {
      const response = forbidden("Only the request creator can update this request");
      return res.status(response.statusCode).json(response);
    }

    // Check if request can be updated
    if (['resolved', 'closed'].includes(request.status)) {
      const response = badRequest("Cannot update resolved or closed request");
      return res.status(response.statusCode).json(response);
    }

    // Validate images/documents if being updated
    if (value.images && value.images.length > 0) {
      const validImages = await validateImageReferences(value.images, userId);
      if (!validImages.isValid) {
        const response = badRequest("Invalid image references", validImages.errors);
        return res.status(response.statusCode).json(response);
      }
    }
    if (value.documents && value.documents.length > 0) {
      const validDocs = await validateImageReferences(value.documents, userId);
      if (!validDocs.isValid) {
        const response = badRequest("Invalid document references", validDocs.errors);
        return res.status(response.statusCode).json(response);
      }
    }

    // Validate provided status id (if included)
    if (value.status) {
      if (!Types.ObjectId.isValid(value.status)) {
        const response = badRequest("Invalid status id format");
        return res.status(response.statusCode).json(response);
      }
      const statusExists = await customerRequestStatus.exists({ _id: value.status });
      if (!statusExists) {
        const response = badRequest("Invalid status: not found in customer_request_status");
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
      .populate('user', 'name email phone')
      .populate('status', 'name description')
      .populate('images', 'filename url')
      .populate('documents', 'filename url');

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
    if (userType.name === 'customer' && request.user.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    if (userType.name === 'driver' && request.assignedTo && request.assignedTo.toString() !== userId) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Validate status id exists in customer_request_status collection
    if (!Types.ObjectId.isValid(status)) {
      const response = badRequest("Invalid status id format");
      return res.status(response.statusCode).json(response);
    }
    const statusExists = await customerRequestStatus.exists({ _id: status });
    if (!statusExists) {
      const response = badRequest("Invalid status: not found in customer_request_status");
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
    if (userType.name === 'customer' && request.user.toString() !== userId) {
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
    if (image.uploadedBy && image.uploadedBy.toString() !== userId) {
      return { isValid: false, errors: ["Image does not belong to you"] };
    }

    return { isValid: true, errors: [] };
  } catch (error) {
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
