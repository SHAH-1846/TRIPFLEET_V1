# Drivers App API Documentation

## Overview
This API provides endpoints for managing drivers, customers, trips, vehicles, and bookings in a transportation/logistics application.

**Base URL:** `http://localhost:3002/api/v1`
**Version:** 1.0.0

## Authentication
Most endpoints require authentication using JWT tokens. Include the token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## Response Format
All API responses follow a standardized format:

### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation completed successfully",
  "data": {},
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_1705312200000_abc123def"
}
```

### Error Response
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Please enter a valid email address"
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_1705312200000_abc123def"
}
```

---

## Authentication Endpoints

### 1. User Login
**POST** `/auth/login`

**Payload:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "user@example.com",
      "phone": "+919999999999",
      "user_type": {
        "_id": "507f1f77bcf86cd799439012",
        "name": "driver"
      },
      "profilePicture": "507f1f77bcf86cd799439013",
      "isActive": true,
      "lastLogin": "2024-01-15T10:30:00.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 2. Request OTP
**POST** `/auth/request-otp`

**Payload:**
```json
{
  "phone": "+919999999999"
}
```

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "OTP sent successfully",
  "data": {
    "otpRequestToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "message": "Development OTP: 123456"
  }
}
```

### 3. Verify OTP
**POST** `/auth/verify-otp`

**Headers:**
```
Authorization: Bearer <otp_request_token>
```

**Payload:**
```json
{
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "OTP verified successfully",
  "data": {
    "phoneVerifiedToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "isNewUser": true,
    "user": null
  }
}
```

### 4. Refresh Token
**POST** `/auth/refresh-token`

**Payload:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 5. Logout
**POST** `/auth/logout`

**Headers:**
```
Authorization: Bearer <access_token>
```

---

## User Management Endpoints

### 1. Register Driver
**POST** `/users/register-driver`

**Headers:**
```
Authorization: Bearer <phone_verified_token>
```

**Payload:**
```json
{
  "name": "John Doe",
  "whatsappNumber": "+919999999999",
  "email": "driver@example.com",
  "drivingLicense": "507f1f77bcf86cd799439014",
  "profilePicture": "507f1f77bcf86cd799439015",
  "vehicleNumber": "KA01AB1234",
  "vehicleType": "507f1f77bcf86cd799439016",
  "vehicleBodyType": "507f1f77bcf86cd799439017",
  "vehicleCapacity": 10,
  "goodsAccepted": true,
  "registrationCertificate": "507f1f77bcf86cd799439018",
  "truckImages": [
    "507f1f77bcf86cd799439019",
    "507f1f77bcf86cd799439020"
  ],
  "termsAndConditionsAccepted": true,
  "privacyPolicyAccepted": true
}
```

### 2. Register Customer
**POST** `/users/register-customer`

**Headers:**
```
Authorization: Bearer <phone_verified_token>
```

**Payload:**
```json
{
  "name": "Jane Smith",
  "email": "customer@example.com",
  "profilePicture": "507f1f77bcf86cd799439021",
  "termsAndConditionsAccepted": true,
  "privacyPolicyAccepted": true
}
```

### 3. Get User Profile
**GET** `/users/profile`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Profile retrieved successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "driver@example.com",
    "phone": "+919999999999",
    "user_type": {
      "_id": "507f1f77bcf86cd799439012",
      "name": "driver"
    },
    "profilePicture": {
      "_id": "507f1f77bcf86cd799439015",
      "url": "/uploads/images/users/507f1f77bcf86cd799439015.jpg"
    },
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### 4. Update Profile
**PUT** `/users/profile`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Payload:**
```json
{
  "name": "John Updated",
  "email": "updated@example.com",
  "whatsappNumber": "+919888888888",
  "profilePicture": "507f1f77bcf86cd799439022"
}
```

---

## Trip Management Endpoints

### 1. Create Trip
**POST** `/trips`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Payload:**
```json
{
  "pickupLocation": {
    "address": "123 Main Street, Bangalore, Karnataka",
    "coordinates": {
      "lat": 12.9716,
      "lng": 77.5946
    }
  },
  "dropLocation": {
    "address": "456 Park Avenue, Mumbai, Maharashtra",
    "coordinates": {
      "lat": 19.0760,
      "lng": 72.8777
    }
  },
  "goodsType": "Electronics",
  "weight": 5.5,
  "description": "Fragile electronics items",
  "pickupDate": "2024-01-20T10:00:00.000Z",
  "budget": 15000
}
```

**Response:**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Trip created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439023",
    "customer": "507f1f77bcf86cd799439011",
    "pickupLocation": {
      "address": "123 Main Street, Bangalore, Karnataka",
      "coordinates": {
        "lat": 12.9716,
        "lng": 77.5946
      }
    },
    "dropLocation": {
      "address": "456 Park Avenue, Mumbai, Maharashtra",
      "coordinates": {
        "lat": 19.0760,
        "lng": 72.8777
      }
    },
    "goodsType": "Electronics",
    "weight": 5.5,
    "description": "Fragile electronics items",
    "pickupDate": "2024-01-20T10:00:00.000Z",
    "budget": 15000,
    "status": "pending",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### 2. Get Trips (with pagination)
**GET** `/trips?page=1&limit=10&status=pending`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Trips retrieved successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439023",
      "customer": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "John Doe"
      },
      "pickupLocation": {
        "address": "123 Main Street, Bangalore, Karnataka",
        "coordinates": {
          "lat": 12.9716,
          "lng": 77.5946
        }
      },
      "dropLocation": {
        "address": "456 Park Avenue, Mumbai, Maharashtra",
        "coordinates": {
          "lat": 19.0760,
          "lng": 72.8777
        }
      },
      "goodsType": "Electronics",
      "weight": 5.5,
      "budget": 15000,
      "status": "pending",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "totalPages": 3,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### 3. Update Trip
**PUT** `/trips/:tripId`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Payload:**
```json
{
  "pickupDate": "2024-01-22T10:00:00.000Z",
  "budget": 18000,
  "description": "Updated description"
}
```

---

## Vehicle Management Endpoints

### 1. Create Vehicle
**POST** `/vehicles`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Payload:**
```json
{
  "vehicleNumber": "KA01AB1234",
  "vehicleType": "507f1f77bcf86cd799439016",
  "vehicleBodyType": "507f1f77bcf86cd799439017",
  "vehicleCapacity": 10,
  "goodsAccepted": true,
  "registrationCertificate": "507f1f77bcf86cd799439018",
  "truckImages": [
    "507f1f77bcf86cd799439019",
    "507f1f77bcf86cd799439020"
  ]
}
```

### 2. Get Vehicles
**GET** `/vehicles?page=1&limit=10`

**Headers:**
```
Authorization: Bearer <access_token>
```

---

## Access Control and Security

### Vehicle Data Access Control

The `GET /api/v1/vehicles` endpoint implements role-based access control to protect sensitive vehicle and user data:

#### Access Levels by User Role:

**Admin Users:**
- Can view all vehicles regardless of status
- Have access to complete vehicle data including:
  - Owner contact information (email, phone)
  - Registration certificates
  - All vehicle documents
  - Truck images
  - Verification status

**Driver Users:**
- Can view their own vehicles with full data access
- Can view other verified and available vehicles with limited data:
  - Vehicle owner name only (no contact details)
  - Truck images
  - No access to registration certificates or documents
- Cannot view unverified or unavailable vehicles from other drivers

**Customer Users:**
- Can only view verified and available vehicles
- Limited data access:
  - Vehicle owner name only (no contact details)
  - Truck images only
  - No access to registration certificates or documents
- Cannot view unverified or unavailable vehicles

#### Security Benefits:

1. **Privacy Protection**: Personal contact information is restricted
2. **Document Security**: Sensitive documents are only accessible to vehicle owners and admins
3. **Business Logic**: Customers only see vehicles they can actually book
4. **Competitive Protection**: Drivers cannot see each other's complete business information

#### Query Parameters:

- `page`: Page number for pagination
- `limit`: Number of items per page
- `vehicleType`: Filter by vehicle type
- `bodyType`: Filter by vehicle body type
- `status`: Filter by verification status (admin/driver only)
- `available`: Filter by availability status (admin/driver only)
- `search`: Search by vehicle number or owner name

## User Profile Security

### WhatsApp Number Uniqueness

The system ensures that WhatsApp numbers are unique across all users to prevent conflicts and maintain data integrity:

#### Security Measures:

1. **Application-Level Validation**: All profile update operations check for WhatsApp number uniqueness
2. **Database-Level Constraint**: Unique index on `whatsappNumber` field prevents duplicate entries
3. **Registration Validation**: New user registration validates WhatsApp number uniqueness
4. **Update Validation**: Profile updates validate WhatsApp number uniqueness before allowing changes

#### Error Handling:

- **409 Conflict**: Returned when attempting to use a WhatsApp number already in use
- **Validation Errors**: Proper error messages for invalid WhatsApp number formats
- **Migration Support**: Automatic handling of existing duplicate WhatsApp numbers

#### Protected Operations:

- `PUT /api/v1/users/profile` - Profile updates
- `POST /api/v1/users/register-driver` - Driver registration
- `POST /api/v1/users/profile` - Customer registration

## Booking Management Endpoints

### 1. Create Booking
**POST** `/bookings`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Payload:**
```json
{
  "trip": "507f1f77bcf86cd799439023",
  "vehicle": "507f1f77bcf86cd799439024",
  "price": 12000,
  "pickupDate": "2024-01-20T10:00:00.000Z",
  "notes": "Handle with care"
}
```

### 2. Update Booking Status
**PUT** `/bookings/:bookingId`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Payload:**
```json
{
  "status": "confirmed",
  "notes": "Booking confirmed"
}
```

---

## File Upload Endpoints

### 1. Upload Image
**POST** `/images/upload`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

**Form Data:**
```
file: [image file]
type: "profile" | "vehicle" | "document" | "general"
category: "optional_category"
```

**Response:**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Image uploaded successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439025",
    "filename": "1705312200000_123456.jpg",
    "originalName": "profile.jpg",
    "mimetype": "image/jpeg",
    "size": 1024000,
    "url": "/uploads/images/users/1705312200000_123456.jpg",
    "type": "profile",
    "category": "profile_picture"
  }
}
```

### 2. Upload Document
**POST** `/documents/upload`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

**Form Data:**
```
file: [document file]
type: "license" | "registration" | "insurance" | "general"
category: "optional_category"
```

---

## Customer Request Endpoints

### 1. Create Support Request
**POST** `/customer-requests`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Payload:**
```json
{
  "title": "Payment Issue",
  "description": "I'm unable to make payment for my recent booking",
  "category": "billing",
  "priority": "high",
  "attachments": [
    "507f1f77bcf86cd799439026"
  ]
}
```

### 2. Get Customer Requests
**GET** `/customer-requests?page=1&limit=10&status=open`

**Headers:**
```
Authorization: Bearer <access_token>
```

---

## Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Validation Error |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

## Rate Limiting

- **Auth endpoints:** 5 requests per 15 minutes
- **General endpoints:** 100 requests per 15 minutes
- **API endpoints:** 1000 requests per 15 minutes

## File Upload Limits

- **Image files:** Max 5MB, formats: JPEG, PNG, WebP
- **Document files:** Max 10MB, formats: PDF, DOC, DOCX
- **Total uploads per user:** 50 files

## Environment Variables

```env
NODE_ENV=development
PORT=3002
MONGODB_URI=mongodb://localhost:27017/drivers_app
PRIVATE_KEY=your_jwt_secret_key
REFRESH_TOKEN_SECRET=your_refresh_token_secret
SESSION_SECRET=your_session_secret
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
BODY_LIMIT=10mb
```

## Testing

Use the provided Postman collection or curl commands to test the API endpoints. Make sure to:

1. Set the correct base URL
2. Include proper headers
3. Use valid JWT tokens for authenticated endpoints
4. Follow the payload structure exactly

## Support

For API support and questions, contact the development team or refer to the internal documentation. 