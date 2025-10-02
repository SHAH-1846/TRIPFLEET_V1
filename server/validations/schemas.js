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
    title: Joi.string().trim().min(5).max(200).required(),
    description: Joi.string().trim().max(500).required(),
    tripStartLocation: Joi.object({
      address: Joi.string().trim().min(3).max(200).required(),
      coordinates: Joi.array().items(Joi.number()).length(2).required(), // [lng, lat]
    }).required(),
    tripDestination: Joi.object({
      address: Joi.string().trim().min(3).max(200).required(),
      coordinates: Joi.array().items(Joi.number()).length(2).required(), // [lng, lat]
    }).required(),
    viaRoutes: Joi.array().items(Joi.object({
      address: Joi.string().trim().max(200).required(),
      coordinates: Joi.array().items(Joi.number()).length(2).required(), // [lng, lat]
    })).optional(),
    routeGeoJSON: Joi.object({
      type: Joi.string().valid("LineString").default("LineString"),
      coordinates: Joi.array().items(
        Joi.array().items(Joi.number()).length(2)
      ).min(2).required(),
    }).required(),
    vehicle: fields.objectId.required().messages({
      'any.required': 'Vehicle is required for the trip'
    }),
    selfDrive: Joi.boolean().required().messages({
      'any.required': 'selfDrive field is required to indicate if the current user is driving'
    }),
    driver: fields.objectId.required().messages({
      'any.required': 'Driver is required for the trip'
    }),
    distance: Joi.object({
      value: Joi.number().min(0).required(),
      text: Joi.string().trim().max(50).required(),
    }).optional(),
    duration: Joi.object({
      value: Joi.number().min(0).required(),
      text: Joi.string().trim().max(50).required(),
    }).optional(),
    goodsType: fields.objectId.required().messages({
      'any.required': 'Goods type is required for the trip'
    }),
    weight: Joi.number().min(0.1).max(100).optional(),
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
    title: Joi.string().trim().min(5).max(200).optional(),
    description: Joi.string().trim().max(500).optional(),
    tripStartLocation: Joi.object({
      address: Joi.string().trim().min(3).max(200).optional(),
      coordinates: Joi.array().items(Joi.number()).length(2).optional(), // [lng, lat]
    }).optional(),
    tripDestination: Joi.object({
      address: Joi.string().trim().min(3).max(200).optional(),
      coordinates: Joi.array().items(Joi.number()).length(2).optional(), // [lng, lat]
    }).optional(),
    viaRoutes: Joi.array().items(Joi.object({
      address: Joi.string().trim().max(200).required(),
      coordinates: Joi.array().items(Joi.number()).length(2).required(), // [lng, lat]
    })).optional(),
    routeGeoJSON: Joi.object({
      type: Joi.string().valid("LineString").default("LineString"),
      coordinates: Joi.array().items(
        Joi.array().items(Joi.number()).length(2)
      ).min(2).optional(),
    }).optional(),
    vehicle: fields.objectId.optional(),
    selfDrive: Joi.boolean().optional(),
    driver: fields.objectId.optional(),
    distance: Joi.object({
      value: Joi.number().min(0).optional(),
      text: Joi.string().trim().max(50).optional(),
    }).optional(),
    duration: Joi.object({
      value: Joi.number().min(0).optional(),
      text: Joi.string().trim().max(50).optional(),
    }).optional(),
    goodsType: fields.objectId.optional(),
    weight: Joi.number().min(0.1).max(100).optional(),
    tripStartDate: Joi.date().iso().min('now').optional().messages({
      'date.base': 'tripStartDate must be a valid ISO date-time string'
    }),
    tripEndDate: Joi.date().iso().greater(Joi.ref('tripStartDate')).optional().messages({
      'date.base': 'tripEndDate must be a valid ISO date-time string',
      'date.greater': 'tripEndDate must be after tripStartDate'
    }),
  }).min(1),

  updateStatus: Joi.object({
    status: fields.objectId,
    notes: Joi.string().trim().max(500).optional(),
  })
};

// Booking Schemas
const bookingSchemas = {
  createBooking: Joi.object({
    tripId: fields.objectId,
    customerRequestId: fields.objectId,
    connectRequestId: Joi.string().pattern(patterns.objectId).required(),
    price: Joi.number().min(0).required(),
    pickupDate: Joi.date().iso().min("now").required(),
    notes: Joi.string().trim().max(500).optional(),
  }),

  updateBooking: Joi.object({
    price: Joi.number().min(0).optional(),
    pickupDate: Joi.date().iso().min("now").optional(),
    notes: Joi.string().trim().max(500).optional(),
    status: Joi.string()
      .valid("pending", "confirmed", "in_progress", "completed", "cancelled", "rejected")
      .optional(),
  }).min(1),

  cancelBooking: Joi.object({
    cancellationReason: Joi.string().trim().min(3).max(500).required().messages({
      "string.empty": "Cancellation reason is required",
      "string.min": "Cancellation reason must be at least 3 characters long",
      "string.max": "Cancellation reason cannot exceed 500 characters",
      "any.required": "Cancellation reason is required"
    }),
  }),
};

// Customer Request Schemas (aligned with customer_requests model)
const customerRequestSchemas = {
  createRequest: Joi.object({
    title: Joi.string().trim().min(3).max(200).required(),
    description: Joi.string().trim().max(1000).required(),
    pickupLocation: Joi.object({
      address: Joi.string().trim().min(3).max(200).required(),
      coordinates: Joi.array().items(Joi.number()).length(2).required() // [lng, lat]
    }).required(),
    dropoffLocation: Joi.object({
      address: Joi.string().trim().min(3).max(200).required(),
      coordinates: Joi.array().items(Joi.number()).length(2).required() // [lng, lat]
    }).required(),
    distance: Joi.object({
      value: Joi.number().min(0).required(),
      text: Joi.string().trim().max(50).required(),
    }).required(),
    duration: Joi.object({
      value: Joi.number().min(0).required(),
      text: Joi.string().trim().max(50).required(),
    }).required(),
    packageDetails: Joi.object({
      weight: Joi.number().min(0).optional(),
      dimensions: Joi.object({
        length: Joi.number().min(0).optional(),
        width: Joi.number().min(0).optional(),
        height: Joi.number().min(0).optional(),
      }).optional(),
      description: Joi.string().trim().max(500).optional(),
    }).required(),
    images: Joi.array().items(fields.objectId).required(),
    documents: Joi.array().items(fields.objectId).optional(),
    pickupTime: Joi.date().iso().optional(),
    status: fields.objectId.optional(), // customer_request_status id
  }),

  updateRequest: Joi.object({
    title: Joi.string().trim().min(3).max(200).optional(),
    description: Joi.string().trim().max(1000).optional(),
    pickupLocation: Joi.object({
      address: Joi.string().trim().min(3).max(200).optional(),
      coordinates: Joi.array().items(Joi.number()).length(2).optional(),
    }).optional(),
    dropoffLocation: Joi.object({
      address: Joi.string().trim().min(3).max(200).optional(),
      coordinates: Joi.array().items(Joi.number()).length(2).optional(),
    }).optional(),
    distance: Joi.object({
      value: Joi.number().min(0).optional(),
      text: Joi.string().trim().max(50).optional(),
    }).optional(),
    duration: Joi.object({
      value: Joi.number().min(0).optional(),
      text: Joi.string().trim().max(50).optional(),
    }).optional(),
    packageDetails: Joi.object({
      weight: Joi.number().min(0).optional(),
      dimensions: Joi.object({
        length: Joi.number().min(0).optional(),
        width: Joi.number().min(0).optional(),
        height: Joi.number().min(0).optional(),
      }).optional(),
      description: Joi.string().trim().max(500).optional(),
    }).optional(),
    images: Joi.array().items(fields.objectId).optional(),
    documents: Joi.array().items(fields.objectId).optional(),
    pickupTime: Joi.date().iso().optional(),
    status: fields.objectId.optional(),
  }).min(1),
};

// Subscription module schemas
const subscriptionSchemas = {
  createPlan: Joi.object({
    name: Joi.string().trim().min(3).max(100).required(),
    description: Joi.string().trim().max(500).optional(),
    maxLeads: Joi.number().integer().min(0).required(),
    maxLeadsDistanceKm: Joi.number().min(0).required(),
    maxTrips: Joi.number().integer().min(0).required(),
    maxTripsDistanceKm: Joi.number().min(0).required(),
    durationDays: Joi.number().integer().min(1).max(3650).required(),
    priceMinor: Joi.number().integer().min(0).required(),
    currency: Joi.string().trim().length(3).default("INR"),
    isActive: Joi.boolean().optional(),
  }),

  updatePlan: Joi.object({
    name: Joi.string().trim().min(3).max(100).optional(),
    description: Joi.string().trim().max(500).optional(),
    maxLeads: Joi.number().integer().min(0).optional(),
    maxLeadsDistanceKm: Joi.number().min(0).optional(),
    maxTrips: Joi.number().integer().min(0).optional(),
    maxTripsDistanceKm: Joi.number().min(0).optional(),
    durationDays: Joi.number().integer().min(1).max(3650).optional(),
    priceMinor: Joi.number().integer().min(0).optional(),
    currency: Joi.string().trim().length(3).optional(),
    isActive: Joi.boolean().optional(),
  }).min(1),

  leadPricingCreate: Joi.object({
    distanceKmFrom: Joi.number().min(0).required(),
    distanceKmTo: Joi.number().greater(Joi.ref('distanceKmFrom')).required(),
    priceMinor: Joi.number().integer().min(0).required(),
    currency: Joi.string().trim().length(3).default("INR"),
    isActive: Joi.boolean().optional(),
  }),

  leadPricingUpdate: Joi.object({
    distanceKmFrom: Joi.number().min(0).optional(),
    distanceKmTo: Joi.number().greater(Joi.ref('distanceKmFrom')).optional(),
    priceMinor: Joi.number().integer().min(0).optional(),
    currency: Joi.string().trim().length(3).optional(),
    isActive: Joi.boolean().optional(),
  }).min(1),

  tripsPricingCreate: Joi.object({
    distanceKmFrom: Joi.number().min(0).required(),
    distanceKmTo: Joi.number().greater(Joi.ref('distanceKmFrom')).required(),
    priceMinor: Joi.number().integer().min(0).required(),
    currency: Joi.string().trim().length(3).default("INR"),
    isActive: Joi.boolean().optional(),
  }),

  tripsPricingUpdate: Joi.object({
    distanceKmFrom: Joi.number().min(0).optional(),
    distanceKmTo: Joi.number().greater(Joi.ref('distanceKmFrom')).optional(),
    priceMinor: Joi.number().integer().min(0).optional(),
    currency: Joi.string().trim().length(3).optional(),
    isActive: Joi.boolean().optional(),
  }).min(1),

  subscribe: Joi.object({
    planId: fields.objectId,
  }),

  upgrade: Joi.object({
    newPlanId: fields.objectId,
    strategy: Joi.string().valid('usage', 'prorate').default('prorate'),
  }),

  cancel: Joi.object({
    reason: Joi.string().trim().max(500).optional(),
  })
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
      .valid("profile", "vehicle", "document", "general", "customer_request")
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

// Token module schemas
const tokenSchemas = {
  createTokenPlan: Joi.object({
    name: Joi.string().trim().min(3).max(100).required(),
    description: Joi.string().trim().max(500).optional(),
    tokensAmount: Joi.number().integer().min(1).required(),
    priceMinor: Joi.number().integer().min(0).required(),
    currency: Joi.string().trim().length(3).default("INR"),
    isActive: Joi.boolean().optional(),
  }),

  updateTokenPlan: Joi.object({
    name: Joi.string().trim().min(3).max(100).optional(),
    description: Joi.string().trim().max(500).optional(),
    tokensAmount: Joi.number().integer().min(1).optional(),
    priceMinor: Joi.number().integer().min(0).optional(),
    currency: Joi.string().trim().length(3).optional(),
    isActive: Joi.boolean().optional(),
  }).min(1),

  purchaseTokenPlan: Joi.object({
    planId: fields.objectId,
  }),

  walletCredit: Joi.object({
    driverId: fields.objectId,
    amount: Joi.number().integer().min(1).required(),
    reason: Joi.string().trim().max(200).optional(),
  }),

  walletDebit: Joi.object({
    driverId: fields.objectId,
    amount: Joi.number().integer().min(1).required(),
    reason: Joi.string().trim().max(200).optional(),
  }),

  leadTokensCreate: Joi.object({
    distanceKmFrom: Joi.number().min(0).required(),
    distanceKmTo: Joi.number().greater(Joi.ref('distanceKmFrom')).required(),
    tokensRequired: Joi.number().integer().min(0).required(),
    isActive: Joi.boolean().optional(),
  }),

  leadTokensUpdate: Joi.object({
    distanceKmFrom: Joi.number().min(0).optional(),
    distanceKmTo: Joi.number().greater(Joi.ref('distanceKmFrom')).optional(),
    tokensRequired: Joi.number().integer().min(0).optional(),
    isActive: Joi.boolean().optional(),
  }).min(1),

  tripTokensCreate: Joi.object({
    distanceKmFrom: Joi.number().min(0).required(),
    distanceKmTo: Joi.number().greater(Joi.ref('distanceKmFrom')).required(),
    tokensRequired: Joi.number().integer().min(0).required(),
    isActive: Joi.boolean().optional(),
  }),

  tripTokensUpdate: Joi.object({
    distanceKmFrom: Joi.number().min(0).optional(),
    distanceKmTo: Joi.number().greater(Joi.ref('distanceKmFrom')).optional(),
    tokensRequired: Joi.number().integer().min(0).optional(),
    isActive: Joi.boolean().optional(),
  }).min(1),

  freeTokenSettingsUpsert: Joi.object({
    tokensOnRegistration: Joi.number().integer().min(0).required(),
    isActive: Joi.boolean().optional(),
  }),
};

// Connect Request Schemas
const connectRequestSchemas = {
  sendRequest: Joi.object({
    recipientId: fields.objectId,
    customerRequestId: fields.objectId.required(),
    tripId: fields.objectId.required(),
    message: Joi.string().trim().max(500).optional(),
  }),

  respondToRequest: Joi.object({
    action: Joi.string().valid("accept", "reject").required(),
    rejectionReason: Joi.string().trim().max(200).optional(),
  }),

  acceptRequest: Joi.object({
    rejectionReason: Joi.string().trim().max(200).optional(),
  }),
};

module.exports = {
  authSchemas,
  userSchemas,
  vehicleSchemas,
  tripSchemas,
  bookingSchemas,
  customerRequestSchemas,
  subscriptionSchemas,
  driverConnectionSchemas,
  querySchemas,
  fileSchemas,
  patterns,
  fields,
  tokenSchemas,
  connectRequestSchemas,
};
