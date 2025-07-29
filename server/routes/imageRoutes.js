/**
 * Image Management Routes
 * Handles all image-related endpoints with proper authentication and authorization
 */

const express = require('express');
const router = express.Router();

// Controllers
const imageController = require('../controllers/imagesController');

// Middleware
const { 
  authenticateToken, 
  requireRole, 
  validateRequest, 
  sanitizeInput,
  validateObjectId,
  validateFileUpload,
  pagination
} = require('../utils/middleware');

// Upload middleware
const multer = require('multer');
const path = require('path');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.body.type || 'general';
    const uploadPath = path.join(__dirname, '../uploads/images', type);
    
    // Create directory if it doesn't exist
    const fs = require('fs');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate temporary filename (will be renamed in controller)
    const tempName = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}${path.extname(file.originalname)}`;
    cb(null, tempName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Only allow 1 file at a time
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'), false);
    }
  }
});

// Validation schemas
const { fileSchemas } = require('../validations/schemas');

/**
 * @route POST /api/v1/images/upload
 * @desc Upload a new image
 * @access Private (authenticated users)
 */
router.post('/upload',
  authenticateToken,
  sanitizeInput,
  upload.single('image'),
  validateRequest(fileSchemas.uploadImage),
  validateFileUpload(['image/jpeg', 'image/png', 'image/webp', 'image/gif'], 10 * 1024 * 1024),
  imageController.uploadImage
);

/**
 * @route GET /api/v1/images
 * @desc Get all images with pagination and filtering
 * @access Private (authenticated users)
 */
router.get('/',
  authenticateToken,
  pagination,
  imageController.getAllImages
);

/**
 * @route GET /api/v1/images/stats
 * @desc Get image statistics
 * @access Private (authenticated users)
 */
router.get('/stats',
  authenticateToken,
  imageController.getImageStats
);

/**
 * @route GET /api/v1/images/:imageId
 * @desc Get specific image by ID
 * @access Private (authenticated users - image owner or admin)
 */
router.get('/:imageId',
  authenticateToken,
  validateObjectId('imageId'),
  imageController.getImageById
);

/**
 * @route PUT /api/v1/images/:imageId
 * @desc Update image information
 * @access Private (image owner or admin)
 */
router.put('/:imageId',
  authenticateToken,
  validateObjectId('imageId'),
  sanitizeInput,
  validateRequest(fileSchemas.updateImage),
  imageController.updateImage
);

/**
 * @route DELETE /api/v1/images/:imageId
 * @desc Delete image
 * @access Private (image owner or admin)
 */
router.delete('/:imageId',
  authenticateToken,
  validateObjectId('imageId'),
  imageController.deleteImage
);

module.exports = router;