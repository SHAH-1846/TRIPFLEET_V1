/**
 * Standardized API Response Handler
 * Provides consistent response structure across all endpoints
 */

class ApiResponse {
  constructor(success, statusCode, message, data = null, errors = null, meta = null) {
    this.success = success;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.errors = errors;
    this.meta = meta;
    this.timestamp = new Date().toISOString();
    this.requestId = this.generateRequestId();
  }

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  toJSON() {
    const response = {
      success: this.success,
      statusCode: this.statusCode,
      message: this.message,
      timestamp: this.timestamp,
      requestId: this.requestId
    };

    if (this.data !== null) response.data = this.data;
    if (this.errors !== null) response.errors = this.errors;
    if (this.meta !== null) response.meta = this.meta;

    return response;
  }
}

// Success Response Functions
exports.success = (data = null, message = "Operation completed successfully", statusCode = 200, meta = null) => {
  return new ApiResponse(true, statusCode, message, data, null, meta);
};

exports.created = (data = null, message = "Resource created successfully", meta = null) => {
  return new ApiResponse(true, 201, message, data, null, meta);
};

exports.updated = (data = null, message = "Resource updated successfully", meta = null) => {
  return new ApiResponse(true, 200, message, data, null, meta);
};

exports.deleted = (message = "Resource deleted successfully") => {
  return new ApiResponse(true, 200, message, null, null, null);
};

// Error Response Functions
exports.badRequest = (message = "Bad request", errors = null) => {
  return new ApiResponse(false, 400, message, null, errors, null);
};

exports.unauthorized = (message = "Unauthorized access") => {
  return new ApiResponse(false, 401, message, null, null, null);
};

exports.forbidden = (message = "Access forbidden") => {
  return new ApiResponse(false, 403, message, null, null, null);
};

exports.notFound = (message = "Resource not found") => {
  return new ApiResponse(false, 404, message, null, null, null);
};

exports.conflict = (message = "Resource conflict", errors = null) => {
  return new ApiResponse(false, 409, message, null, errors, null);
};

exports.validationError = (message = "Validation failed", errors = null) => {
  return new ApiResponse(false, 422, message, null, errors, null);
};

exports.serverError = (message = "Internal server error", errors = null) => {
  return new ApiResponse(false, 500, message, null, errors, null);
};

// Legacy compatibility functions
exports.success_function = function(api_data) {
  return new ApiResponse(true, api_data.status || 200, api_data.message || "Success", api_data.data || null, null, null);
};

exports.error_function = function(api_data) {
  return new ApiResponse(false, api_data.status || 400, api_data.message || "Error", null, api_data.errors || null, null);
};

// Pagination helper
exports.paginatedResponse = (data, page, limit, total, message = "Data retrieved successfully") => {
  const totalPages = Math.ceil(total / limit);
  const meta = {
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
  
  return new ApiResponse(true, 200, message, data, null, meta);
};