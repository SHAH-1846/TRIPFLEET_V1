const express = require('express');
const router = express.Router();

const subscriptionController = require('../controllers/subscriptionController');

const {
  authenticateToken,
  requireRole,
  validateObjectId,
  sanitizeInput,
} = require('../utils/middleware');

// Admin routes
router.post('/plans', authenticateToken, requireRole(['admin']), sanitizeInput, subscriptionController.createPlan);
router.put('/plans/:planId', authenticateToken, requireRole(['admin']), validateObjectId('planId'), sanitizeInput, subscriptionController.updatePlan);
router.get('/plans', authenticateToken, requireRole(['admin', 'driver']), subscriptionController.listPlans);
router.delete('/plans/:planId', authenticateToken, requireRole(['admin']), validateObjectId('planId'), subscriptionController.deletePlan);

router.post('/lead-pricing', authenticateToken, requireRole(['admin']), sanitizeInput, subscriptionController.createLeadPricing);
router.put('/lead-pricing/:pricingId', authenticateToken, requireRole(['admin']), validateObjectId('pricingId'), sanitizeInput, subscriptionController.updateLeadPricing);
router.get('/lead-pricing', authenticateToken, requireRole(['admin']), subscriptionController.listLeadPricing);
router.delete('/lead-pricing/:pricingId', authenticateToken, requireRole(['admin']), validateObjectId('pricingId'), subscriptionController.deleteLeadPricing);

router.post('/trips-pricing', authenticateToken, requireRole(['admin']), sanitizeInput, subscriptionController.createTripsPricing);
router.put('/trips-pricing/:pricingId', authenticateToken, requireRole(['admin']), validateObjectId('pricingId'), sanitizeInput, subscriptionController.updateTripsPricing);
router.get('/trips-pricing', authenticateToken, requireRole(['admin']), subscriptionController.listTripsPricing);
router.delete('/trips-pricing/:pricingId', authenticateToken, requireRole(['admin']), validateObjectId('pricingId'), subscriptionController.deleteTripsPricing);

// Driver routes
router.post('/subscribe', authenticateToken, requireRole(['driver']), sanitizeInput, subscriptionController.subscribe);
router.post('/upgrade', authenticateToken, requireRole(['driver']), sanitizeInput, subscriptionController.upgrade);
router.post('/cancel', authenticateToken, requireRole(['driver']), sanitizeInput, subscriptionController.cancel);
router.get('/status', authenticateToken, requireRole(['driver']), subscriptionController.status);

module.exports = router;


