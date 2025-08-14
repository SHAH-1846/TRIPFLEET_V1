/**
 * Joi Validation Schemas
 * Comprehensive validation schemas for all API endpoints
 */

const Joi = require("joi");

// Common validation patterns
const patterns = {
  phone: /^\+?[1-9]\d{7,14}$/,
  vehicleNumber: /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/,
  password:
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  objectId: /^[0-9a-fA-F]{24}$/,
};

// Common field validations
const fields = {
  name: Joi.string().trim().min(2).max(50).required().messages({
    "string.empty": "Name is required",
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name cannot exceed 50 characters",
  }),

  email: Joi.string().email().lowercase().trim().required().messages({
    "string.email": "Please enter a valid email address",
    "string.empty": "Email is required",
  }),

  phone: Joi.string().pattern(patterns.phone).required().messages({
    "string.pattern.base":
      "Please enter a valid international phone number (e.g. +919999999999)",
    "string.empty": "Phone number is required",
  }),

  password: Joi.string().pattern(patterns.password).required().messages({
    "string.pattern.base":
      "Password must contain at least 8 characters, including uppercase, lowercase, number and special character",
    "string.empty": "Password is required",
  }),

  objectId: Joi.string().pattern(patterns.objectId).required().messages({
    "string.pattern.base": "Invalid ID format",
    "string.empty": "ID is required",
  }),

  boolean: Joi.boolean().required().messages({
    "boolean.base": "Must be true or false",
    "any.required": "This field is required",
  }),
};

// Auth Schemas
const authSchemas = {
  login: Joi.object({
    email: fields.email,
    password: Joi.string().required().messages({
      "string.empty": "Password is required",
    }),
  }),

  requestOtp: Joi.object({
    phone: fields.phone,
  }),

  verifyOtp: Joi.object({
    otp: Joi.string()
      .pattern(/^\d{4,8}$/)
      .required()
      .messages({
        "string.pattern.base": "OTP must be 4-8 digits",
        "string.empty": "OTP is required",
      }),
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required().messages({
      "string.empty": "Refresh token is required",
    }),
  }),
};

// User Schemas
const userSchemas = {
  registerDriver: Joi.object({
    name: fields.name,
    whatsappNumber: fields.phone,
    mobileNumber: fields.phone, // Require separate mobile number
    email: fields.email,
    drivingLicense: fields.objectId,
    profilePicture: fields.objectId,
    vehicleNumber: Joi.string()
      .pattern(patterns.vehicleNumber)
      .required()
      .messages({
        "string.pattern.base":
          "Please enter a valid vehicle number (e.g. KA01AB1234)",
        "string.empty": "Vehicle number is required",
      }),
    vehicleType: fields.objectId,
    vehicleBodyType: fields.objectId,
    vehicleCapacity: Joi.number().min(1).max(100).required().messages({
      "number.base": "Vehicle capacity must be a number",
      "number.min": "Vehicle capacity must be at least 1 ton",
      "number.max": "Vehicle capacity cannot exceed 100 tons",
    }),
    goodsAccepted: fields.objectId.optional(),
    registrationCertificate: fields.objectId,
    truckImages: Joi.array().items(fields.objectId).min(1).unique().required().messages({
      "array.min": "At least one truck image is required",
      "array.base": "Truck images must be an array",
      "array.unique": "Truck images must contain unique image IDs",
    }),
    termsAndConditionsAccepted: fields.boolean,
    privacyPolicyAccepted: fields.boolean,
  }),

  registerProfile: Joi.object({
    name: fields.name,
    email: fields.email,
    whatsappNumber: fields.phone,
    user_type: fields.objectId, // required user_type as objectId
    profilePicture: Joi.string()
      .pattern(patterns.objectId)
      .optional()
      .messages({
        "string.pattern.base": "Invalid profile picture ID format",
      }),
    // termsAndConditionsAccepted: fields.boolean,
    // privacyPolicyAccepted: fields.boolean
  }),

  updateProfile: Joi.object({
    name: Joi.string().trim().min(2).max(50).optional(),
    email: Joi.string().email().lowercase().trim().optional(),
    whatsappNumber: Joi.string().pattern(patterns.phone).optional(),
    profilePicture: Joi.string().pattern(patterns.objectId).optional(),
  })
    .min(1)
    .messages({
      "object.min": "At least one field must be provided for update",
    }),

  updateUserType: Joi.object({
    userType: fields.objectId,
  }),
};

// Vehicle Schemas
const vehicleSchemas = {
  createVehicle: Joi.object({
    vehicleNumber: Joi.string()
      .pattern(patterns.vehicleNumber)
      .required()
      .messages({
        "string.pattern.base":
          "Please enter a valid vehicle number (e.g. KA01AB1234)",
        "string.empty": "Vehicle number is required",
      }),
    vehicleType: fields.objectId,
    vehicleBodyType: fields.objectId,
    vehicleCapacity: Joi.number().min(1).max(100).required(),
    goodsAccepted: fields.objectId.optional(),
    termsAndConditionsAccepted: Joi.boolean().required().messages({
      'boolean.base': 'Terms and conditions acceptance must be true or false',
      'any.required': 'You must accept the terms and conditions to register a vehicle'
    }),
    registrationCertificate: fields.objectId,
    truckImages: Joi.array().items(fields.objectId).min(4).unique().required().messages({
      'array.unique': 'Truck images must contain unique image IDs',
      'array.min': 'At least 4 truck images are required',
      'array.base': 'Truck images must be an array'
    }),
    drivingLicense: fields.objectId.optional(),
  }),

  updateVehicle: Joi.object({
    vehicleNumber: Joi.string().pattern(patterns.vehicleNumber).optional(),
    vehicleType: fields.objectId.optional(),
    vehicleBodyType: fields.objectId.optional(),
    vehicleCapacity: Joi.number().min(1).max(100).optional(),
    goodsAccepted: fields.objectId.optional(),
    registrationCertificate: fields.objectId.optional(),
    truckImages: Joi.array().items(fields.objectId).unique().optional().messages({
      'array.unique': 'Truck images must contain unique image IDs',
      'array.base': 'Truck images must be an array'
    }),
    drivingLicense: fields.objectId.optional(),
  }).min(1),
};

// Trip Schemas
const tripSchemas = {
  createTrip: Joi.object({
    tripStartLocation: Joi.object({
      address: Joi.string().trim().min(5).max(200).required(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required(),
      }).required(),
    }).required(),
    tripDestination: Joi.object({
      address: Joi.string().trim().min(5).max(200).required(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required(),
      }).required(),
    }).required(),
    routeGeoJSON: Joi.object({
      type: Joi.string().valid("LineString").default("LineString"),
      coordinates: Joi.array().items(
        Joi.array().items(Joi.number()).length(2)
      ).min(2).optional(),
    }).optional(),
    distance: Joi.object({
      value: Joi.number().min(0).required(),
      text: Joi.string().trim().max(50).required(),
    }).optional(),
    duration: Joi.object({
      value: Joi.number().min(0).required(),
      text: Joi.string().trim().max(50).required(),
    }).optional(),
    vehicle: fields.objectId.required().messages({
      'any.required': 'Vehicle is required for the trip'
    }),
    driver: fields.objectId.required().messages({
      'any.required': 'Driver is required for the trip'
    }),
    selfDrive: Joi.boolean().required().messages({
      'any.required': 'selfDrive field is required to indicate if the current user is driving'
    }),
    goodsType: fields.objectId,
    weight: Joi.number().min(0.1).max(100).required(),
    description: Joi.string().trim().max(500).optional(),
    tripStartDate: Joi.date().iso().min('now').required().messages({
      'date.base': 'tripStartDate must be a valid ISO date-time string',
      'any.required': 'tripStartDate is required'
    }),
    tripEndDate: Joi.date().iso().greater(Joi.ref('tripStartDate')).required().messages({
      'date.base': 'tripEndDate must be a valid ISO date-time string',
      'date.greater': 'tripEndDate must be after tripStartDate',
      'any.required': 'tripEndDate is required'
    }),
  }),

  updateTrip: Joi.object({
    tripStartLocation: Joi.object({
      address: Joi.string().trim().min(5).max(200).optional(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).optional(),
        lng: Joi.number().min(-180).max(180).optional(),
      }).optional(),
    }).optional(),
    tripDestination: Joi.object({
      address: Joi.string().trim().min(5).max(200).optional(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(180).optional(),
        lng: Joi.number().min(-180).max(180).optional(),
      }).optional(),
    }).optional(),
    routeGeoJSON: Joi.object({
      type: Joi.string().valid("LineString").default("LineString"),
      coordinates: Joi.array().items(
        Joi.array().items(Joi.number()).length(2)
      ).min(2).optional(),
    }).optional(),
    distance: Joi.object({
      value: Joi.number().min(0).optional(),
      text: Joi.string().trim().max(50).optional(),
    }).optional(),
    duration: Joi.object({
      value: Joi.number().min(0).optional(),
      text: Joi.string().trim().max(50).optional(),
    }).optional(),
    vehicle: fields.objectId.optional(),
    driver: fields.objectId.optional(),
    selfDrive: Joi.boolean().optional(),
    goodsType: fields.objectId.optional(),
    weight: Joi.number().min(0.1).max(100).optional(),
    description: Joi.string().trim().max(500).optional(),
    tripStartDate: Joi.date().iso().min('now').optional().messages({
      'date.base': 'tripStartDate must be a valid ISO date-time string'
    }),
    tripEndDate: Joi.date().iso().greater(Joi.ref('tripStartDate')).optional().messages({
      'date.base': 'tripEndDate must be a valid ISO date-time string',
      'date.greater': 'tripEndDate must be after tripStartDate'
    }),
  }).min(1),
};

// Booking Schemas
const bookingSchemas = {
  createBooking: Joi.object({
    trip: fields.objectId,
    vehicle: fields.objectId,
    price: Joi.number().min(100).max(1000000).required(),
    pickupDate: Joi.date().min("now").required(),
    notes: Joi.string().trim().max(500).optional(),
  }),

  updateBooking: Joi.object({
    price: Joi.number().min(100).max(1000000).optional(),
    pickupDate: Joi.date().min("now").optional(),
    notes: Joi.string().trim().max(500).optional(),
    status: Joi.string()
      .valid("pending", "confirmed", "in_progress", "completed", "cancelled")
      .optional(),
  }).min(1),
};

// Customer Request Schemas
const customerRequestSchemas = {
  createRequest: Joi.object({
    title: Joi.string().trim().min(5).max(100).required(),
    description: Joi.string().trim().min(10).max(1000).required(),
    category: Joi.string()
      .valid("general", "technical", "billing", "support")
      .required(),
    priority: Joi.string()
      .valid("low", "medium", "high", "urgent")
      .default("medium"),
    attachments: Joi.array().items(fields.objectId).optional(),
  }),

  updateRequest: Joi.object({
    title: Joi.string().trim().min(5).max(100).optional(),
    description: Joi.string().trim().min(10).max(1000).optional(),
    category: Joi.string()
      .valid("general", "technical", "billing", "support")
      .optional(),
    priority: Joi.string().valid("low", "medium", "high", "urgent").optional(),
    status: Joi.string()
      .valid("open", "in_progress", "resolved", "closed")
      .optional(),
  }).min(1),
};

// Query Schemas
const querySchemas = {
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string()
      .valid("createdAt", "updatedAt", "name", "email")
      .default("createdAt"),
    sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  }),

  search: Joi.object({
    q: Joi.string().trim().min(1).max(100).optional(),
    status: Joi.string().optional(),
    category: Joi.string().optional(),
    dateFrom: Joi.date().optional(),
    dateTo: Joi.date().min(Joi.ref("dateFrom")).optional(),
  }),
};

// Driver Connection Schemas
const driverConnectionSchemas = {
  sendFriendRequest: Joi.object({
    mobileNumber: Joi.string()
      .pattern(/^\+?[1-9]\d{7,14}$/)
      .required()
      .messages({
        'string.pattern.base': 'Please enter a valid international phone number (e.g. +919999999999)',
        'string.empty': 'Mobile number is required'
      }),
  }),

  respondToRequest: Joi.object({
    action: Joi.string()
      .valid('accept', 'reject')
      .required()
      .messages({
        'any.only': 'Action must be either "accept" or "reject"',
        'string.empty': 'Action is required'
      }),
  }),
};

// File Upload Schemas
const fileSchemas = {
  uploadImage: Joi.object({
    type: Joi.string()
      .valid("profile", "vehicle", "document", "general")
      .required(),
    category: Joi.string().optional(),
  }),

  uploadDocument: Joi.object({
    type: Joi.string()
      .valid("license", "registration", "insurance", "general")
      .required(),
    category: Joi.string().optional(),
  }),
};

module.exports = {
  authSchemas,
  userSchemas,
  vehicleSchemas,
  tripSchemas,
  bookingSchemas,
  customerRequestSchemas,
  driverConnectionSchemas,
  querySchemas,
  fileSchemas,
  patterns,
  fields,
};
