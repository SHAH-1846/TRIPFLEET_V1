/**
 * Comprehensive Middleware Collection
 * Provides security, validation, and utility middleware functions
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Types } = require('mongoose');
const { unauthorized, forbidden, serverError } = require('./response-handler');

// Rate Limiting Configuration
const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests') => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      statusCode: 429,
      message,
      timestamp: new Date().toISOString()
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Auth Rate Limiter (stricter for auth endpoints)
exports.authRateLimiter = createRateLimiter(15 * 60 * 1000, 5, 'Too many authentication attempts');

// General Rate Limiter
exports.generalRateLimiter = createRateLimiter(15 * 60 * 1000, 100, 'Too many requests');

// API Rate Limiter
exports.apiRateLimiter = createRateLimiter(15 * 60 * 1000, 1000, 'API rate limit exceeded');

// Enhanced Security Headers
exports.securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// CORS Configuration
exports.corsOptions = cors({
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3002', 'https://hoppscotch.io', 'https://truck-api-qyew.onrender.com'];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});

// JWT Authentication Middleware
exports.authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      const response = unauthorized('Access token required');
      return res.status(response.statusCode).json(response);
    }

    jwt.verify(token, process.env.PRIVATE_KEY, (err, decoded) => {
      if (err) {
        const response = unauthorized('Invalid or expired token');
        return res.status(response.statusCode).json(response);
      }
      
      req.user = decoded;
      next();
    });
  } catch (error) {
    const response = serverError('Authentication error');
    return res.status(response.statusCode).json(response);
  }
};

// Role-based Access Control
exports.requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        const response = unauthorized('Authentication required');
        return res.status(response.statusCode).json(response);
      }

      const user = await require('../db/models/users').findById(req.user.user_id);
      if (!user) {
        const response = unauthorized('User not found');
        return res.status(response.statusCode).json(response);
      }

      const userType = await require('../db/models/user_types').findById(user.user_type);
      if (!userType) {
        const response = forbidden('Invalid user type');
        return res.status(response.statusCode).json(response);
      }

      if (!allowedRoles.includes(userType.name)) {
        const response = forbidden('Insufficient permissions');
        return res.status(response.statusCode).json(response);
      }

      req.userRole = userType.name;
      next();
    } catch (error) {
      const response = serverError('Authorization error');
      return res.status(response.statusCode).json(response);
    }
  };
};

// Input Sanitization Middleware
exports.sanitizeInput = (req, res, next) => {
  const isPlainObject = (val) => {
    return Object.prototype.toString.call(val) === '[object Object]';
  };
  const sanitize = (obj) => {
    if (!isPlainObject(obj)) return obj;
    for (let key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (typeof obj[key] === 'string') {
          // Remove script tags and dangerous content
          obj[key] = obj[key]
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();
        } else if (isPlainObject(obj[key])) {
          sanitize(obj[key]);
        }
        // Do not recurse into arrays, Buffers, etc.
      }
    }
  };

  sanitize(req.body);
  sanitize(req.query);
  sanitize(req.params);
  
  next();
};

// Request Validation Middleware
exports.validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const { error, value } = schema.validate(req.body, { 
        abortEarly: false, 
        stripUnknown: true 
      });

      if (error) {
        // If a file was uploaded, delete it to prevent orphaned files
        if (req.file && req.file.path) {
          const fs = require('fs');
          fs.unlink(req.file.path, (err) => {
            if (err) {
              console.error('Failed to delete orphaned upload:', req.file.path, err);
            }
          });
        }
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        const response = require('./response-handler').validationError('Validation failed', errors);
        return res.status(response.statusCode).json(response);
      }

      req.body = value;
      next();
    } catch (error) {
      // Also clean up file if an unexpected error occurs
      if (req.file && req.file.path) {
        const fs = require('fs');
        fs.unlink(req.file.path, (err) => {
          if (err) {
            console.error('Failed to delete orphaned upload:', req.file.path, err);
          }
        });
      }
      const response = serverError('Validation error');
      return res.status(response.statusCode).json(response);
    }
  };
};

// ObjectId Validation Middleware
exports.validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!Types.ObjectId.isValid(id)) {
      const response = require('./response-handler').badRequest(`Invalid ${paramName} format`);
      return res.status(response.statusCode).json(response);
    }
    
    next();
  };
};

// File Upload Validation
exports.validateFileUpload = (allowedTypes = ['image/jpeg', 'image/png', 'image/webp'], maxSize = 5 * 1024 * 1024) => {
  return (req, res, next) => {
    if (!req.file) {
      const response = require('./response-handler').badRequest('File is required');
      return res.status(response.statusCode).json(response);
    }

    if (!allowedTypes.includes(req.file.mimetype)) {
      const response = require('./response-handler').badRequest('Invalid file type');
      return res.status(response.statusCode).json(response);
    }

    if (req.file.size > maxSize) {
      const response = require('./response-handler').badRequest('File size too large');
      return res.status(response.statusCode).json(response);
    }

    next();
  };
};

// Error Handling Middleware
exports.errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(error => ({
      field: error.path,
      message: error.message
    }));
    
    const response = require('./response-handler').validationError('Validation failed', errors);
    return res.status(response.statusCode).json(response);
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const response = require('./response-handler').conflict(`${field} already exists`);
    return res.status(response.statusCode).json(response);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const response = unauthorized('Invalid token');
    return res.status(response.statusCode).json(response);
  }

  if (err.name === 'TokenExpiredError') {
    const response = unauthorized('Token expired');
    return res.status(response.statusCode).json(response);
  }

  // Default error
  const response = serverError('Internal server error');
  return res.status(response.statusCode).json(response);
};

// Request Logging Middleware
exports.requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  
  next();
};

// Pagination Middleware
exports.pagination = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 10, 100); // Max 100 items per page
  const skip = (page - 1) * limit;

  req.pagination = { page, limit, skip };
  next();
}; 