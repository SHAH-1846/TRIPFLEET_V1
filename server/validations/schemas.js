/**
 * Joi Validation Schemas
 * Comprehensive validation schemas for all API endpoints
 */

const Joi = require('joi');

// Common validation patterns
const patterns = {
  phone: /^\+?[1-9]\d{7,14}$/,
  vehicleNumber: /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{4}$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  objectId: /^[0-9a-fA-F]{24}$/
};

// Common field validations
const fields = {
  name: Joi.string().trim().min(2).max(50).required()
    .messages({
      'string.empty': 'Name is required',
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name cannot exceed 50 characters'
    }),
    
  email: Joi.string().email().lowercase().trim().required()
    .messages({
      'string.email': 'Please enter a valid email address',
      'string.empty': 'Email is required'
    }),
    
  phone: Joi.string().pattern(patterns.phone).required()
    .messages({
      'string.pattern.base': 'Please enter a valid international phone number (e.g. +919999999999)',
      'string.empty': 'Phone number is required'
    }),
    
  password: Joi.string().pattern(patterns.password).required()
    .messages({
      'string.pattern.base': 'Password must contain at least 8 characters, including uppercase, lowercase, number and special character',
      'string.empty': 'Password is required'
    }),
    
  objectId: Joi.string().pattern(patterns.objectId).required()
    .messages({
      'string.pattern.base': 'Invalid ID format',
      'string.empty': 'ID is required'
    }),
    
  boolean: Joi.boolean().required()
    .messages({
      'boolean.base': 'Must be true or false',
      'any.required': 'This field is required'
    })
};

// Auth Schemas
const authSchemas = {
  login: Joi.object({
    email: fields.email,
    password: Joi.string().required()
      .messages({
        'string.empty': 'Password is required'
      })
  }),

  requestOtp: Joi.object({
    phone: fields.phone
  }),

  verifyOtp: Joi.object({
    otp: Joi.string().pattern(/^\d{4,8}$/).required()
      .messages({
        'string.pattern.base': 'OTP must be 4-8 digits',
        'string.empty': 'OTP is required'
      })
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required()
      .messages({
        'string.empty': 'Refresh token is required'
      })
  })
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
    vehicleNumber: Joi.string().pattern(patterns.vehicleNumber).required()
      .messages({
        'string.pattern.base': 'Please enter a valid vehicle number (e.g. KA01AB1234)',
        'string.empty': 'Vehicle number is required'
      }),
    vehicleType: fields.objectId,
    vehicleBodyType: fields.objectId,
    vehicleCapacity: Joi.number().min(1).max(100).required()
      .messages({
        'number.base': 'Vehicle capacity must be a number',
        'number.min': 'Vehicle capacity must be at least 1 ton',
        'number.max': 'Vehicle capacity cannot exceed 100 tons'
      }),
    goodsAccepted: fields.boolean,
    registrationCertificate: fields.objectId,
    truckImages: Joi.array().items(fields.objectId).min(1).required()
      .messages({
        'array.min': 'At least one truck image is required',
        'array.base': 'Truck images must be an array'
      }),
    termsAndConditionsAccepted: fields.boolean,
    privacyPolicyAccepted: fields.boolean
  }),

  registerProfile: Joi.object({
    name: fields.name,
    email: fields.email,
    profilePicture: Joi.string().pattern(patterns.objectId).optional()
      .messages({
        'string.pattern.base': 'Invalid profile picture ID format'
      }),
    termsAndConditionsAccepted: fields.boolean,
    privacyPolicyAccepted: fields.boolean
  }),

  updateProfile: Joi.object({
    name: Joi.string().trim().min(2).max(50).optional(),
    email: Joi.string().email().lowercase().trim().optional(),
    whatsappNumber: Joi.string().pattern(patterns.phone).optional(),
    profilePicture: Joi.string().pattern(patterns.objectId).optional()
  }).min(1)
    .messages({
      'object.min': 'At least one field must be provided for update'
    }),

  updateUserType: Joi.object({
    userType: fields.objectId
  })
};

// Vehicle Schemas
const vehicleSchemas = {
  createVehicle: Joi.object({
    vehicleNumber: Joi.string().pattern(patterns.vehicleNumber).required(),
    vehicleType: fields.objectId,
    vehicleBodyType: fields.objectId,
    vehicleCapacity: Joi.number().min(1).max(100).required(),
    goodsAccepted: fields.boolean,
    registrationCertificate: fields.objectId,
    truckImages: Joi.array().items(fields.objectId).min(1).required()
  }),

  updateVehicle: Joi.object({
    vehicleNumber: Joi.string().pattern(patterns.vehicleNumber).optional(),
    vehicleType: fields.objectId.optional(),
    vehicleBodyType: fields.objectId.optional(),
    vehicleCapacity: Joi.number().min(1).max(100).optional(),
    goodsAccepted: fields.boolean.optional(),
    registrationCertificate: fields.objectId.optional(),
    truckImages: Joi.array().items(fields.objectId).min(1).optional()
  }).min(1)
};

// Trip Schemas
const tripSchemas = {
  createTrip: Joi.object({
    pickupLocation: Joi.object({
      address: Joi.string().trim().min(5).max(200).required(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).required()
    }).required(),
    dropLocation: Joi.object({
      address: Joi.string().trim().min(5).max(200).required(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).required(),
        lng: Joi.number().min(-180).max(180).required()
      }).required()
    }).required(),
    goodsType: Joi.string().trim().min(2).max(50).required(),
    weight: Joi.number().min(0.1).max(100).required(),
    description: Joi.string().trim().max(500).optional(),
    pickupDate: Joi.date().min('now').required(),
    budget: Joi.number().min(100).max(1000000).required()
  }),

  updateTrip: Joi.object({
    pickupLocation: Joi.object({
      address: Joi.string().trim().min(5).max(200).optional(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).optional(),
        lng: Joi.number().min(-180).max(180).optional()
      }).optional()
    }).optional(),
    dropLocation: Joi.object({
      address: Joi.string().trim().min(5).max(200).optional(),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90).optional(),
        lng: Joi.number().min(-180).max(180).optional()
      }).optional()
    }).optional(),
    goodsType: Joi.string().trim().min(2).max(50).optional(),
    weight: Joi.number().min(0.1).max(100).optional(),
    description: Joi.string().trim().max(500).optional(),
    pickupDate: Joi.date().min('now').optional(),
    budget: Joi.number().min(100).max(1000000).optional()
  }).min(1)
};

// Booking Schemas
const bookingSchemas = {
  createBooking: Joi.object({
    trip: fields.objectId,
    vehicle: fields.objectId,
    price: Joi.number().min(100).max(1000000).required(),
    pickupDate: Joi.date().min('now').required(),
    notes: Joi.string().trim().max(500).optional()
  }),

  updateBooking: Joi.object({
    price: Joi.number().min(100).max(1000000).optional(),
    pickupDate: Joi.date().min('now').optional(),
    notes: Joi.string().trim().max(500).optional(),
    status: Joi.string().valid('pending', 'confirmed', 'in_progress', 'completed', 'cancelled').optional()
  }).min(1)
};

// Customer Request Schemas
const customerRequestSchemas = {
  createRequest: Joi.object({
    title: Joi.string().trim().min(5).max(100).required(),
    description: Joi.string().trim().min(10).max(1000).required(),
    category: Joi.string().valid('general', 'technical', 'billing', 'support').required(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
    attachments: Joi.array().items(fields.objectId).optional()
  }),

  updateRequest: Joi.object({
    title: Joi.string().trim().min(5).max(100).optional(),
    description: Joi.string().trim().min(10).max(1000).optional(),
    category: Joi.string().valid('general', 'technical', 'billing', 'support').optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
    status: Joi.string().valid('open', 'in_progress', 'resolved', 'closed').optional()
  }).min(1)
};

// Query Schemas
const querySchemas = {
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid('createdAt', 'updatedAt', 'name', 'email').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  search: Joi.object({
    q: Joi.string().trim().min(1).max(100).optional(),
    status: Joi.string().optional(),
    category: Joi.string().optional(),
    dateFrom: Joi.date().optional(),
    dateTo: Joi.date().min(Joi.ref('dateFrom')).optional()
  })
};

// File Upload Schemas
const fileSchemas = {
  uploadImage: Joi.object({
    type: Joi.string().valid('profile', 'vehicle', 'document', 'general').required(),
    category: Joi.string().optional()
  }),

  uploadDocument: Joi.object({
    type: Joi.string().valid('license', 'registration', 'insurance', 'general').required(),
    category: Joi.string().optional()
  })
};

module.exports = {
  authSchemas,
  userSchemas,
  vehicleSchemas,
  tripSchemas,
  bookingSchemas,
  customerRequestSchemas,
  querySchemas,
  fileSchemas,
  patterns,
  fields
}; 