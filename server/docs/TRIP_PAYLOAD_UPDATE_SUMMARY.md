# Trip Payload Update Summary

## Overview
Updated the `createTrip` and `updateTrip` APIs to match the new standardized payload format that uses `[lng, lat]` coordinate arrays instead of `{lat, lng}` objects.

## Changes Made

### 1. Validation Schemas (`validations/schemas.js`)

#### createTrip Schema Updates:
- **Coordinates format**: Changed from `{lat, lng}` objects to `[lng, lat]` arrays
- **viaRoutes**: Made optional and updated to use `[lng, lat]` format
- **Field reordering**: Reorganized fields for better logical flow
- **Required fields**: Updated required field list to match new payload structure

#### updateTrip Schema Updates:
- **Coordinates format**: Changed from `{lat, lng}` objects to `[lng, lat]` arrays
- **viaRoutes**: Added support for updating via routes with `[lng, lat]` format
- **Field additions**: Added support for `title`, `vehicle`, `selfDrive`, `driver` updates

### 2. Trip Controller (`controllers/tripController.js`)

#### createTrip Function Updates:
- **Coordinate validation**: Updated to expect `[lng, lat]` arrays instead of `{lat, lng}` objects
- **routeGeoJSON handling**: Simplified coordinate processing since input is already in correct format
- **viaRoutes mapping**: Updated to handle `[lng, lat]` coordinate arrays
- **tripData construction**: Streamlined data mapping and removed redundant field processing
- **Field mapping**: Fixed field mappings to use correct source fields

#### updateTrip Function Updates:
- **Coordinate validation**: Replaced old `{lat, lng}` conversion logic with `[lng, lat]` validation
- **viaRoutes validation**: Added comprehensive validation for via route updates
- **Coordinate range validation**: Maintained longitude (-180 to 180) and latitude (-90 to 90) validation
- **Error messages**: Updated error messages to reflect new coordinate format expectations

### 3. Database Model (`db/models/trips.js`)

#### New Field Addition:
- **selfDrive**: Added boolean field to track whether the trip creator is driving themselves
  - Type: `Boolean`
  - Default: `false`
  - Purpose: Indicates if the current user is driving the vehicle

#### Schema Compatibility:
- **locationSchema**: Used for `tripStartLocation`, `tripDestination`, and `viaRoutes`
  - `type`: String (defaults to "Point")
  - `address`: String
  - `coordinates`: Array of numbers `[lng, lat]`
- **currentLocation**: Separate schema for tracking current position
  - `type`: String (defaults to "Point")
  - `coordinates`: Array of numbers `[lng, lat]`

## New Payload Format

### Create Trip Payload:
```json
{
  "title": "A new awesome trip",
  "tripStartLocation": {
    "address": "Ernakulam Railway Station, Kochi, Kerala",
    "coordinates": [76.2999, 9.9785]
  },
  "tripDestination": {
    "address": "Trivandrum Central, Thiruvananthapuram, Kerala",
    "coordinates": [76.9488, 8.4875]
  },
  "viaRoutes": [
    {
      "address": "Stop 1",
      "coordinates": [76.4000, 9.8000]
    },
    {
      "address": "Stop 2",
      "coordinates": [76.6000, 9.6000]
    }
  ],
  "routeGeoJSON": {
    "coordinates": [
      [76.2999, 9.9785],
      [76.4000, 9.8000],
      [76.6000, 9.6000],
      [76.9488, 8.4875]
    ]
  },
  "vehicle": "688cd3eced8fcb776e34a71b",
  "selfDrive": false,
  "driver": "688b96aabaf3e914708ada27",
  "distance": {
    "value": 56000,
    "text": "56 km"
  },
  "duration": {
    "value": 5400,
    "text": "1 hour 30 mins"
  },
  "goodsType": "684aa71cb88048daeaebff90",
  "weight": 2.5,
  "tripStartDate": "2025-08-25T21:00:00.000Z",
  "tripEndDate": "2025-08-25T23:00:00.000Z"
}
```

### Update Trip Payload:
```json
{
  "title": "Updated trip title",
  "tripStartLocation": {
    "address": "Updated start location",
    "coordinates": [76.3000, 9.9800]
  },
  "viaRoutes": [
    {
      "address": "Updated Stop 1",
      "coordinates": [76.4100, 9.8100]
    }
  ]
}
```

## Key Benefits

1. **Standardized Format**: All coordinates now use the standard GeoJSON `[lng, lat]` format
2. **Consistency**: Both create and update operations use the same coordinate format
3. **Better Validation**: More robust coordinate validation with clear error messages
4. **Flexibility**: viaRoutes are now optional and can be updated independently
5. **New Features**: Added support for `selfDrive` field to track driver assignment

## Bug Fixes

### viaRoutes Mapping Issue
- **Problem**: The `viaRoutes` mapping was incorrectly creating nested coordinate objects that didn't match the database schema
- **Root Cause**: Coordinates were being wrapped in `{type: "Point", coordinates: [...]}` instead of using the direct `[lng, lat]` array
- **Solution**: Updated the mapping to directly use `via.coordinates` array, matching the `locationSchema` structure
- **Impact**: Fixes the "Cast to [Number] failed" error when creating trips with via routes

## Backward Compatibility

⚠️ **Breaking Change**: This update changes the coordinate format from `{lat, lng}` objects to `[lng, lat]` arrays. Existing clients will need to update their payload format.

## Testing

The changes have been validated with:
- ✅ Syntax validation for all modified files
- ✅ Joi validation schema testing with new payload format
- ✅ Coordinate format validation
- ✅ Required field validation
- ✅ Optional field handling
- ✅ viaRoutes mapping fix validation

## Files Modified

1. `validations/schemas.js` - Updated validation schemas
2. `controllers/tripController.js` - Updated API logic
3. `db/models/trips.js` - Added selfDrive field
4. `docs/TRIP_PAYLOAD_UPDATE_SUMMARY.md` - This documentation

## Next Steps

1. Update client applications to use the new coordinate format
2. Test the APIs with real data to ensure all edge cases are handled
3. Consider adding migration scripts if existing trip data needs coordinate format updates
4. Update API documentation to reflect the new payload format
