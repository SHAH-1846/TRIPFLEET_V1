// routes/reviews.js
const router = require('express').Router();
const { authenticateToken, requireRole, sanitizeInput } = require('../utils/middleware');
const reviewController = require('../controllers/reviewController');

router.post('/', authenticateToken, sanitizeInput, reviewController.create);
router.patch('/:reviewId', authenticateToken, sanitizeInput, reviewController.updateOwn);
router.post('/:reviewId/report', authenticateToken, sanitizeInput, reviewController.report);
router.get('/ratee/:userId', authenticateToken, sanitizeInput, reviewController.listForUser); // list reviews about a user
router.get('/booking/:bookingId', authenticateToken, sanitizeInput, reviewController.listForBooking);

module.exports = router;
