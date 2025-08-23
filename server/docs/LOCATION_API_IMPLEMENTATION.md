# Location API Implementation

## Overview

This document describes the complete implementation of the Location API for Indian postal office locations. The API provides comprehensive search and filtering capabilities for over 150,000 location records with geospatial support.

## Database Schema

### Location Model (`server/db/models/locations.js`)

```javascript
const locations = new mongoose.Schema({
  circleName: { type: String, trim: true, required: true },
  regionName: { type: String, trim: true, required: true },
  divisionName: { type: String, trim: true, required: true },
  officeName: { type: String, trim: true, required: true },
  pincode: { type: String, trim: true, required: true },
  officeType: { type: String, trim: true, required: true },
  delivery: { type: String, trim: true, required: true },
  district: { type: String, trim: true, required: true },
  stateName: { type: String, trim: true, required: true },
  coordinates: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
```

### Indexes for Performance

```javascript
// Text indexes for search functionality
locations.index({
  circleName: "text",
  regionName: "text",
  divisionName: "text",
  officeName: "text",
  pincode: "text",
  officeType: "text",
  delivery: "text",
  district: "text",
  stateName: "text",
});

// Individual indexes for better query performance
locations.index({ circleName: 1 });
locations.index({ regionName: 1 });
locations.index({ divisionName: 1 });
locations.index({ officeName: 1 });
locations.index({ pincode: 1 });
locations.index({ officeType: 1 });
locations.index({ district: 1 });
locations.index({ stateName: 1 });

// Geospatial index for location-based queries
locations.index({ coordinates: "2dsphere" });

// Compound indexes for common query patterns
locations.index({ stateName: 1, district: 1 });
locations.index({ stateName: 1, district: 1, officeType: 1 });
locations.index({ pincode: 1, officeType: 1 });
```

## Data Seeding

### Location Seeder (`server/db/seeders/locationSeeder.js`)

The seeder imports data from the `Locations.json` file and provides:

- **Data Validation**: Validates required fields and coordinates
- **Batch Processing**: Imports data in batches of 1000 for performance
- **Progress Tracking**: Shows import progress and statistics
- **Error Handling**: Continues processing even if some records fail
- **Data Transformation**: Converts JSON format to MongoDB schema format

#### Usage
```bash
node db/seeders/locationSeeder.js
```

#### Features
- Validates ~150,000 location records
- Transforms coordinates to GeoJSON format
- Provides detailed import statistics
- Handles existing data gracefully

## API Endpoints

### 1. Get All Locations
**GET** `/api/v1/locations`

Comprehensive search and filtering endpoint with the following capabilities:

#### Query Parameters
- `page` (number, default: 1): Page number for pagination
- `limit` (number, default: 10, max: 100): Items per page
- `search` (string): Text search across multiple fields
- `stateName` (string): Filter by state name
- `district` (string): Filter by district name
- `officeType` (string): Filter by office type (HO, SO, BO, etc.)
- `pincode` (string): Filter by pincode
- `circleName` (string): Filter by circle name
- `regionName` (string): Filter by region name
- `divisionName` (string): Filter by division name
- `delivery` (string): Filter by delivery type
- `nearLocation` (string): Coordinates for geospatial search (lng,lat)
- `radius` (number, default: 5000): Search radius in meters
- `sortBy` (string, default: officeName): Sort field
- `sortOrder` (string, default: asc): Sort order (asc, desc)

#### Search Features
- **Text Search**: Searches across officeName, district, stateName, pincode, circleName, regionName, divisionName
- **Geospatial Search**: Finds locations within specified radius of coordinates
- **Multiple Filters**: Combines any number of filters
- **Case-Insensitive**: All text searches are case-insensitive
- **Partial Matching**: Supports partial word matching

#### Example Requests
```bash
# Basic search
GET /api/v1/locations?search=Kochi

# Filter by state and search
GET /api/v1/locations?stateName=KERALA&search=Ernakulam

# Geospatial search
GET /api/v1/locations?nearLocation=76.2999,9.9785&radius=10000

# Combined filters
GET /api/v1/locations?search=Airport&stateName=KERALA&officeType=BO&page=1&limit=20
```

### 2. Get Location Statistics
**GET** `/api/v1/locations/stats`

Returns comprehensive statistics and metadata about the location data.

#### Response Includes
- Total locations count
- States count and list
- Districts count and list
- Office types count and list
- Circle names count and list
- Sample locations from different states
- State-wise location counts (top 10)
- Office type distribution

#### Example Request
```bash
GET /api/v1/locations/stats
```

### 3. Get Location by ID
**GET** `/api/v1/locations/:id`

Retrieves a single location by its MongoDB ObjectId.

#### Example Request
```bash
GET /api/v1/locations/507f1f77bcf86cd799439011
```

### 4. Get Locations by State
**GET** `/api/v1/locations/state/:stateName`

Retrieves all locations for a specific state with optional filtering.

#### Query Parameters
- `page` (number, default: 1): Page number
- `limit` (number, default: 20, max: 100): Items per page
- `search` (string): Text search within the state
- `officeType` (string): Filter by office type

#### Example Request
```bash
GET /api/v1/locations/state/KERALA?search=Kochi&officeType=HO
```

## Search and Filter Examples

### Text Search
```bash
# Search by office name
GET /api/v1/locations?search=Kochi

# Search by district
GET /api/v1/locations?search=Ernakulam

# Search by pincode
GET /api/v1/locations?search=682001

# Search by office type
GET /api/v1/locations?search=Airport
```

### State and District Filters
```bash
# Filter by state
GET /api/v1/locations?stateName=KERALA

# Filter by district
GET /api/v1/locations?district=ERNAKULAM

# Combined state and district
GET /api/v1/locations?stateName=KERALA&district=ERNAKULAM
```

### Office Type Filters
```bash
# Head Office
GET /api/v1/locations?officeType=HO

# Sub Office
GET /api/v1/locations?officeType=SO

# Branch Office
GET /api/v1/locations?officeType=BO

# General Post Office
GET /api/v1/locations?officeType=GPO
```

### Geospatial Search
```bash
# 5km radius around Kochi
GET /api/v1/locations?nearLocation=76.2999,9.9785&radius=5000

# 10km radius around Delhi
GET /api/v1/locations?nearLocation=77.2090,28.6139&radius=10000

# 15km radius around Mumbai
GET /api/v1/locations?nearLocation=72.8777,19.0760&radius=15000
```

### Combined Filters
```bash
# State + Search + Office Type
GET /api/v1/locations?stateName=KERALA&search=Kochi&officeType=HO

# Geospatial + Office Type
GET /api/v1/locations?nearLocation=76.2999,9.9785&radius=5000&officeType=BO

# State + District + Search
GET /api/v1/locations?stateName=KERALA&district=ERNAKULAM&search=Airport
```

## Response Format

### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Locations retrieved successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "officeName": "Kochi Head Post Office",
      "district": "ERNAKULAM",
      "stateName": "KERALA",
      "pincode": "682001",
      "officeType": "HO",
      "coordinates": {
        "type": "Point",
        "coordinates": [76.2999, 9.9785]
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 150,
    "totalPages": 15,
    "hasNext": true,
    "hasPrev": false
  },
  "filters": {
    "search": "Kochi",
    "stateName": "KERALA",
    "district": null,
    "officeType": null,
    "pincode": null,
    "nearLocation": null,
    "radius": null
  }
}
```

### Stats Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Location statistics retrieved successfully",
  "data": {
    "totalLocations": 150000,
    "states": {
      "count": 28,
      "list": ["ANDHRA PRADESH", "KERALA", "TAMIL NADU", ...]
    },
    "districts": {
      "count": 700,
      "list": ["ERNAKULAM", "THIRUVANANTHAPURAM", ...]
    },
    "officeTypes": {
      "count": 5,
      "list": ["HO", "SO", "BO", "GPO", "SPO"]
    },
    "sampleLocations": [...],
    "stateCounts": [...],
    "officeTypeCounts": [...]
  }
}
```

## Performance Optimizations

### Indexing Strategy
1. **Text Indexes**: Enable full-text search across multiple fields
2. **Individual Indexes**: Optimize single-field queries
3. **Geospatial Index**: Enable location-based queries
4. **Compound Indexes**: Optimize common query patterns

### Query Optimizations
1. **Pagination**: Limits result sets to prevent memory issues
2. **Lean Queries**: Returns plain JavaScript objects instead of Mongoose documents
3. **Case-Insensitive Regex**: Uses MongoDB's `$regex` with `'i'` option
4. **Batch Processing**: Handles large datasets efficiently

### Performance Considerations
- Maximum 100 items per page to prevent memory issues
- Geospatial queries use efficient `$geoWithin` with `$centerSphere`
- Text searches use optimized regex patterns
- Compound indexes for common filter combinations

## Error Handling

### Validation Errors
- Invalid coordinates format
- Invalid pagination parameters
- Invalid radius values
- Missing required parameters

### Database Errors
- Connection issues
- Query timeouts
- Index-related errors

### Response Format for Errors
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid coordinates format. Use 'longitude,latitude'",
  "error": "VALIDATION_ERROR"
}
```

## Usage Examples

### Frontend Integration
```javascript
// Search locations
const searchLocations = async (searchTerm) => {
  const response = await fetch(`/api/v1/locations?search=${searchTerm}`);
  const data = await response.json();
  return data;
};

// Get locations near coordinates
const getNearbyLocations = async (lng, lat, radius = 5000) => {
  const response = await fetch(`/api/v1/locations?nearLocation=${lng},${lat}&radius=${radius}`);
  const data = await response.json();
  return data;
};

// Get locations by state
const getLocationsByState = async (stateName) => {
  const response = await fetch(`/api/v1/locations/state/${stateName}`);
  const data = await response.json();
  return data;
};
```

### Mobile App Integration
```javascript
// React Native example
const LocationAPI = {
  search: async (params) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`/api/v1/locations?${queryString}`);
    return response.json();
  },
  
  getStats: async () => {
    const response = await fetch('/api/v1/locations/stats');
    return response.json();
  },
  
  getNearby: async (latitude, longitude, radius = 5000) => {
    const response = await fetch(`/api/v1/locations?nearLocation=${longitude},${latitude}&radius=${radius}`);
    return response.json();
  }
};
```

## Monitoring and Maintenance

### Performance Monitoring
- Monitor query execution times
- Track index usage statistics
- Monitor memory usage during large queries
- Set up alerts for slow queries

### Data Maintenance
- Regular data updates from source
- Index optimization
- Data validation and cleanup
- Backup and recovery procedures

### Scaling Considerations
- Database sharding for large datasets
- Read replicas for high-traffic scenarios
- Caching strategies for frequently accessed data
- CDN integration for static data

## Security Considerations

### Input Validation
- All query parameters are validated
- SQL injection prevention through parameterized queries
- Coordinate validation to prevent invalid geospatial queries
- Pagination limits to prevent DoS attacks

### Access Control
- API rate limiting
- Authentication and authorization (if required)
- CORS configuration
- Request logging and monitoring

## Conclusion

The Location API provides a comprehensive solution for searching and filtering Indian postal office locations. With over 150,000 records, geospatial search capabilities, and optimized performance, it serves as a robust foundation for location-based applications.

Key features include:
- ✅ Comprehensive text search across multiple fields
- ✅ Geospatial search with radius-based queries
- ✅ Multiple filter combinations
- ✅ Pagination and sorting capabilities
- ✅ Statistics and metadata endpoints
- ✅ Performance optimized with proper indexing
- ✅ RESTful API design with consistent responses
- ✅ Comprehensive error handling
- ✅ Production-ready implementation

The API is ready for integration with web applications, mobile apps, and other services requiring location data functionality.
