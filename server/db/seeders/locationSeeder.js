const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const locations = require("../models/locations");

// Load environment variables
dotenv.config();

/**
 * Location Data Seeder
 * 
 * This seeder imports location data from the Locations.json file into the database.
 * The data contains Indian postal office locations with coordinates.
 * 
 * Usage: 
 * - node db/seeders/locationSeeder.js up    (seed data)
 * - node db/seeders/locationSeeder.js down  (remove seeded data)
 */

async function connectDB() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Connected to MongoDB");
}

const seedLocations = async () => {
  try {
    console.log("🌍 Starting Location Data Seeding...");

    // Connect to database
    await connectDB();

    // Check if data already exists
    const existingCount = await locations.countDocuments();
    if (existingCount > 0) {
      console.log(`⚠️  Found ${existingCount} existing location records`);
      const response = await new Promise((resolve) => {
        process.stdout.write("Do you want to clear existing data and reseed? (y/N): ");
        process.stdin.once("data", (data) => {
          resolve(data.toString().trim().toLowerCase());
        });
      });
      
      if (response === "y" || response === "yes") {
        console.log("🗑️  Clearing existing location data...");
        await locations.deleteMany({});
        console.log("✅ Existing data cleared");
      } else {
        console.log("❌ Seeding cancelled");
        process.exit(0);
      }
    }

    // Read the JSON file
    const jsonFilePath = path.join(__dirname, "LocationDataset", "Locations.json");
    console.log(`📖 Reading location data from: ${jsonFilePath}`);

    if (!fs.existsSync(jsonFilePath)) {
      throw new Error(`Location data file not found: ${jsonFilePath}`);
    }

    // Read file with UTF-16 encoding (as detected by file command)
    const rawData = fs.readFileSync(jsonFilePath, "utf16le");
    
    // Remove BOM characters and clean the data
    const cleanData = rawData.replace(/^\uFEFF/, '').trim();
    
    // Handle the case where the file might be a JSON array or have extra characters
    let locationData;
    try {
      locationData = JSON.parse(cleanData);
    } catch (parseError) {
      console.error("❌ Error parsing JSON file:", parseError.message);
      console.log("🔍 Attempting to fix JSON format...");
      
      // Try to extract JSON array from the file
      const jsonMatch = cleanData.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          locationData = JSON.parse(jsonMatch[0]);
          console.log("✅ Successfully extracted JSON array from file");
        } catch (secondError) {
          throw new Error(`Failed to parse JSON even after extraction: ${secondError.message}`);
        }
      } else {
        throw new Error("Could not find valid JSON array in the file");
      }
    }

    console.log(`📊 Found ${locationData.length} location records to import`);

    // Transform and validate the data
    const transformedData = [];
    let validRecords = 0;
    let invalidRecords = 0;

    for (let i = 0; i < locationData.length; i++) {
      const record = locationData[i];
      
      try {
        // Validate required fields
        if (!record.CircleName || !record.RegionName || !record.DivisionName || 
            !record.OfficeName || !record.Pincode || !record.OfficeType || 
            !record.Delivery || !record.District || !record.StateName || 
            !record.Latitude || !record.Longitude) {
          invalidRecords++;
          continue;
        }

        // Parse coordinates
        const latitude = parseFloat(record.Latitude);
        const longitude = parseFloat(record.Longitude);

        // Validate coordinates
        if (isNaN(latitude) || isNaN(longitude) || 
            latitude < -90 || latitude > 90 || 
            longitude < -180 || longitude > 180) {
          invalidRecords++;
          continue;
        }

        // Transform to our schema format
        const transformedRecord = {
          circleName: record.CircleName.trim(),
          regionName: record.RegionName.trim(),
          divisionName: record.DivisionName.trim(),
          officeName: record.OfficeName.trim(),
          pincode: record.Pincode.trim(),
          officeType: record.OfficeType.trim(),
          delivery: record.Delivery.trim(),
          district: record.District.trim(),
          stateName: record.StateName.trim(),
          coordinates: {
            type: "Point",
            coordinates: [longitude, latitude], // GeoJSON format: [lng, lat]
          },
          isActive: true,
        };

        transformedData.push(transformedRecord);
        validRecords++;

        // Progress indicator for large datasets
        if (validRecords % 1000 === 0) {
          console.log(`📈 Processed ${validRecords} valid records...`);
        }

      } catch (error) {
        invalidRecords++;
        console.error(`❌ Error processing record ${i + 1}:`, error.message);
      }
    }

    console.log(`\n📊 Data Processing Summary:`);
    console.log(`✅ Valid records: ${validRecords}`);
    console.log(`❌ Invalid records: ${invalidRecords}`);
    console.log(`📈 Success rate: ${((validRecords / locationData.length) * 100).toFixed(2)}%`);

    if (validRecords === 0) {
      throw new Error("No valid records found to import");
    }

    // Import data in batches for better performance
    const batchSize = 1000;
    let importedCount = 0;

    console.log(`\n🚀 Starting data import in batches of ${batchSize}...`);

    for (let i = 0; i < transformedData.length; i += batchSize) {
      const batch = transformedData.slice(i, i + batchSize);
      
      try {
        await locations.insertMany(batch, { ordered: false });
        importedCount += batch.length;
        console.log(`✅ Imported batch ${Math.floor(i / batchSize) + 1}: ${batch.length} records (Total: ${importedCount})`);
      } catch (error) {
        console.error(`❌ Error importing batch ${Math.floor(i / batchSize) + 1}:`, error.message);
        // Continue with next batch even if current fails
      }
    }

    // Verify the import
    const finalCount = await locations.countDocuments();
    console.log(`\n🎯 Import Summary:`);
    console.log(`📊 Total records in database: ${finalCount}`);
    console.log(`📊 Expected records: ${validRecords}`);
    console.log(`📈 Import success rate: ${((finalCount / validRecords) * 100).toFixed(2)}%`);

    // Create some sample queries to verify data
    console.log(`\n🔍 Sample Data Verification:`);
    
    const sampleLocation = await locations.findOne();
    if (sampleLocation) {
      console.log(`📍 Sample location: ${sampleLocation.officeName}, ${sampleLocation.district}, ${sampleLocation.stateName}`);
    }

    const stateCount = await locations.distinct("stateName");
    console.log(`🏛️  Total states: ${stateCount.length}`);

    const districtCount = await locations.distinct("district");
    console.log(`🏘️  Total districts: ${districtCount.length}`);

    const officeTypeCount = await locations.distinct("officeType");
    console.log(`🏢 Office types: ${officeTypeCount.join(", ")}`);

    console.log("\n✅ Location data seeding completed successfully!");
    console.log("🚀 The locations API is now ready to use!");

  } catch (error) {
    console.error("❌ Error during location seeding:", error);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
};

/**
 * Remove all seeded location data from the database
 */
const removeLocations = async () => {
  try {
    console.log("🗑️ Starting Location Data Removal...");

    // Connect to database
    await connectDB();

    // Check if data exists
    const existingCount = await locations.countDocuments();
    if (existingCount === 0) {
      console.log("ℹ️ No location data found to remove");
      return;
    }

    console.log(`📊 Found ${existingCount} location records to remove`);

    // Remove all location data
    const result = await locations.deleteMany({});
    
    console.log(`✅ Successfully removed ${result.deletedCount} location records`);
    console.log("🗑️ Location data removal completed successfully!");

  } catch (error) {
    console.error("❌ Error during location removal:", error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
};

// CLI-based action
const action = process.argv[2]; // node locationSeeder.js up OR down

if (action === 'up') {
  seedLocations();
} else if (action === 'down') {
  removeLocations();
} else {
  console.log('❗ Please provide a valid action: up or down');
  console.log('Usage:');
  console.log('  node db/seeders/locationSeeder.js up    (seed data)');
  console.log('  node db/seeders/locationSeeder.js down  (remove seeded data)');
  process.exit(1);
}

module.exports = { seedLocations, removeLocations };
