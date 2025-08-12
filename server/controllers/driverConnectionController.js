const driverConnections = require("../db/models/driver_connections");
const users = require("../db/models/users");
const { success, created, updated, badRequest, notFound, serverError } = require("../utils/response-handler");

/**
 * Send friend request by mobile number
 * @route POST /api/v1/driver-connections/request
 */
exports.sendFriendRequest = async (req, res) => {
  try {
    const { mobileNumber } = req.body;
    const requesterId = req.user.user_id;

    // Validate mobile number format
    if (!mobileNumber || !/^\+?[1-9]\d{7,14}$/.test(mobileNumber)) {
      const response = badRequest("Invalid mobile number format");
      return res.status(response.statusCode).json(response);
    }

    // Check if user is trying to send request to themselves
    const requester = await users.findById(requesterId);
    if (requester.phone === mobileNumber) {
      const response = badRequest("Cannot send friend request to yourself");
      return res.status(response.statusCode).json(response);
    }

    // Find user by mobile number
    const requestedUser = await users.findOne({ 
      phone : mobileNumber,
      isActive: true 
    });

    if (!requestedUser) {
      const response = notFound("User not found with this mobile number");
      return res.status(response.statusCode).json(response);
    }

    // Check if user is a driver
    const userType = await require("../db/models/user_types").findById(requestedUser.user_type);
    if (userType.name !== 'driver') {
      const response = badRequest("Can only send friend requests to drivers");
      return res.status(response.statusCode).json(response);
    }

    // Check if already connected
    const existingConnection = await driverConnections.findOne({
      $or: [
        { requester: requesterId, requested: requestedUser._id },
        { requester: requestedUser._id, requested: requesterId }
      ],
      isActive: true
    });

    if (existingConnection) {
      if (existingConnection.status === 'accepted') {
        const response = badRequest("Already friends");
        return res.status(response.statusCode).json(response);
      } else if (existingConnection.status === 'pending') {
        if (existingConnection.requester.toString() === requesterId) {
          const response = badRequest("Friend request already pending");
          return res.status(response.statusCode).json(response);
        } else {
          const response = badRequest("This driver has already sent you a friend request");
          return res.status(response.statusCode).json(response);
        }
      } else if (existingConnection.status === 'rejected') {
        // Allow resending request after rejection
        await driverConnections.findByIdAndUpdate(existingConnection._id, {
          status: 'pending',
          requestedAt: new Date(),
          respondedAt: null
        });
        
        const updatedConnection = await driverConnections.findById(existingConnection._id)
          .populate('requested', 'name mobileNumber');
        
        const response = updated(
          { connection: updatedConnection },
          "Friend request resent successfully"
        );
        return res.status(response.statusCode).json(response);
      }
    }

    // Create new connection
    const connection = await driverConnections.create({
      requester: requesterId,
      requested: requestedUser._id,
      status: 'pending'
    });

    const populatedConnection = await driverConnections.findById(connection._id)
      .populate('requested', 'name phone');

    const response = created(
      { connection: populatedConnection },
      "Friend request sent successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Send friend request error:", error);
    const response = serverError("Failed to send friend request");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get friend requests (pending/received)
 * @route GET /api/v1/driver-connections/requests
 */
exports.getFriendRequests = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { type = 'received' } = req.query; // 'received' or 'sent'

    let filter = { isActive: true };
    
    if (type === 'received') {
      filter.requested = userId;
      filter.status = 'pending';
    } else if (type === 'sent') {
      filter.requester = userId;
    } else {
      const response = badRequest("Type must be 'received' or 'sent'");
      return res.status(response.statusCode).json(response);
    }

    const connections = await driverConnections.find(filter)
      .populate('requester', 'name phone')
      .populate('requested', 'name phone')
      .sort({ requestedAt: -1 });

    const response = success(
      { connections },
      "Friend requests retrieved successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get friend requests error:", error);
    const response = serverError("Failed to retrieve friend requests");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Respond to friend request
 * @route PUT /api/v1/driver-connections/:connectionId/respond
 */
exports.respondToFriendRequest = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const { action } = req.body; // 'accept' or 'reject'
    const userId = req.user.user_id;

    if (!['accept', 'reject'].includes(action)) {
      const response = badRequest("Action must be 'accept' or 'reject'");
      return res.status(response.statusCode).json(response);
    }

    const connection = await driverConnections.findOne({
      _id: connectionId,
      $or: [
        { requester: userId },
        { requested: userId }
      ],
      status: 'pending',
      isActive: true
    });

    if (!connection) {
      const response = notFound("Friend request not found");
      return res.status(response.statusCode).json(response);
    }

    // Check if the user is the one who was requested (not the requester)
    if (connection.requester.toString() === userId) {
      const response = badRequest("You cannot respond to your own friend request");
      return res.status(response.statusCode).json(response);
    }

    const status = action === 'accept' ? 'accepted' : 'rejected';
    const respondedAt = new Date();

    const updatedConnection = await driverConnections.findByIdAndUpdate(
      connectionId,
      { status, respondedAt },
      { new: true }
    ).populate('requester', 'name phone')
     .populate('requested', 'name phone');

    const response = updated(
      { connection: updatedConnection },
      `Friend request ${status}`
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Respond to friend request error:", error);
    const response = serverError("Failed to respond to friend request");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Get confirmed friends list
 * @route GET /api/v1/driver-connections/friends
 */
exports.getFriendsList = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const friends = await driverConnections.find({
      $or: [
        { requester: userId },
        { requested: userId }
      ],
      status: 'accepted',
      isActive: true
    }).populate('requester', 'name phone')
      .populate('requested', 'name phone');

    // Format friends list to show friend details (not the current user)
    const friendsList = friends.map(connection => {
      const friend = connection.requester._id.toString() === userId 
        ? connection.requested 
        : connection.requester;
      return {
        _id: friend._id,
        name: friend.name,
        phone: friend.phone,
        connectionId: connection._id,
        connectedSince: connection.respondedAt
      };
    });

    const response = success(
      { friends: friendsList },
      "Friends list retrieved successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Get friends list error:", error);
    const response = serverError("Failed to retrieve friends list");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Remove friend connection
 * @route DELETE /api/v1/driver-connections/:connectionId
 */
exports.removeFriend = async (req, res) => {
  try {
    const { connectionId } = req.params;
    const userId = req.user.user_id;

    const connection = await driverConnections.findOne({
      _id: connectionId,
      $or: [
        { requester: userId },
        { requested: userId }
      ],
      status: 'accepted',
      isActive: true
    });

    if (!connection) {
      const response = notFound("Friend connection not found");
      return res.status(response.statusCode).json(response);
    }

    // Soft delete the connection
    await driverConnections.findByIdAndUpdate(connectionId, {
      isActive: false
    });

    const response = success(
      {},
      "Friend removed successfully"
    );

    return res.status(response.statusCode).json(response);

  } catch (error) {
    console.error("Remove friend error:", error);
    const response = serverError("Failed to remove friend");
    return res.status(response.statusCode).json(response);
  }
};
