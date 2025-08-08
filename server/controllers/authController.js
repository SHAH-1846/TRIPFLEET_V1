/**
 * Authentication Controller
 * Handles user authentication, OTP verification, and Google OAuth
 */

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");
const { Types } = require("mongoose");

// Models
const users = require("../db/models/users");
const OTP = require("../db/models/otp");

// Utils
const {
  success,
  created,
  unauthorized,
  badRequest,
  validationError,
  serverError,
} = require("../utils/response-handler");
const { sendSMS } = require("../utils/sms");

// Validation schemas
const { authSchemas } = require("../validations/schemas");

// Constants
const OTP_EXPIRY_MINUTES = 5;
const TOKEN_EXPIRY = "10d";

/**
 * User login with email and password
 * @route POST /auth/login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await users
      .findOne({ email: email.toLowerCase() })
      .populate("user_type", "name")
      .select("+password");

    if (!user) {
      const response = unauthorized("Invalid email or password");
      return res.status(response.statusCode).json(response);
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const response = unauthorized("Invalid email or password");
      return res.status(response.statusCode).json(response);
    }

    // Check if user is active
    if (!user.isActive) {
      const response = unauthorized(
        "Account is deactivated. Please contact support."
      );
      return res.status(response.statusCode).json(response);
    }

    // Generate access token
    const accessToken = jwt.sign(
      {
        user_id: user._id,
        user_type: user.user_type.name,
        email: user.email,
      },
      process.env.PRIVATE_KEY,
      { expiresIn: TOKEN_EXPIRY }
    );

    // Remove password from response
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      user_type: user.user_type,
      profilePicture: user.profilePicture,
      isActive: user.isActive,
      lastLogin: new Date(),
    };

    // Update last login
    await users.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    const response = success(
      { user: userData, accessToken },
      "Login successful"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Login error:", error);
    const response = serverError("Authentication failed");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Request OTP for phone verification
 * @route POST /auth/request-otp
 */
exports.requestOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    // Check if phone number already exists
    // const existingUser = await users.findOne({ phone });
    // if (existingUser) {
    //   const response = badRequest("Phone number already registered");
    //   return res.status(response.statusCode).json(response);
    // }

    // Generate OTP
    const otp =
      process.env.NODE_ENV === "development"
        ? "1234"
        : otpGenerator.generate(6, {
            digits: true,
            alphabets: false,
            upperCase: false,
            specialChars: false,
          });

    // Hash OTP
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    // Save or update OTP record
    const otpRecord = await OTP.findOneAndUpdate(
      { phone },
      {
        otp: hashedOtp,
        createdAt: new Date(),
        attempts: 0,
      },
      { upsert: true, new: true }
    );

    // Send OTP via SMS (in production)
    if (process.env.NODE_ENV === "production") {
      try {
        await sendSMS(
          phone,
          `Your verification code is ${otp}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`
        );
      } catch (smsError) {
        console.error("SMS sending failed:", smsError);
        // Continue with OTP creation even if SMS fails
      }
    }

    // Generate OTP request token
    const otpRequestToken = jwt.sign(
      {
        id: otpRecord._id,
        phone: otpRecord.phone,
        type: "otp_request",
      },
      process.env.PRIVATE_KEY,
      { expiresIn: TOKEN_EXPIRY }
    );

    const response = success(
      {
        otpRequestToken,
        message:
          process.env.NODE_ENV === "development"
            ? `Development OTP: ${otp}`
            : "OTP sent successfully",
      },
      "OTP sent successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("OTP request error:", error);
    const response = serverError("Failed to send OTP");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Verify OTP and complete phone verification
 * @route POST /auth/verify-otp
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      const response = unauthorized("OTP request token required");
      return res.status(response.statusCode).json(response);
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.PRIVATE_KEY);
    } catch (jwtError) {
      const response = unauthorized("Invalid or expired OTP request token");
      return res.status(response.statusCode).json(response);
    }

    if (decoded.type !== "otp_request") {
      const response = unauthorized("Invalid token type");
      return res.status(response.statusCode).json(response);
    }

    // Find OTP record
    const otpRecord = await OTP.findById(decoded.id);
    if (!otpRecord) {
      const response = badRequest("OTP not found or expired");
      return res.status(response.statusCode).json(response);
    }

    // Check OTP expiry
    const now = new Date();
    const expiry = new Date(otpRecord.createdAt);
    expiry.setMinutes(expiry.getMinutes() + OTP_EXPIRY_MINUTES);

    if (now > expiry) {
      await OTP.findByIdAndDelete(otpRecord._id);
      const response = badRequest("OTP has expired");
      return res.status(response.statusCode).json(response);
    }

    // Check attempt limit
    if (otpRecord.attempts >= 3) {
      await OTP.findByIdAndDelete(otpRecord._id);
      const response = badRequest(
        "Too many failed attempts. Please request a new OTP."
      );
      return res.status(response.statusCode).json(response);
    }

    // Verify OTP
    const isOtpValid = await bcrypt.compare(otp.toString(), otpRecord.otp);
    if (!isOtpValid) {
      // Increment attempts
      await OTP.findByIdAndUpdate(otpRecord._id, { $inc: { attempts: 1 } });
      const response = badRequest("Invalid OTP");
      return res.status(response.statusCode).json(response);
    }

    // Check if user exists
    const existingUser = await users.findOne({ phone: otpRecord.phone });
    let phoneVerifiedToken;

    if (existingUser) {
      console.log("User exists");
      // User exists - generate login token
      phoneVerifiedToken = jwt.sign(
        {
          user_id: existingUser._id,
          user_type: existingUser.user_type,
          phone: existingUser.phone,
          type: "phone_verified_login",
        },
        process.env.PRIVATE_KEY,
        { expiresIn: TOKEN_EXPIRY }
      );

      // Clean up OTP record
      await OTP.findByIdAndDelete(otpRecord._id);
    } else {
      console.log("User does not exist");
      // New user - generate registration token
      phoneVerifiedToken = jwt.sign(
        {
          id: otpRecord._id,
          phone: otpRecord.phone,
          type: "phone_verified_registration",
        },
        process.env.PRIVATE_KEY,
        { expiresIn: TOKEN_EXPIRY }
      );
    }

    const response = success(
      {
        phoneVerifiedToken,
        isNewUser: !existingUser,
        user: existingUser
          ? {
              _id: existingUser._id,
              name: existingUser.name,
              email: existingUser.email,
              user_type: existingUser.user_type,
            }
          : null,
      },
      "OTP verified successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("OTP verification error:", error);
    const response = serverError("OTP verification failed");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Google OAuth callback handler
 * @route GET /auth/google/callback
 */
exports.googleOAuth = async (req, res) => {
  try {
    const userId = req.session.passport?.user;

    if (!userId) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/auth/error?message=Authentication failed`
      );
    }

    const user = await users.findById(userId).populate("user_type", "name");

    if (!user) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/auth/error?message=User not found`
      );
    }

    // Generate access token
    const accessToken = jwt.sign(
      {
        user_id: user._id,
        user_type: user.user_type.name,
        email: user.email,
      },
      process.env.PRIVATE_KEY,
      { expiresIn: TOKEN_EXPIRY }
    );

    // Update last login
    await users.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    // Redirect to frontend with token
    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/success?token=${accessToken}`
    );
  } catch (error) {
    console.error("Google OAuth error:", error);
    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/error?message=Authentication failed`
    );
  }
};

/**
 * Refresh access token
 * @route POST /auth/refresh-token
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      const response = badRequest("Refresh token is required");
      return res.status(response.statusCode).json(response);
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (jwtError) {
      const response = unauthorized("Invalid refresh token");
      return res.status(response.statusCode).json(response);
    }

    // Check if user still exists
    const user = await users
      .findById(decoded.user_id)
      .populate("user_type", "name");
    if (!user || !user.isActive) {
      const response = unauthorized("User not found or inactive");
      return res.status(response.statusCode).json(response);
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      {
        user_id: user._id,
        user_type: user.user_type.name,
        email: user.email,
      },
      process.env.PRIVATE_KEY,
      { expiresIn: TOKEN_EXPIRY }
    );

    const response = success(
      { accessToken: newAccessToken },
      "Token refreshed successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Token refresh error:", error);
    const response = serverError("Token refresh failed");
    return res.status(response.statusCode).json(response);
  }
};

/**
 * Logout user (invalidate token)
 * @route POST /auth/logout
 */
exports.logout = async (req, res) => {
  try {
    // In a real application, you might want to blacklist the token
    // For now, we'll just return success as the client should remove the token

    const response = success(null, "Logged out successfully");
    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Logout error:", error);
    const response = serverError("Logout failed");
    return res.status(response.statusCode).json(response);
  }
};
