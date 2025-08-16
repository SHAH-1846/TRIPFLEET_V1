# Location Filtering API Documentation

## Overview
The `getAllTrips` API now supports advanced location-based filtering to find trips that pass through specific locations. This feature uses MongoDB's geospatial queries to efficiently search for trips based on geographic coordinates.

## API Endpoint
```
GET /api/v1/trips
```

## Query Parameters

### Basic Parameters
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Number of trips per page (default: 10)
- `status` (optional): Filter by trip status
- `search` (optional): Text search in goods type, description, or addresses
- `dateFrom` (optional): Filter trips from this date
- `dateTo` (optional): Filter trips until this date

### Location Filtering Parameters

#### 1. Current Location Filter
- **Parameter**: `currentLocation`
- **Format**: `longitude,latitude` (e.g., `-73.935242,40.730610`)
- **Description**: Returns trips that pass through or near the specified current location
- **Search Radius**: 5km from the specified coordinates
- **Search Areas**: 
  - Route coordinates (routeGeoJSON)
  - Trip start location
  - Trip destination

#### 2. Pickup Location Filter
- **Parameter**: `pickupLocation`
- **Format**: `longitude,latitude` (e.g., `-73.935242,40.730610`)
- **Description**: Returns trips that pass through or near the specified pickup location
- **Search Radius**: 5km from the specified coordinates
- **Search Areas**:
  - Route coordinates (routeGeoJSON)
  - Trip start location

#### 3. Dropoff Location Filter
- **Parameter**: `dropoffLocation`
- **Format**: `longitude,latitude` (e.g., `-73.935242,40.730610`)
- **Description**: Returns trips that pass through or near the specified dropoff location
- **Search Radius**: 5km from the specified coordinates
- **Search Areas**:
  - Route coordinates (routeGeoJSON)
  - Trip destination

#### 4. Combined Pickup + Dropoff Filter
- **Parameter**: `pickupDropoffBoth`
- **Value**: `true` (when you want both locations to be satisfied)
- **Requirements**: Both `pickupLocation` and `dropoffLocation` must be provided
- **Description**: Returns trips that pass through BOTH the pickup and dropoff locations
- **Logic**: Uses AND logic to ensure both locations are satisfied

## Usage Examples

### Example 1: Find trips near a specific location
```
GET /api/v1/trips?currentLocation=-73.935242,40.730610
```

### Example 2: Find trips with specific pickup location
```
GET /api/v1/trips?pickupLocation=-73.935242,40.730610
```

### Example 3: Find trips with specific dropoff location
```
GET /api/v1/trips?dropoffLocation=-74.006015,40.712776
```

### Example 4: Find trips that pass through both pickup and dropoff locations
```
GET /api/v1/trips?pickupLocation=-73.935242,40.730610&dropoffLocation=-74.006015,40.712776&pickupDropoffBoth=true
```

### Example 5: Combine location filtering with other filters
```
GET /api/v1/trips?pickupLocation=-73.935242,40.730610&status=active&dateFrom=2024-01-01&limit=20
```

### Example 6: Multiple location filters (AND logic)
```
GET /api/v1/trips?currentLocation=-73.935242,40.730610&pickupLocation=-74.006015,40.712776
```

## Technical Implementation

### Geospatial Queries
The API uses MongoDB's `$near` operator with a 2dsphere index for efficient geospatial searches. The search radius is set to 5km (5000 meters) for all location-based queries.

### Coordinate Format
Coordinates must be provided in the format `longitude,latitude` (WGS84 coordinate system):
- Longitude: -180 to +180 (negative for West, positive for East)
- Latitude: -90 to +90 (negative for South, positive for North)

### Search Logic
1. **Individual Location Filters**: Each location parameter creates a filter that searches multiple areas (route, start, destination)
2. **Combined Filters**: Multiple location parameters use AND logic to ensure all conditions are met
3. **Pickup+Dropoff Both**: Special logic ensures both locations are satisfied in the same trip

### Performance Considerations
- The API uses existing 2dsphere indexes on location coordinates
- Search radius is limited to 5km for performance
- Geospatial queries are optimized using MongoDB's spatial indexing

## Error Handling
- Invalid coordinate formats are logged and ignored
- Malformed coordinates won't break the API
- The API gracefully handles missing or invalid location parameters

## Response Format
The API returns the same response structure as before, with filtered results based on the location criteria:

```json
{
  "success": true,
  "message": "Trips retrieved successfully",
  "data": [...],
  "statusCode": 200,
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

## Notes
- Location filtering works in combination with existing filters (status, search, date range)
- The 5km search radius can be adjusted in the code if needed
- All location searches are case-insensitive and coordinate-order independent
- The API maintains backward compatibility with existing functionality
