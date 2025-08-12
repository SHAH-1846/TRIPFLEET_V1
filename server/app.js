/**
 * Main Application Entry Point
 * Express server configuration with security, middleware, and route setup
 */

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cron = require("node-cron");
const dotenv = require("dotenv");
const path = require("path");

// Database
const db = require("./db/config");

// Utilities
const fetchDisposableEmailDomains = require("./validations/email-validations/fetchDisposableDomains");
const cleanupUploads = require("./utils/cleanupOrphanedFiles");

// Middleware
const { 
  securityHeaders, 
  corsOptions, 
  errorHandler, 
  requestLogger 
} = require("./utils/middleware");

// Routes
const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");
const tripRoutes = require("./routes/tripRoutes");
const vehicleRoutes = require("./routes/vehicleRoutes");
const customerRequestRoutes = require("./routes/customerRequestRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const imageRoutes = require("./routes/imageRoutes");
const documentRoutes = require("./routes/documentRoutes");
const driverConnectionRoutes = require("./routes/driverConnectionRoutes");

// Passport configuration
const passport = require("passport");
const session = require("express-session");
require("./utils/config/passport");

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Trust proxy for secure headers
app.set('trust proxy', 1);

// Security middleware
app.use(securityHeaders);
app.use(corsOptions);

// Body parsing middleware
app.use(express.json({ 
  limit: process.env.BODY_LIMIT || "10mb",
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: process.env.BODY_LIMIT || "10mb" 
}));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(requestLogger);
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
  },
  name: 'sessionId' // Change default session name for security
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const users = require("./db/models/users");
    const user = await users.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    statusCode: 200,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API documentation endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    statusCode: 200,
    message: "Drivers App API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
          endpoints: {
        auth: "/auth",
        users: "/users",
        trips: "/trips",
        vehicles: "/vehicles",
        bookings: "/bookings",
        customerRequests: "/customer-requests",
        images: "/images",
        documents: "/documents",
        driverConnections: "/driver-connections"
      },
    documentation: process.env.API_DOCS_URL || "Documentation not available"
  });
});

// Static file serving
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/assets", express.static(path.join(__dirname, "assets")));


// API Routes with versioning
const apiV1 = express.Router();

// Mount routes
apiV1.use("/auth", authRoutes);
apiV1.use("/users", userRoutes);
apiV1.use("/trips", tripRoutes);
apiV1.use("/vehicles", vehicleRoutes);
apiV1.use("/customer-requests", customerRequestRoutes);
apiV1.use("/bookings", bookingRoutes);
apiV1.use("/images", imageRoutes);
apiV1.use("/documents", documentRoutes);
apiV1.use("/driver-connections", driverConnectionRoutes);

// Mount API version
app.use("/api/v1", apiV1);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: "Endpoint not found",
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// Database connection
const connectDatabase = async () => {
  try {
    await db.connect();
    console.log("✅ Database connected successfully");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    process.exit(1);
  }
};

// Initialize scheduled tasks
const initializeScheduledTasks = () => {
  // Update disposable email domains daily at midnight
  cron.schedule("0 0 * * *", async () => {
    try {
      console.log("[CRON] Updating disposable email domains...");
      await fetchDisposableEmailDomains();
      console.log("[CRON] Disposable email domains updated successfully");
    } catch (error) {
      console.error("[CRON] Failed to update disposable email domains:", error);
    }
  });

  // Cleanup orphaned files daily at 2 AM
  cron.schedule("0 2 * * *", async () => {
    try {
      console.log("[CRON] Starting cleanup task...");
      await cleanupUploads();
      console.log("[CRON] Cleanup task completed successfully");
    } catch (error) {
      console.error("[CRON] Cleanup task failed:", error);
    }
  });

  console.log("✅ Scheduled tasks initialized");
};

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  // Close database connection
  db.close();
  console.log("✅ Database connection closed");
  
  // Exit process
  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDatabase();
    
    // Initialize scheduled tasks
    initializeScheduledTasks();
    
    // Fetch disposable email domains on startup
    await fetchDisposableEmailDomains();
    
    // Start server
    const PORT = Number(process.env.PORT) || 3002;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`⏰ Started at: ${new Date().toISOString()}`);
    });
    
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Start the application
startServer();
