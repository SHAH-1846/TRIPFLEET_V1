/**
 * Connect Request Management Controller
 * Handles connect requests between drivers and customers via leads or trips
 */

const { Types } = require("mongoose");

// Models
const connect_requests = require("../db/models/connect_requests");
const customer_requests = require("../db/models/customer_requests");
const trips = require("../db/models/trips");
const users = require("../db/models/users");
const user_types = require("../db/models/user_types");
const tokenController = require("./tokenController");

// Utils
const {
  success,
  created,
  updated,
  deleted,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  serverError,
} = require("../utils/response-handler");

// Validation schemas
const { connectRequestSchemas } = require("../validations/schemas");

/**
 * Send a connect request to another user
 * @route POST /api/v1/connect-requests
 */
exports.sendRequest = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Validate request data
    const { error, value } = connectRequestSchemas.sendRequest.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      const response = badRequest("Validation failed", errors);
      return res.status(response.statusCode).json(response);
    }

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Check if recipient exists and is active
    const recipient = await users.findById(value.recipientId);
    if (!recipient || !recipient.isActive) {
      const response = notFound("Recipient not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Prevent self-connect requests
    if (userId === value.recipientId) {
      const response = badRequest("Cannot send connect request to yourself");
      return res.status(response.statusCode).json(response);
    }

    // Validate both customer request and trip exist and are active
    const customerRequest = await customer_requests.findById(value.customerRequestId);
    if (!customerRequest || !customerRequest.isActive) {
      const response = notFound("Customer request (lead) not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    const trip = await trips.findById(value.tripId);
    if (!trip || !trip.isActive) {
      const response = notFound("Trip not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Check if connect request already exists
    const existingRequest = await connect_requests.findOne({
      initiator: userId,
      recipient: value.recipientId,
      customerRequest: value.customerRequestId,
      trip: value.tripId,
      isActive: true,
    });

    if (existingRequest) {
      const response = conflict("Connect request already exists");
      return res.status(response.statusCode).json(response);
    }

    // Calculate tokens required for the lead (customer request)
    let tokensRequired = 0;
    let hasSufficientTokens = true;

    const distanceKm = customerRequest.distance?.value / 1000; // Convert meters to km
    tokensRequired = await tokenController.calculateLeadTokens(distanceKm);
    
    // Check if initiator has sufficient tokens (only for drivers)
    const userType = await user_types.findById(user.user_type);
    if (userType.name === "driver") {
      const TokenWallet = require("../db/models/token_wallets");
      const wallet = await TokenWallet.findOne({ driver: userId });
      hasSufficientTokens = wallet && wallet.balance >= tokensRequired;
    }

    // Create connect request
    const connectRequestData = {
      initiator: userId,
      recipient: value.recipientId,
      customerRequest: value.customerRequestId,
      trip: value.tripId,
      message: value.message,
      tokenDeduction: {
        tokensRequired,
      },
      hasSufficientTokens,
      addedBy: userId,
    };

    const newConnectRequest = await connect_requests.create(connectRequestData);

    // Populate request data for response
    const populatedRequest = await connect_requests
      .findById(newConnectRequest._id)
      .populate("initiator", "name email phone")
      .populate("recipient", "name email phone")
      .populate("customerRequest", "title description")
      .populate("trip", "title description");

    const response = created(
      { connectRequest: populatedRequest },
      "Connect request sent successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Send connect request error:", error);
    const response = serverError("Failed to send connect request");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Respond to a connect request (accept/reject)
 * @route PUT /api/v1/connect-requests/:requestId/respond
 */
exports.respondToRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.user_id;

    // Validate request data
    const { error, value } = connectRequestSchemas.respondToRequest.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      const response = badRequest("Validation failed", errors);
      return res.status(response.statusCode).json(response);
    }

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get connect request
    const connectRequest = await connect_requests.findById(requestId);
    if (!connectRequest || !connectRequest.isActive) {
      const response = notFound("Connect request not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user is the recipient
    if (connectRequest.recipient.toString() !== userId) {
      const response = forbidden("You can only respond to requests sent to you");
      return res.status(response.statusCode).json(response);
    }

    // Check if request is still pending
    if (connectRequest.status !== "pending") {
      const response = badRequest("Connect request is no longer pending");
      return res.status(response.statusCode).json(response);
    }

    let updateData = {
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    };

    if (value.action === "accept") {
      // Handle acceptance
      updateData = {
        ...updateData,
        status: "accepted",
        recipientAccepted: true,
        acceptedAt: new Date(),
      };

      // If this is a lead and the initiator is a driver, check tokens
      if (connectRequest.customerRequest) {
        const initiator = await users.findById(connectRequest.initiator);
        const initiatorType = await user_types.findById(initiator.user_type);
        
        if (initiatorType.name === "driver") {
          // Check if driver has sufficient tokens
          if (!connectRequest.hasSufficientTokens) {
            updateData.status = "pending";
            updateData.recipientAccepted = false;
            updateData.acceptedAt = null;
            
            const updatedRequest = await connect_requests.findByIdAndUpdate(
              requestId,
              updateData,
              { new: true }
            );

            const response = badRequest(
              "Your connectRequest was accepted by the customer, but you do not have enough tokens to view this lead's contact details."
            );
            return res.status(response.statusCode).json(response);
          }

          // Deduct tokens from driver's wallet
          try {
            await tokenController.debitTokens(
              connectRequest.initiator,
              connectRequest.tokenDeduction.tokensRequired,
              `Connect request accepted for lead: ${connectRequest.customerRequest}`,
              userId
            );

            updateData["tokenDeduction.tokensDeducted"] = connectRequest.tokenDeduction.tokensRequired;
            updateData["tokenDeduction.deductedAt"] = new Date();
          } catch (error) {
            console.error("Token deduction failed:", error);
            const response = badRequest("Insufficient tokens to accept this request");
            return res.status(response.statusCode).json(response);
          }
        }
      }

      // Check if both parties have accepted (for mutual acceptance)
      if (connectRequest.initiatorAccepted) {
        updateData.contactDetailsShared = true;
        updateData.contactDetailsSharedAt = new Date();
      }
    } else if (value.action === "reject") {
      // Handle rejection
      updateData = {
        ...updateData,
        status: "rejected",
        rejectedAt: new Date(),
        rejectionReason: value.rejectionReason,
      };
    }

    const updatedRequest = await connect_requests.findByIdAndUpdate(
      requestId,
      updateData,
      { new: true }
    );

    // Populate request data for response
    const populatedRequest = await connect_requests
      .findById(updatedRequest._id)
      .populate("initiator", "name email phone")
      .populate("recipient", "name email phone")
      .populate("customerRequest", "title description")
      .populate("trip", "title description");

    const response = updated(
      { connectRequest: populatedRequest },
      `Connect request ${value.action}ed successfully`
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Respond to connect request error:", error);
    const response = serverError("Failed to respond to connect request");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Accept a connect request (for mutual acceptance)
 * @route PUT /api/v1/connect-requests/:requestId/accept
 */
exports.acceptRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get connect request
    const connectRequest = await connect_requests.findById(requestId);
    if (!connectRequest || !connectRequest.isActive) {
      const response = notFound("Connect request not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user is the initiator
    if (connectRequest.initiator.toString() !== userId) {
      const response = forbidden("You can only accept requests you initiated");
      return res.status(response.statusCode).json(response);
    }

    // Check if request is accepted by recipient
    if (!connectRequest.recipientAccepted) {
      const response = badRequest("Recipient has not accepted this request yet");
      return res.status(response.statusCode).json(response);
    }

    // Check if already accepted by initiator
    if (connectRequest.initiatorAccepted) {
      const response = badRequest("Request already accepted by initiator");
      return res.status(response.statusCode).json(response);
    }

    // Update request
    const updateData = {
      initiatorAccepted: true,
      initiatorAcceptedAt: new Date(),
      contactDetailsShared: true,
      contactDetailsSharedAt: new Date(),
      lastUpdatedBy: userId,
      updatedAt: new Date(),
    };

    const updatedRequest = await connect_requests.findByIdAndUpdate(
      requestId,
      updateData,
      { new: true }
    );

    // Populate request data for response
    const populatedRequest = await connect_requests
      .findById(updatedRequest._id)
      .populate("initiator", "name email phone")
      .populate("recipient", "name email phone")
      .populate("customerRequest", "title description")
      .populate("trip", "title description");

    const response = updated(
      { connectRequest: populatedRequest },
      "Connect request accepted successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Accept connect request error:", error);
    const response = serverError("Failed to accept connect request");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get connect requests for the current user
 * @route GET /api/v1/connect-requests
 */
exports.getConnectRequests = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 10, status, type } = req.query;
    const skip = (page - 1) * limit;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Build filter
    const filter = { isActive: true };
    
    if (type === "sent") {
      filter.initiator = userId;
    } else if (type === "received") {
      filter.recipient = userId;
    } else {
      // Default: show both sent and received
      filter.$or = [{ initiator: userId }, { recipient: userId }];
    }

    if (status) {
      filter.status = status;
    }

    // Get connect requests with pagination
    const requests = await connect_requests
      .find(filter)
      .populate("initiator", "name email phone")
      .populate("recipient", "name email phone")
      .populate("customerRequest", "title description")
      .populate("trip", "title description")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await connect_requests.countDocuments(filter);

    const response = success(
      { requests },
      "Connect requests retrieved successfully",
      200,
      {
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      }
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get connect requests error:", error);
    const response = serverError("Failed to retrieve connect requests");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get specific connect request by ID
 * @route GET /api/v1/connect-requests/:requestId
 */
exports.getConnectRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get connect request
    const connectRequest = await connect_requests
      .findById(requestId)
      .populate("initiator", "name email phone")
      .populate("recipient", "name email phone")
      .populate("customerRequest", "title description")
      .populate("trip", "title description");

    if (!connectRequest || !connectRequest.isActive) {
      const response = notFound("Connect request not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user is involved in this request
    if (
      connectRequest.initiator._id.toString() !== userId &&
      connectRequest.recipient._id.toString() !== userId
    ) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Include contact details if both parties have accepted
    let contactDetails = null;
    if (connectRequest.contactDetailsShared) {
      const isInitiator = connectRequest.initiator._id.toString() === userId;
      const otherParty = isInitiator ? connectRequest.recipient : connectRequest.initiator;
      
      contactDetails = {
        name: otherParty.name,
        email: otherParty.email,
        phone: otherParty.phone,
      };
    }

    const response = success(
      { connectRequest, contactDetails },
      "Connect request retrieved successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get connect request by ID error:", error);
    const response = serverError("Failed to retrieve connect request");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Delete a connect request (soft delete)
 * @route DELETE /api/v1/connect-requests/:requestId
 */
exports.deleteConnectRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get connect request
    const connectRequest = await connect_requests.findById(requestId);
    if (!connectRequest || !connectRequest.isActive) {
      const response = notFound("Connect request not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user is the initiator
    if (connectRequest.initiator.toString() !== userId) {
      const response = forbidden("Only the initiator can delete this request");
      return res.status(response.statusCode).json(response);
    }

    // Check if request can be deleted
    if (connectRequest.status === "accepted") {
      const response = badRequest("Cannot delete accepted connect request");
      return res.status(response.statusCode).json(response);
    }

    // Soft delete
    const updatedRequest = await connect_requests.findByIdAndUpdate(
      requestId,
      {
        isActive: false,
        deletedBy: userId,
        updatedAt: new Date(),
      },
      { new: true }
    );

    const response = deleted(
      { connectRequest: updatedRequest },
      "Connect request deleted successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Delete connect request error:", error);
    const response = serverError("Failed to delete connect request");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get detailed verification information for a connect request
 * This allows users to cross-check both customer request and trip before accepting
 * @route GET /api/v1/connect-requests/:requestId/verification
 */
exports.getConnectRequestVerification = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.user_id;

    // Check if user exists and is active
    const user = await users.findById(userId);
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Get connect request with basic info
    const connectRequest = await connect_requests.findById(requestId);
    if (!connectRequest || !connectRequest.isActive) {
      const response = notFound("Connect request not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if user is involved in this request
    if (
      connectRequest.initiator.toString() !== userId &&
      connectRequest.recipient.toString() !== userId
    ) {
      const response = forbidden("Access denied");
      return res.status(response.statusCode).json(response);
    }

    // Get detailed information for cross-verification
    const customerRequestDetails = await customer_requests
      .findById(connectRequest.customerRequest)
      .populate("user", "name email phone")
      .populate("status", "name")
      .select("-__v");

    const tripDetails = await trips
      .findById(connectRequest.trip)
      .populate("user", "name email phone")
      .populate("driver", "name email phone")
      .populate("vehicle", "model make year")
      .populate("goodsType", "name")
      .populate("status", "name")
      .select("-__v");

    if (!customerRequestDetails || !tripDetails) {
      const response = notFound("Customer request or trip details not found");
      return res.status(response.statusCode).json(response);
    }

    // Calculate distance compatibility
    const customerRequestDistance = customerRequestDetails.distance?.value || 0;
    const tripDistance = tripDetails.distance?.value || 0;
    const distanceDifference = Math.abs(customerRequestDistance - tripDistance);
    const distanceCompatibility = distanceDifference <= 5000; // Within 5km

    // Calculate location compatibility (pickup and dropoff)
    const pickupCompatibility = {
      customerRequest: customerRequestDetails.pickupLocation,
      trip: tripDetails.tripStartLocation,
      distance: null, // Will be calculated if coordinates exist
    };

    const dropoffCompatibility = {
      customerRequest: customerRequestDetails.dropoffLocation,
      trip: tripDetails.tripDestination,
      distance: null, // Will be calculated if coordinates exist
    };

    // Calculate distances if coordinates are available
    if (pickupCompatibility.customerRequest.coordinates && pickupCompatibility.trip.coordinates) {
      pickupCompatibility.distance = calculateDistance(
        pickupCompatibility.customerRequest.coordinates,
        pickupCompatibility.trip.coordinates
      );
    }

    if (dropoffCompatibility.customerRequest.coordinates && dropoffCompatibility.trip.coordinates) {
      dropoffCompatibility.distance = calculateDistance(
        dropoffCompatibility.customerRequest.coordinates,
        dropoffCompatibility.trip.coordinates
      );
    }

    const verificationData = {
      connectRequest: {
        id: connectRequest._id,
        status: connectRequest.status,
        initiatorAccepted: connectRequest.initiatorAccepted,
        recipientAccepted: connectRequest.recipientAccepted,
        message: connectRequest.message,
        createdAt: connectRequest.createdAt,
      },
      customerRequest: {
        id: customerRequestDetails._id,
        title: customerRequestDetails.title,
        description: customerRequestDetails.description,
        pickupLocation: customerRequestDetails.pickupLocation,
        dropoffLocation: customerRequestDetails.dropoffLocation,
        distance: customerRequestDetails.distance,
        duration: customerRequestDetails.duration,
        packageDetails: customerRequestDetails.packageDetails,
        status: customerRequestDetails.status,
        user: customerRequestDetails.user,
        pickupTime: customerRequestDetails.pickupTime,
        createdAt: customerRequestDetails.createdAt,
      },
      trip: {
        id: tripDetails._id,
        title: tripDetails.title,
        description: tripDetails.description,
        tripStartLocation: tripDetails.tripStartLocation,
        tripDestination: tripDetails.tripDestination,
        viaRoutes: tripDetails.viaRoutes,
        distance: tripDetails.distance,
        duration: tripDetails.duration,
        goodsType: tripDetails.goodsType,
        vehicle: tripDetails.vehicle,
        driver: tripDetails.driver,
        tripStartDate: tripDetails.tripStartDate,
        tripEndDate: tripDetails.tripEndDate,
        status: tripDetails.status,
        createdAt: tripDetails.createdAt,
      },
      compatibility: {
        distance: {
          customerRequest: customerRequestDistance,
          trip: tripDistance,
          difference: distanceDifference,
          isCompatible: distanceCompatibility,
        },
        pickup: pickupCompatibility,
        dropoff: dropoffCompatibility,
        overall: distanceCompatibility && 
                (pickupCompatibility.distance === null || pickupCompatibility.distance <= 5000) &&
                (dropoffCompatibility.distance === null || dropoffCompatibility.distance <= 5000),
      },
      tokenInfo: {
        tokensRequired: connectRequest.tokenDeduction.tokensRequired,
        hasSufficientTokens: connectRequest.hasSufficientTokens,
      },
    };

    const response = success(
      { verification: verificationData },
      "Connect request verification details retrieved successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get connect request verification error:", error);
    const response = serverError("Failed to retrieve verification details");
    return res.status(response.statusCode).json(response);
  }
};

// Helper function to calculate distance between two coordinate points
function calculateDistance(coord1, coord2) {
  if (!coord1 || !coord2 || coord1.length !== 2 || coord2.length !== 2) {
    return null;
  }

  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;

  // Haversine formula to calculate distance in meters
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance);
}
