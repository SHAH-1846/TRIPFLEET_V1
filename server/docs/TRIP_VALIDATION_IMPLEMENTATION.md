# Trip API Validation Implementation

This document outlines the implementation of the required validations for the Trip API endpoints.

## Overview

The Trip API now includes comprehensive validation for vehicle ownership, driver assignment, and driver availability to ensure data integrity and business rule compliance.

## Implemented Validations

### 1. Vehicle Validation

**Location**: `validateVehicleOwnership()` function in `tripController.js`

**Requirements**:
- Vehicle must always be provided in trip requests
- Vehicle must exist in the database
- Vehicle owner must be the current logged-in user

**Implementation**:
```javascript
const validateVehicleOwnership = async (vehicleId, userId) => {
  const vehicle = await vehicles.findById(vehicleId);
  if (!vehicle) {
    return { isValid: false, error: "Vehicle not found" };
  }
  
  if (vehicle.user.toString() !== userId) {
    return { isValid: false, error: "You can only use your own vehicles for trips" };
  }
  
  return { isValid: true, vehicle };
};
```

**Error Messages**:
- "Vehicle not found" - When vehicle ID doesn't exist
- "You can only use your own vehicles for trips" - When vehicle ownership validation fails

### 2. Driver Validation

**Location**: `validateDriverAssignment()` function in `tripController.js`

**Requirements**:
- Driver must always be provided in trip requests
- Driver must exist in the database
- If `selfDrive = true`: Driver ID must match current user ID
- If `selfDrive = false`: Driver must have active driver connection (friendship) with current user

**Implementation**:
```javascript
const validateDriverAssignment = async (driverId, userId, selfDrive) => {
  const driver = await users.findById(driverId);
  if (!driver) {
    return { isValid: false, error: "Driver not found" };
  }
  
  if (selfDrive) {
    if (driverId !== userId) {
      return { isValid: false, error: "For self-drive trips, driver must be the current user" };
    }
  } else {
    const connection = await driverConnections.findOne({
      $or: [
        { requester: userId, requested: driverId },
        { requester: driverId, requested: userId }
      ],
      status: 'accepted',
      isActive: true
    });
    
    if (!connection) {
      return { isValid: false, error: "Driver must be a connected friend to assign them to your trip" };
    }
  }
  
  return { isValid: true, driver };
};
```

**Error Messages**:
- "Driver not found" - When driver ID doesn't exist
- "For self-drive trips, driver must be the current user" - When self-drive validation fails
- "Driver must be a connected friend to assign them to your trip" - When driver connection validation fails

### 3. Driver Availability Validation

**Location**: `checkDriverAvailability()` function in `tripController.js`

**Requirements**:
- Driver cannot take more than one trip at a time
- Block trip creation if driver is already assigned to a trip within the same time period

**Implementation**:
```javascript
const checkDriverAvailability = async (driverId, tripStartDate, tripEndDate, excludeTripId = null) => {
  const overlappingTrips = await trips.find({
    driver: driverId,
    _id: { $ne: excludeTripId }, // Exclude current trip for updates
    isActive: true,
    $or: [
      // Trip starts during existing trip
      {
        tripStartDate: { $lte: tripStartDate },
        tripEndDate: { $gt: tripStartDate }
      },
      // Trip ends during existing trip
      {
        tripStartDate: { $lt: tripEndDate },
        tripEndDate: { $gte: tripEndDate }
      },
      // Trip completely contains existing trip
      {
        tripStartDate: { $gte: tripStartDate },
        tripEndDate: { $lte: tripEndDate }
      }
    ]
  });
  
  if (overlappingTrips.length > 0) {
    return { 
      isAvailable: false, 
      error: "Driver is already assigned to another trip during this time period" 
    };
  }
  
  return { isAvailable: true };
};
```

**Error Messages**:
- "Driver is already assigned to another trip during this time period" - When driver has conflicting trips

## API Endpoints with Validation

### 1. Create Trip (`POST /api/v1/trips`)

**Validations Applied**:
- Vehicle ownership validation
- Driver assignment validation
- Driver availability validation
- Trip date validation (future dates, end after start)
- Coordinate format validation

**Required Fields**:
- `vehicle` (ObjectId) - Must be owned by current user
- `driver` (ObjectId) - Must be valid driver (self or connected friend)
- `selfDrive` (Boolean) - Indicates if current user is driving
- `tripStartDate` (Date) - Must be in future
- `tripEndDate` (Date) - Must be after start date

### 2. Update Trip (`PUT /api/v1/trips/:tripId`)

**Validations Applied**:
- Vehicle ownership validation (if vehicle is updated)
- Driver assignment validation (if driver is updated)
- Driver availability validation (if driver or dates are updated)
- Trip date validation (if dates are updated)

**Conditional Validation**:
- Validations only run when relevant fields are being updated
- Driver availability check excludes current trip from conflict detection

## Validation Schema Updates

The Joi validation schemas have been updated to include:

```javascript
createTrip: Joi.object({
  // ... existing fields
  vehicle: fields.objectId.required().messages({
    'any.required': 'Vehicle is required for the trip'
  }),
  driver: fields.objectId.required().messages({
    'any.required': 'Driver is required for the trip'
  }),
  selfDrive: Joi.boolean().required().messages({
    'any.required': 'selfDrive field is required to indicate if the current user is driving'
  }),
  // ... other fields
})
```

## Error Handling

All validation errors return appropriate HTTP status codes:

- **400 Bad Request**: Validation failures (vehicle ownership, driver assignment)
- **409 Conflict**: Driver availability conflicts
- **401 Unauthorized**: User authentication issues
- **403 Forbidden**: User permission issues
- **404 Not Found**: Resource not found
- **500 Server Error**: Internal server errors

## Business Rules

1. **Vehicle Ownership**: Users can only create trips with vehicles they own
2. **Self-Drive**: When `selfDrive = true`, the driver must be the current user
3. **Friend Assignment**: When `selfDrive = false`, the driver must be a connected friend
4. **Driver Availability**: Drivers cannot be double-booked for overlapping time periods
5. **User Types**: Only customers can create trips (not drivers or admins)

## Testing Considerations

When testing the API:

1. **Vehicle Validation**: Ensure vehicle ID exists and belongs to current user
2. **Driver Validation**: Test both self-drive and friend assignment scenarios
3. **Availability Check**: Create overlapping trips to verify conflict detection
4. **User Permissions**: Test with different user types (customer, driver, admin)
5. **Edge Cases**: Test with invalid IDs, missing fields, and boundary conditions

## Future Enhancements

Potential improvements for future versions:

1. **Vehicle Status Check**: Validate vehicle availability and maintenance status
2. **Driver License Validation**: Check driver license validity and expiration
3. **Route Conflict Detection**: Identify potential route conflicts between trips
4. **Capacity Validation**: Ensure vehicle capacity matches trip requirements
5. **Real-time Availability**: Implement real-time driver availability tracking
