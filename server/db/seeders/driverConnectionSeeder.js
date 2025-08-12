const mongoose = require("mongoose");
const driverConnections = require("../models/driver_connections");
const users = require("../models/users");
const userTypes = require("../models/user_types");

const seedDriverConnections = async () => {
  try {
    console.log("🌱 Seeding driver connections...");

    // Get driver user type
    const driverUserType = await userTypes.findOne({ name: 'driver' });
    if (!driverUserType) {
      console.log("❌ Driver user type not found. Please run userTypeSeeder first.");
      return;
    }

    // Get some driver users
    const driverUsers = await users.find({ 
      user_type: driverUserType._id,
      isActive: true 
    }).limit(10);

    if (driverUsers.length < 2) {
      console.log("❌ Need at least 2 driver users to create connections. Please run userSeeder first.");
      return;
    }

    // Clear existing connections
    await driverConnections.deleteMany({});
    console.log("🧹 Cleared existing driver connections");

    // Create sample connections
    const connections = [];
    
    // Create some accepted connections
    for (let i = 0; i < Math.min(5, Math.floor(driverUsers.length / 2)); i++) {
      const driver1 = driverUsers[i * 2];
      const driver2 = driverUsers[i * 2 + 1];
      
      if (driver1 && driver2) {
        connections.push({
          requester: driver1._id,
          requested: driver2._id,
          status: 'accepted',
          respondedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
          isActive: true
        });
      }
    }

    // Create some pending connections
    for (let i = 0; i < Math.min(3, Math.floor(driverUsers.length / 2)); i++) {
      const driver1 = driverUsers[i * 2];
      const driver2 = driverUsers[i * 2 + 1];
      
      if (driver1 && driver2) {
        connections.push({
          requester: driver1._id,
          requested: driver2._id,
          status: 'pending',
          isActive: true
        });
      }
    }

    if (connections.length > 0) {
      await driverConnections.insertMany(connections);
      console.log(`✅ Created ${connections.length} driver connections`);
    } else {
      console.log("⚠️ No driver connections created");
    }

    console.log("🎉 Driver connections seeding completed!");

  } catch (error) {
    console.error("❌ Error seeding driver connections:", error);
  }
};

const clearDriverConnections = async () => {
  try {
    console.log("🧹 Clearing driver connections...");
    await driverConnections.deleteMany({});
    console.log("✅ Driver connections cleared successfully");
  } catch (error) {
    console.error("❌ Error clearing driver connections:", error);
  }
};

// Run seeder if called directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/tripfleet")
    .then(async () => {
      console.log("📦 Connected to database");
      
      if (process.argv.includes('--clear')) {
        await clearDriverConnections();
      } else {
        await seedDriverConnections();
      }
      
      mongoose.connection.close();
      console.log("🔌 Database connection closed");
    })
    .catch((error) => {
      console.error("❌ Database connection failed:", error);
      process.exit(1);
    });
}

module.exports = {
  seedDriverConnections,
  clearDriverConnections
};
