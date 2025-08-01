/**
 * Vehicle Management Routes
 * Handles all vehicle-related endpoints with proper authentication and authorization
 */

const express = require("express");
const router = express.Router();

// Controllers
const vehicleController = require("../controllers/vehicleController");

// Middleware
const {
  authenticateToken,
  requireRole,
  validateRequest,
  sanitizeInput,
  validateObjectId,
  pagination,
} = require("../utils/middleware");

// Validation schemas
const { vehicleSchemas } = require("../validations/schemas");

/**
 * @route POST /api/v1/vehicles
 * @desc Create a new vehicle
 * @access Private (driver users)
 */
router.post(
  "/",
  authenticateToken,
  requireRole(["driver"]),
  sanitizeInput,
  validateRequest(vehicleSchemas.createVehicle),
  vehicleController.createVehicle
);

/**
 * @route GET /api/v1/vehicles/types
 * @desc Get all vehicle types
 * @access Private (authenticated users)
 */
router.get(
  "/types",
  authenticateToken,
  requireRole(["admin", "driver", "customer"]),
  vehicleController.getAllVehicleTypes
);

/**
 * @route GET /api/v1/vehicles/goods-accepted
 * @desc Get all goods accepted types
 * @access Private (authenticated users)
 */
router.get(
  "/goods-accepted",
  authenticateToken,
  requireRole(["admin", "driver", "customer"]),
  vehicleController.getAllGoodsAccepted
);

/**
 * @route GET /api/v1/vehicles/body-types
 * @desc Get all vehicle body types
 * @access Private (authenticated users)
 */
router.get(
  "/body-types",
  authenticateToken,
  requireRole(["admin", "driver", "customer"]),
  vehicleController.getAllVehicleBodyTypes
);

/**
 * @route GET /api/v1/vehicles
 * @desc Get all vehicles with pagination and filtering
 * @access Private (authenticated users)
 */
router.get(
  "/",
  authenticateToken,
  pagination,
  vehicleController.getAllVehicles
);

/**
 * @route GET /api/v1/vehicles/stats
 * @desc Get vehicle statistics
 * @access Private (authenticated users)
 */
router.get("/stats", authenticateToken, vehicleController.getVehicleStats);

/**
 * @route GET /api/v1/vehicles/:vehicleId
 * @desc Get specific vehicle by ID
 * @access Private (authenticated users - vehicle owner or admin)
 */
router.get(
  "/:vehicleId",
  authenticateToken,
  validateObjectId("vehicleId"),
  vehicleController.getVehicleById
);

/**
 * @route PUT /api/v1/vehicles/:vehicleId
 * @desc Update vehicle information
 * @access Private (vehicle owner or admin)
 */
router.put(
  "/:vehicleId",
  authenticateToken,
  validateObjectId("vehicleId"),
  sanitizeInput,
  validateRequest(vehicleSchemas.updateVehicle),
  vehicleController.updateVehicle
);

/**
 * @route PUT /api/v1/vehicles/:vehicleId/availability
 * @desc Update vehicle availability status
 * @access Private (vehicle owner or admin)
 */
router.put(
  "/:vehicleId/availability",
  authenticateToken,
  validateObjectId("vehicleId"),
  sanitizeInput,
  validateRequest(vehicleSchemas.updateAvailability),
  vehicleController.updateVehicleAvailability
);

/**
 * @route PUT /api/v1/vehicles/:vehicleId/verify
 * @desc Verify vehicle (admin only)
 * @access Private (admin users)
 */
router.put(
  "/:vehicleId/verify",
  authenticateToken,
  requireRole(["admin"]),
  validateObjectId("vehicleId"),
  sanitizeInput,
  validateRequest(vehicleSchemas.verifyVehicle),
  vehicleController.verifyVehicle
);

/**
 * @route DELETE /api/v1/vehicles/:vehicleId
 * @desc Delete vehicle (soft delete)
 * @access Private (vehicle owner or admin)
 */
router.delete(
  "/:vehicleId",
  authenticateToken,
  validateObjectId("vehicleId"),
  vehicleController.deleteVehicle
);

module.exports = router;
