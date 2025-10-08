const express = require('express');
const router = express.Router();

const tokenController = require('../controllers/tokenController');

const {
  authenticateToken,
  requireRole,
  validateObjectId,
  sanitizeInput,
} = require('../utils/middleware');

// Admin: token purchase plans
router.post('/plans', authenticateToken, requireRole(['admin']), sanitizeInput, tokenController.createTokenPlan);
router.put('/plans/:planId', authenticateToken, requireRole(['admin']), validateObjectId('planId'), sanitizeInput, tokenController.updateTokenPlan);
router.get('/plans', authenticateToken, requireRole(['admin','driver']), tokenController.listTokenPlans);
router.delete('/plans/:planId', authenticateToken, requireRole(['admin']), validateObjectId('planId'), tokenController.deleteTokenPlan);

// Driver: purchase plan
router.post('/purchase', authenticateToken, requireRole(['driver']), sanitizeInput, tokenController.purchaseTokenPlan);

// Admin: wallet operations
router.post('/wallet/credit', authenticateToken, requireRole(['admin']), sanitizeInput, tokenController.credit);
router.post('/wallet/debit', authenticateToken, requireRole(['admin']), sanitizeInput, tokenController.debit);

// Driver: wallet balance
router.get('/wallet/balance', authenticateToken, requireRole(['driver']), tokenController.balance);

// Token usage calculation
router.get('/usage/trip', authenticateToken, requireRole(['driver', 'admin']), tokenController.getTripTokenUsage);
router.get('/usage/lead', authenticateToken, requireRole(['driver', 'admin']), tokenController.getLeadTokenUsage);

// Admin: token usage bands for leads
router.post('/lead-bands', authenticateToken, requireRole(['admin']), sanitizeInput, tokenController.createLeadTokens);
router.put('/lead-bands/:bandId', authenticateToken, requireRole(['admin']), validateObjectId('bandId'), sanitizeInput, tokenController.updateLeadTokens);
router.get('/lead-bands', authenticateToken, requireRole(['admin']), tokenController.listLeadTokens);
router.delete('/lead-bands/:bandId', authenticateToken, requireRole(['admin']), validateObjectId('bandId'), tokenController.deleteLeadTokens);

// Admin: token usage bands for trips
router.post('/trip-bands', authenticateToken, requireRole(['admin']), sanitizeInput, tokenController.createTripTokens);
router.put('/trip-bands/:bandId', authenticateToken, requireRole(['admin']), validateObjectId('bandId'), sanitizeInput, tokenController.updateTripTokens);
router.get('/trip-bands', authenticateToken, requireRole(['admin']), tokenController.listTripTokens);
router.delete('/trip-bands/:bandId', authenticateToken, requireRole(['admin']), validateObjectId('bandId'), tokenController.deleteTripTokens);

// Admin: free tokens settings
router.post('/free-tokens', authenticateToken, requireRole(['admin']), sanitizeInput, tokenController.upsertFreeTokenSettings);

router.post(
  '/booking-reward-settings',
  authenticateToken,
  requireRole(['admin']),
  sanitizeInput,
  tokenController.upsertBookingRewardSettings
);

router.get('/compute-booking-reward', tokenController.getBookingReward);


module.exports = router;
