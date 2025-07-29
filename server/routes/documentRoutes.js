/**
 * Document Management Routes
 * Handles all document-related endpoints with proper authentication and authorization
 */

const express = require('express');
const router = express.Router();

// Controllers
const documentController = require('../controllers/documentController');

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

// Configure multer for document uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.body.type || 'general';
    const uploadPath = path.join(__dirname, '../uploads/documents', type);
    
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
    fileSize: 20 * 1024 * 1024, // 20MB limit
    files: 1 // Only allow 1 file at a time
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPEG, PNG, and WebP are allowed.'), false);
    }
  }
});

// Validation schemas
const { fileSchemas } = require('../validations/schemas');

/**
 * @route POST /api/v1/documents/upload
 * @desc Upload a new document
 * @access Private (authenticated users)
 */
router.post('/upload',
  authenticateToken,
  sanitizeInput,
  upload.single('document'),
  validateRequest(fileSchemas.uploadDocument),
  validateFileUpload([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ], 20 * 1024 * 1024),
  documentController.uploadDocument
);

/**
 * @route GET /api/v1/documents
 * @desc Get all documents with pagination and filtering
 * @access Private (authenticated users)
 */
router.get('/',
  authenticateToken,
  pagination,
  documentController.getAllDocuments
);

/**
 * @route GET /api/v1/documents/stats
 * @desc Get document statistics
 * @access Private (authenticated users)
 */
router.get('/stats',
  authenticateToken,
  documentController.getDocumentStats
);

/**
 * @route GET /api/v1/documents/:documentId
 * @desc Get specific document by ID
 * @access Private (authenticated users - document owner or admin)
 */
router.get('/:documentId',
  authenticateToken,
  validateObjectId('documentId'),
  documentController.getDocumentById
);

/**
 * @route PUT /api/v1/documents/:documentId
 * @desc Update document information
 * @access Private (document owner or admin)
 */
router.put('/:documentId',
  authenticateToken,
  validateObjectId('documentId'),
  sanitizeInput,
  validateRequest(fileSchemas.updateDocument),
  documentController.updateDocument
);

/**
 * @route DELETE /api/v1/documents/:documentId
 * @desc Delete document
 * @access Private (document owner or admin)
 */
router.delete('/:documentId',
  authenticateToken,
  validateObjectId('documentId'),
  documentController.deleteDocument
);

module.exports = router;