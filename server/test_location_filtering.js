/**
 * Test script for location filtering functionality
 * This script demonstrates how to use the new location filtering features
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3002/api/v1';
const TEST_TOKEN = 'your_jwt_token_here'; // Replace with actual token

// Test coordinates (New York City area)
const NYC_COORDINATES = {
  manhattan: '-73.935242,40.730610',
  brooklyn: '-73.944157,40.678177',
  queens: '-73.794852,40.728223',
  bronx: '-73.864825,40.844781',
  statenIsland: '-74.150200,40.579500'
};

// Test scenarios
const testScenarios = [
  {
    name: 'Find trips near Manhattan',
    params: { currentLocation: NYC_COORDINATES.manhattan },
    description: 'Returns trips that pass through or near Manhattan'
  },
  {
    name: 'Find trips with pickup in Brooklyn',
    params: { pickupLocation: NYC_COORDINATES.brooklyn },
    description: 'Returns trips that start or pass through Brooklyn'
  },
  {
    name: 'Find trips with dropoff in Queens',
    params: { dropoffLocation: NYC_COORDINATES.queens },
    description: 'Returns trips that end or pass through Queens'
  },
  {
    name: 'Find trips from Bronx to Staten Island',
    params: { 
      pickupLocation: NYC_COORDINATES.bronx,
      dropoffLocation: NYC_COORDINATES.statenIsland,
      pickupDropoffBoth: 'true'
    },
    description: 'Returns trips that pass through both Bronx and Staten Island'
  },
  {
    name: 'Find trips near Manhattan with status filter',
    params: { 
      currentLocation: NYC_COORDINATES.manhattan,
      status: 'active',
      limit: 5
    },
    description: 'Returns active trips near Manhattan, limited to 5 results'
  },
  {
    name: 'Find trips with date range and location',
    params: { 
      pickupLocation: NYC_COORDINATES.brooklyn,
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31'
    },
    description: 'Returns trips from Brooklyn within date range'
  }
];

/**
 * Test a single scenario
 */
async function testScenario(scenario) {
  try {
    console.log(`\n🧪 Testing: ${scenario.name}`);
    console.log(`📝 Description: ${scenario.description}`);
    
    const queryParams = new URLSearchParams(scenario.params);
    const url = `${BASE_URL}/trips?${queryParams}`;
    
    console.log(`🔗 URL: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.success) {
      console.log(`✅ Success! Found ${response.data.data.length} trips`);
      console.log(`📊 Total trips: ${response.data.pagination.total}`);
      console.log(`📄 Page: ${response.data.pagination.page}/${response.data.pagination.totalPages}`);
      
      // Show first few trips
      if (response.data.data.length > 0) {
        console.log('\n📋 Sample trips:');
        response.data.data.slice(0, 3).forEach((trip, index) => {
          console.log(`  ${index + 1}. Trip ID: ${trip._id}`);
          console.log(`     Start: ${trip.tripStartLocation?.address || 'N/A'}`);
          console.log(`     End: ${trip.tripDestination?.address || 'N/A'}`);
          console.log(`     Status: ${trip.status?.name || 'N/A'}`);
        });
      }
    } else {
      console.log(`❌ Failed: ${response.data.message}`);
    }
    
  } catch (error) {
    if (error.response) {
      console.log(`❌ Error ${error.response.status}: ${error.response.data.message || 'Unknown error'}`);
    } else {
      console.log(`❌ Network error: ${error.message}`);
    }
  }
}

/**
 * Run all test scenarios
 */
async function runAllTests() {
  console.log('🚀 Starting Location Filtering Tests');
  console.log('=====================================');
  
  for (const scenario of testScenarios) {
    await testScenario(scenario);
    // Add delay between tests to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n✨ All tests completed!');
}

/**
 * Test specific scenario by index
 */
async function testSpecificScenario(index) {
  if (index >= 0 && index < testScenarios.length) {
    await testScenario(testScenarios[index]);
  } else {
    console.log('❌ Invalid scenario index');
  }
}

// Export functions for use in other scripts
module.exports = {
  testScenarios,
  testScenario,
  testSpecificScenario,
  runAllTests
};

// Run tests if this script is executed directly
if (require.main === module) {
  // Check if token is provided
  if (TEST_TOKEN === 'your_jwt_token_here') {
    console.log('❌ Please set a valid JWT token in TEST_TOKEN variable');
    console.log('💡 You can get a token by logging in through the API');
    process.exit(1);
  }
  
  runAllTests().catch(console.error);
}
