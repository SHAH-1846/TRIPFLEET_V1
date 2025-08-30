# Connect Request API Documentation

## Overview

The Connect Request module enables **drivers and customers** to connect with each other via **leads (customerRequests)** and **trips**. The main goal is to allow users to **view contact details** of the other party once both sides agree to the connection.

## Key Features

- **Dual Entity Requirement**: Every connect request must reference both a `customerRequest` (lead) and a `trip`
- **Cross-Verification**: Users can verify both entities before accepting connections
- **Token-Based System**: Token deduction for lead-based connections based on distance
- **Mutual Acceptance**: Both parties must accept for contact details to be shared
- **Compatibility Analysis**: Automatic calculation of distance and location compatibility

## Flow

1. **Sending Requests**: Users send connect requests with references to both customer request and trip
2. **Cross-Verification**: Recipients can verify both entities using the verification endpoint
3. **Acceptance**: The receiving party can accept or reject the request
4. **Token Deduction**: For lead-based requests, tokens are deducted from driver's wallet
5. **Mutual Acceptance**: Both parties must accept for contact details to be shared
6. **Contact Sharing**: Once both accept, contact details are shared for communication

## Authentication

All endpoints require a valid JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## Endpoints

### 1. Send Connect Request

**POST** `/api/v1/connect-requests`

Send a connect request to another user with references to both customer request and trip.

**Request Body:**
```json
{
  "recipientId": "user_id_here",
  "customerRequestId": "customer_request_id_here",
  "tripId": "trip_id_here",
  "message": "Optional message to recipient"
}
```

**Response:**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Connect request sent successfully",
  "data": {
    "connectRequest": {
      "_id": "request_id",
      "initiator": {
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "+1234567890"
      },
      "recipient": {
        "name": "Jane Smith",
        "email": "jane@example.com",
        "phone": "+0987654321"
      },
      "customerRequest": {
        "title": "Package Delivery",
        "description": "Need to deliver package from NYC to Boston"
      },
      "trip": {
        "title": "NYC to Boston Route",
        "description": "Regular route from NYC to Boston"
      },
      "status": "pending",
      "message": "Optional message to recipient",
      "tokenDeduction": {
        "tokensRequired": 5
      },
      "hasSufficientTokens": true,
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  }
}
```

### 2. Get Connect Request Verification

**GET** `/api/v1/connect-requests/:requestId/verification`

Get detailed information about both the customer request and trip for cross-verification before accepting.

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Connect request verification details retrieved successfully",
  "data": {
    "verification": {
      "connectRequest": {
        "id": "request_id",
        "status": "pending",
        "initiatorAccepted": false,
        "recipientAccepted": false,
        "message": "Optional message",
        "createdAt": "2025-01-15T10:30:00.000Z"
      },
      "customerRequest": {
        "id": "customer_request_id",
        "title": "Package Delivery",
        "description": "Need to deliver package from NYC to Boston",
        "pickupLocation": {
          "address": "123 Main St, New York, NY",
          "coordinates": [-74.006, 40.7128]
        },
        "dropoffLocation": {
          "address": "456 Oak Ave, Boston, MA",
          "coordinates": [-71.0589, 42.3601]
        },
        "distance": {
          "value": 300000,
          "text": "300 km"
        },
        "duration": {
          "value": 10800,
          "text": "3 hours"
        },
        "packageDetails": {
          "weight": 25,
          "dimensions": {
            "length": 50,
            "width": 30,
            "height": 20
          },
          "description": "Fragile electronics package"
        },
        "status": {
          "name": "Active"
        },
        "user": {
          "name": "John Doe",
          "email": "john@example.com",
          "phone": "+1234567890"
        },
        "pickupTime": "2025-01-16T09:00:00.000Z",
        "createdAt": "2025-01-15T08:00:00.000Z"
      },
      "trip": {
        "id": "trip_id",
        "title": "NYC to Boston Route",
        "description": "Regular route from NYC to Boston",
        "tripStartLocation": {
          "address": "125 Main St, New York, NY",
          "coordinates": [-74.006, 40.7128]
        },
        "tripDestination": {
          "address": "458 Oak Ave, Boston, MA",
          "coordinates": [-71.0589, 42.3601]
        },
        "viaRoutes": [
          {
            "address": "Hartford, CT",
            "coordinates": [-72.6734, 41.7658]
          }
        ],
        "distance": {
          "value": 305000,
          "text": "305 km"
        },
        "duration": {
          "value": 11000,
          "text": "3 hours 3 minutes"
        },
        "goodsType": {
          "name": "General Cargo"
        },
        "vehicle": {
          "model": "Sprinter",
          "make": "Mercedes-Benz",
          "year": 2022
        },
        "driver": {
          "name": "Jane Smith",
          "email": "jane@example.com",
          "phone": "+0987654321"
        },
        "tripStartDate": "2025-01-16T08:00:00.000Z",
        "tripEndDate": "2025-01-16T11:00:00.000Z",
        "status": {
          "name": "Scheduled"
        },
        "createdAt": "2025-01-15T09:00:00.000Z"
      },
      "compatibility": {
        "distance": {
          "customerRequest": 300000,
          "trip": 305000,
          "difference": 5000,
          "isCompatible": true
        },
        "pickup": {
          "customerRequest": {
            "address": "123 Main St, New York, NY",
            "coordinates": [-74.006, 40.7128]
          },
          "trip": {
            "address": "125 Main St, New York, NY",
            "coordinates": [-74.006, 40.7128]
          },
          "distance": 200
        },
        "dropoff": {
          "customerRequest": {
            "address": "456 Oak Ave, Boston, MA",
            "coordinates": [-71.0589, 42.3601]
          },
          "trip": {
            "address": "458 Oak Ave, Boston, MA",
            "coordinates": [-71.0589, 42.3601]
          },
          "distance": 300
        },
        "overall": true
      },
      "tokenInfo": {
        "tokensRequired": 5,
        "hasSufficientTokens": true
      }
    }
  }
}
```

### 3. Respond to Connect Request

**PUT** `/api/v1/connect-requests/:requestId/respond`

Accept or reject a connect request. For lead-based requests, tokens are deducted from driver's wallet.

**Request Body:**
```json
{
  "action": "accept",
  "rejectionReason": "Optional reason if rejecting"
}
```

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Connect request accepted successfully",
  "data": {
    "connectRequest": {
      "_id": "request_id",
      "status": "accepted",
      "recipientAccepted": true,
      "acceptedAt": "2025-01-15T11:00:00.000Z",
      "tokenDeduction": {
        "tokensRequired": 5,
        "tokensDeducted": 5,
        "deductedAt": "2025-01-15T11:00:00.000Z"
      }
    }
  }
}
```

### 4. Accept Connect Request (Mutual Acceptance)

**PUT** `/api/v1/connect-requests/:requestId/accept`

Accept a connect request after the recipient has already accepted (mutual acceptance).

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Connect request accepted successfully",
  "data": {
    "connectRequest": {
      "_id": "request_id",
      "status": "accepted",
      "initiatorAccepted": true,
      "recipientAccepted": true,
      "contactDetailsShared": true,
      "contactDetailsSharedAt": "2025-01-15T11:30:00.000Z"
    }
  }
}
```

### 5. Get Connect Requests

**GET** `/api/v1/connect-requests`

Get all connect requests for the current user with pagination and filtering.

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `status`: Filter by status (pending, accepted, rejected, expired)
- `type`: Filter by type (sent, received, or both)

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Connect requests retrieved successfully",
  "data": {
    "requests": [
      {
        "_id": "request_id",
        "initiator": {
          "name": "John Doe",
          "email": "john@example.com",
          "phone": "+1234567890"
        },
        "recipient": {
          "name": "Jane Smith",
          "email": "jane@example.com",
          "phone": "+0987654321"
        },
        "customerRequest": {
          "title": "Package Delivery",
          "description": "Need to deliver package from NYC to Boston"
        },
        "trip": {
          "title": "NYC to Boston Route",
          "description": "Regular route from NYC to Boston"
        },
        "status": "pending",
        "message": "Optional message",
        "createdAt": "2025-01-15T10:30:00.000Z"
      }
    ]
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 6. Get Connect Request by ID

**GET** `/api/v1/connect-requests/:requestId`

Get a specific connect request with contact details if both parties have accepted.

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Connect request retrieved successfully",
  "data": {
    "connectRequest": {
      "_id": "request_id",
      "initiator": {
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "+1234567890"
      },
      "recipient": {
        "name": "Jane Smith",
        "email": "jane@example.com",
        "phone": "+0987654321"
      },
      "customerRequest": {
        "title": "Package Delivery",
        "description": "Need to deliver package from NYC to Boston"
      },
      "trip": {
        "title": "NYC to Boston Route",
        "description": "Regular route from NYC to Boston"
      },
      "status": "accepted",
      "message": "Optional message",
      "contactDetailsShared": true,
      "createdAt": "2025-01-15T10:30:00.000Z"
    },
    "contactDetails": {
      "name": "Jane Smith",
      "email": "jane@example.com",
      "phone": "+0987654321"
    }
  }
}
```

### 7. Delete Connect Request

**DELETE** `/api/v1/connect-requests/:requestId`

Soft delete a connect request (only by initiator, not if already accepted).

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Connect request deleted successfully",
  "data": {
    "connectRequest": {
      "_id": "request_id",
      "isActive": false,
      "deletedBy": "user_id",
      "updatedAt": "2025-01-15T12:00:00.000Z"
    }
  }
}
```

## Token System Integration

### Token Deduction for Leads

- **Automatic Calculation**: Tokens required are calculated based on lead distance and admin-configured `lead_tokens` rules
- **Wallet Check**: Driver's wallet balance is checked before allowing acceptance
- **Deduction Timing**: Tokens are deducted when the recipient accepts a lead-based request
- **Insufficient Tokens**: If driver lacks tokens, a specific warning message is shown

### Token Calculation

Tokens are calculated based on the distance bands configured in `lead_tokens`:
- Distance is converted from meters to kilometers
- Admin sets token requirements for different distance ranges
- System automatically determines required tokens based on lead distance

## Compatibility Analysis

### Distance Compatibility

- **Threshold**: 5km difference between customer request and trip distances
- **Calculation**: Absolute difference between distances
- **Purpose**: Ensure the trip can reasonably fulfill the customer request

### Location Compatibility

- **Pickup**: Distance between customer request pickup and trip start location
- **Dropoff**: Distance between customer request dropoff and trip destination
- **Threshold**: 5km for each location
- **Calculation**: Haversine formula using coordinates

### Overall Compatibility

Overall compatibility is `true` when:
- Distance difference ≤ 5km
- Pickup location difference ≤ 5km (if coordinates available)
- Dropoff location difference ≤ 5km (if coordinates available)

## Status Values

- **pending**: Request sent, waiting for response
- **accepted**: Both parties have accepted
- **rejected**: Recipient rejected the request
- **expired**: Request expired (not implemented yet)

## Contact Sharing Rules

Contact details are shared only when:
1. **Recipient accepts** the connect request
2. **Initiator accepts** the connect request (mutual acceptance)
3. **Both conditions** are met

Contact details include:
- Name
- Email
- Phone number

## Security Features

- **Authentication Required**: All endpoints require valid JWT tokens
- **Authorization**: Users can only access their own connect requests
- **Input Validation**: Comprehensive Joi validation for all inputs
- **Input Sanitization**: Protection against malicious input
- **Soft Delete**: Records are marked inactive rather than permanently deleted
- **Audit Trail**: All modifications are tracked with user and timestamp

## Error Responses

### Validation Errors
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "recipientId",
      "message": "\"recipientId\" is required"
    }
  ]
}
```

### Authentication Errors
```json
{
  "success": false,
  "statusCode": 401,
  "message": "User not found or inactive"
}
```

### Authorization Errors
```json
{
  "success": false,
  "statusCode": 403,
  "message": "Access denied"
}
```

### Not Found Errors
```json
{
  "success": false,
  "statusCode": 404,
  "message": "Connect request not found"
}
```

### Conflict Errors
```json
{
  "success": false,
  "statusCode": 409,
  "message": "Connect request already exists"
}
```

### Server Errors
```json
{
  "success": false,
  "statusCode": 500,
  "message": "Failed to send connect request"
}
```

## Special Cases

### Insufficient Tokens Warning

When a driver sends a connect request but lacks sufficient tokens:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Your connectRequest was accepted by the customer, but you do not have enough tokens to view this lead's contact details."
}
```

This ensures transparency while preventing invalid connections.

## Database Schema

### Connect Requests Collection

```javascript
{
  _id: ObjectId,
  initiator: ObjectId (ref: users),
  recipient: ObjectId (ref: users),
  customerRequest: ObjectId (ref: customer_requests), // Required
  trip: ObjectId (ref: trips), // Required
  status: String (pending|accepted|rejected|expired),
  initiatorAccepted: Boolean,
  recipientAccepted: Boolean,
  acceptedAt: Date,
  initiatorAcceptedAt: Date,
  rejectedAt: Date,
  rejectionReason: String,
  contactDetailsShared: Boolean,
  contactDetailsSharedAt: Date,
  tokenDeduction: {
    tokensRequired: Number,
    tokensDeducted: Number,
    deductedAt: Date
  },
  hasSufficientTokens: Boolean,
  message: String,
  isActive: Boolean,
  addedBy: ObjectId (ref: users),
  lastUpdatedBy: ObjectId (ref: users),
  deletedBy: ObjectId (ref: users),
  createdAt: Date,
  updatedAt: Date
}
```

## Indexes

- **Unique**: `{initiator: 1, recipient: 1, customerRequest: 1, trip: 1}`
- **Performance**: `{initiator: 1, status: 1}`, `{recipient: 1, status: 1}`
- **Query**: `{customerRequest: 1, trip: 1}`, `{status: 1, isActive: 1}`
