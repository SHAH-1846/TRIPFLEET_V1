const { Types } = require("mongoose");

const TokenPlan = require("../db/models/token_purchase_plans");
const TokenWallet = require("../db/models/token_wallets");
const TokenTxn = require("../db/models/token_transactions");
const LeadTokens = require("../db/models/lead_tokens");
const TripTokens = require("../db/models/trip_tokens");
const FreeTokenSettings = require("../db/models/free_token_settings");
const users = require("../db/models/users");

const {
  success,
  created,
  updated,
  deleted,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
} = require("../utils/response-handler");

const { tokenSchemas } = require("../validations/schemas");

// Helpers
const getOrCreateWallet = async (driverId) => {
  let wallet = await TokenWallet.findOne({ driver: driverId });
  if (!wallet) wallet = await TokenWallet.create({ driver: driverId, balance: 0 });
  return wallet;
};

const creditTokens = async (driverId, amount, reason, addedBy, planId = null) => {
  const wallet = await getOrCreateWallet(driverId);
  wallet.balance += amount;
  await wallet.save();
  await TokenTxn.create({ driver: driverId, type: "credit", amount, reason, addedBy, plan: planId });
  return wallet;
};

const debitTokens = async (driverId, amount, reason, addedBy) => {
  const wallet = await getOrCreateWallet(driverId);
  if (wallet.balance < amount) throw new Error("INSUFFICIENT_TOKENS");
  wallet.balance -= amount;
  await wallet.save();
  await TokenTxn.create({ driver: driverId, type: "debit", amount, reason, addedBy });
  return wallet;
};

// Admin: Token plans CRUD
exports.createTokenPlan = async (req, res) => {
  try {
    const { error, value } = tokenSchemas.createTokenPlan.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    const exists = await TokenPlan.findOne({ name: value.name });
    if (exists) return res.status(409).json(badRequest("Plan with this name already exists"));

    const plan = await TokenPlan.create({ ...value, addedBy: req.user.user_id });
    return res.status(201).json(created({ plan }, "Token plan created"));
  } catch (err) {
    console.error("createTokenPlan error", err);
    return res.status(500).json(serverError("Failed to create token plan"));
  }
};

exports.updateTokenPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { error, value } = tokenSchemas.updateTokenPlan.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    const plan = await TokenPlan.findByIdAndUpdate(planId, { ...value, lastUpdatedBy: req.user.user_id, updatedAt: new Date() }, { new: true });
    if (!plan) return res.status(404).json(notFound("Token plan not found"));
    return res.json(updated({ plan }, "Token plan updated"));
  } catch (err) {
    console.error("updateTokenPlan error", err);
    return res.status(500).json(serverError("Failed to update token plan"));
  }
};

exports.listTokenPlans = async (_req, res) => {
  try {
    const plans = await TokenPlan.find({ isActive: true });
    return res.json(success(plans, "Token plans retrieved"));
  } catch (err) {
    console.error("listTokenPlans error", err);
    return res.status(500).json(serverError("Failed to get token plans"));
  }
};

exports.deleteTokenPlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = await TokenPlan.findByIdAndUpdate(planId, { isActive: false, deletedBy: req.user.user_id, updatedAt: new Date() }, { new: true });
    if (!plan) return res.status(404).json(notFound("Token plan not found"));
    return res.json(deleted("Token plan archived"));
  } catch (err) {
    console.error("deleteTokenPlan error", err);
    return res.status(500).json(serverError("Failed to delete token plan"));
  }
};

// Driver: purchase token plan
exports.purchaseTokenPlan = async (req, res) => {
  try {
    const driverId = req.user.user_id;
    const { error, value } = tokenSchemas.purchaseTokenPlan.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    const plan = await TokenPlan.findById(value.planId);
    if (!plan || !plan.isActive) return res.status(404).json(notFound("Token plan not found or inactive"));

    // Payment is assumed successful (integrate gateway later)
    const wallet = await creditTokens(driverId, plan.tokensAmount, `Purchase plan ${plan.name}`, driverId, plan._id);

    const responseData = { walletBalance: wallet.balance, tokensCredited: plan.tokensAmount, plan: { id: plan._id, name: plan.name } };
    return res.status(201).json(created(responseData, "Tokens purchased and credited"));
  } catch (err) {
    console.error("purchaseTokenPlan error", err);
    return res.status(500).json(serverError("Failed to purchase tokens"));
  }
};

// Wallet operations
exports.credit = async (req, res) => {
  try {
    const { error, value } = tokenSchemas.walletCredit.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    if (!Types.ObjectId.isValid(value.driverId)) return res.status(400).json(badRequest("Invalid driverId format"));
    const driver = await users.findById(value.driverId);
    if (!driver || !driver.isActive) return res.status(404).json(notFound("Driver not found or inactive"));

    const wallet = await creditTokens(value.driverId, value.amount, value.reason || "Manual credit", req.user.user_id);
    return res.status(201).json(created({ balance: wallet.balance }, "Wallet credited"));
  } catch (err) {
    console.error("wallet credit error", err);
    return res.status(500).json(serverError("Failed to credit wallet"));
  }
};

exports.debit = async (req, res) => {
  try {
    const { error, value } = tokenSchemas.walletDebit.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    if (!Types.ObjectId.isValid(value.driverId)) return res.status(400).json(badRequest("Invalid driverId format"));
    const driver = await users.findById(value.driverId);
    if (!driver || !driver.isActive) return res.status(404).json(notFound("Driver not found or inactive"));

    try {
      const wallet = await debitTokens(value.driverId, value.amount, value.reason || "Manual debit", req.user.user_id);
      return res.json(updated({ balance: wallet.balance }, "Wallet debited"));
    } catch (e) {
      if (e.message === "INSUFFICIENT_TOKENS") return res.status(400).json(badRequest("Insufficient tokens"));
      throw e;
    }
  } catch (err) {
    console.error("wallet debit error", err);
    return res.status(500).json(serverError("Failed to debit wallet"));
  }
};

exports.balance = async (req, res) => {
  try {
    const driverId = req.user.user_id;
    const wallet = await getOrCreateWallet(driverId);
    return res.json(success({ balance: wallet.balance }, "Wallet balance"));
  } catch (err) {
    console.error("wallet balance error", err);
    return res.status(500).json(serverError("Failed to fetch balance"));
  }
};

// Admin: token usage bands (lead/trip)
exports.createLeadTokens = async (req, res) => {
  try {
    const { error, value } = tokenSchemas.leadTokensCreate.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    const overlap = await LeadTokens.findOne({
      $or: [
        { distanceKmFrom: { $lte: value.distanceKmFrom }, distanceKmTo: { $gt: value.distanceKmFrom } },
        { distanceKmFrom: { $lt: value.distanceKmTo }, distanceKmTo: { $gte: value.distanceKmTo } },
      ],
    });
    // const overlap = await LeadTokens.findOne({
    //   distanceKmFrom: { $lt: value.distanceKmTo },
    //   distanceKmTo: { $gte: value.distanceKmFrom }
    // });    
    if (overlap) return res.status(409).json(badRequest("Overlapping distance band exists"));

    const band = await LeadTokens.create({ ...value, addedBy: req.user.user_id });
    return res.status(201).json(created({ band }, "Lead tokens band created"));
  } catch (err) {
    console.error("createLeadTokens error", err);
    return res.status(500).json(serverError("Failed to create lead tokens band"));
  }
};

exports.updateLeadTokens = async (req, res) => {
  try {
    const { bandId } = req.params;
    const { error, value } = tokenSchemas.leadTokensUpdate.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    // Overlap check if range fields provided
    if (value.distanceKmFrom !== undefined || value.distanceKmTo !== undefined) {
      // Fetch current to fill missing ends
      const current = await LeadTokens.findById(bandId);
      if (!current) return res.status(404).json(notFound("Lead tokens band not found"));
      const from = value.distanceKmFrom !== undefined ? value.distanceKmFrom : current.distanceKmFrom;
      const to = value.distanceKmTo !== undefined ? value.distanceKmTo : current.distanceKmTo;

      const overlap = await LeadTokens.findOne({
        _id: { $ne: bandId },
        $or: [
          { distanceKmFrom: { $lte: from }, distanceKmTo: { $gt: from } },
          { distanceKmFrom: { $lt: to }, distanceKmTo: { $gte: to } },
          { distanceKmFrom: { $gte: from }, distanceKmTo: { $lte: to } },
        ],
      });
      if (overlap) return res.status(409).json(badRequest("Overlapping distance band exists"));
    }

    const band = await LeadTokens.findByIdAndUpdate(bandId, { ...value, lastUpdatedBy: req.user.user_id, updatedAt: new Date() }, { new: true });
    if (!band) return res.status(404).json(notFound("Lead tokens band not found"));
    return res.json(updated({ band }, "Lead tokens band updated"));
  } catch (err) {
    console.error("updateLeadTokens error", err);
    return res.status(500).json(serverError("Failed to update lead tokens band"));
  }
};

exports.listLeadTokens = async (_req, res) => {
  try {
    const bands = await LeadTokens.find({ isActive: true }).sort({ distanceKmFrom: 1 });
    return res.json(success(bands, "Lead tokens bands retrieved"));
  } catch (err) {
    console.error("listLeadTokens error", err);
    return res.status(500).json(serverError("Failed to get lead tokens bands"));
  }
};

exports.deleteLeadTokens = async (req, res) => {
  try {
    const { bandId } = req.params;
    const band = await LeadTokens.findByIdAndUpdate(bandId, { isActive: false, deletedBy: req.user.user_id, updatedAt: new Date() }, { new: true });
    if (!band) return res.status(404).json(notFound("Lead tokens band not found"));
    return res.json(deleted("Lead tokens band archived"));
  } catch (err) {
    console.error("deleteLeadTokens error", err);
    return res.status(500).json(serverError("Failed to delete lead tokens band"));
  }
};

exports.createTripTokens = async (req, res) => {
  try {
    const { error, value } = tokenSchemas.tripTokensCreate.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    const overlap = await TripTokens.findOne({
      $or: [
        { distanceKmFrom: { $lte: value.distanceKmFrom }, distanceKmTo: { $gt: value.distanceKmFrom } },
        { distanceKmFrom: { $lt: value.distanceKmTo }, distanceKmTo: { $gte: value.distanceKmTo } },
      ],
    });
    if (overlap) return res.status(409).json(badRequest("Overlapping distance band exists"));

    const band = await TripTokens.create({ ...value, addedBy: req.user.user_id });
    return res.status(201).json(created({ band }, "Trip tokens band created"));
  } catch (err) {
    console.error("createTripTokens error", err);
    return res.status(500).json(serverError("Failed to create trip tokens band"));
  }
};

exports.updateTripTokens = async (req, res) => {
  try {
    const { bandId } = req.params;
    const { error, value } = tokenSchemas.tripTokensUpdate.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    // Overlap check if range fields provided
    if (value.distanceKmFrom !== undefined || value.distanceKmTo !== undefined) {
      // Fetch current to fill missing ends
      const current = await TripTokens.findById(bandId);
      if (!current) return res.status(404).json(notFound("Trip tokens band not found"));
      const from = value.distanceKmFrom !== undefined ? value.distanceKmFrom : current.distanceKmFrom;
      const to = value.distanceKmTo !== undefined ? value.distanceKmTo : current.distanceKmTo;

      const overlap = await TripTokens.findOne({
        _id: { $ne: bandId },
        $or: [
          { distanceKmFrom: { $lte: from }, distanceKmTo: { $gt: from } },
          { distanceKmFrom: { $lt: to }, distanceKmTo: { $gte: to } },
          { distanceKmFrom: { $gte: from }, distanceKmTo: { $lte: to } },
        ],
      });
      if (overlap) return res.status(409).json(badRequest("Overlapping distance band exists"));
    }

    const band = await TripTokens.findByIdAndUpdate(bandId, { ...value, lastUpdatedBy: req.user.user_id, updatedAt: new Date() }, { new: true });
    if (!band) return res.status(404).json(notFound("Trip tokens band not found"));
    return res.json(updated({ band }, "Trip tokens band updated"));
  } catch (err) {
    console.error("updateTripTokens error", err);
    return res.status(500).json(serverError("Failed to update trip tokens band"));
  }
};

exports.listTripTokens = async (_req, res) => {
  try {
    const bands = await TripTokens.find({ isActive: true }).sort({ distanceKmFrom: 1 });
    return res.json(success(bands, "Trip tokens bands retrieved"));
  } catch (err) {
    console.error("listTripTokens error", err);
    return res.status(500).json(serverError("Failed to get trip tokens bands"));
  }
};

exports.deleteTripTokens = async (req, res) => {
  try {
    const { bandId } = req.params;
    const band = await TripTokens.findByIdAndUpdate(bandId, { isActive: false, deletedBy: req.user.user_id, updatedAt: new Date() }, { new: true });
    if (!band) return res.status(404).json(notFound("Trip tokens band not found"));
    return res.json(deleted("Trip tokens band archived"));
  } catch (err) {
    console.error("deleteTripTokens error", err);
    return res.status(500).json(serverError("Failed to delete trip tokens band"));
  }
};

// Admin: free tokens settings
exports.upsertFreeTokenSettings = async (req, res) => {
  try {
    const { error, value } = tokenSchemas.freeTokenSettingsUpsert.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    let settings = await FreeTokenSettings.findOne({});
    if (!settings) {
      settings = await FreeTokenSettings.create({ ...value, addedBy: req.user.user_id });
    } else {
      settings = await FreeTokenSettings.findByIdAndUpdate(settings._id, { ...value, lastUpdatedBy: req.user.user_id, updatedAt: new Date() }, { new: true });
    }
    return res.json(updated({ settings }, "Free token settings saved"));
  } catch (err) {
    console.error("upsertFreeTokenSettings error", err);
    return res.status(500).json(serverError("Failed to save free token settings"));
  }
};

// Hook: credit free tokens to driver (to be called post-registration)
exports.creditFreeTokensIfAny = async (driverId) => {
  const settings = await FreeTokenSettings.findOne({ isActive: true });
  if (!settings || !settings.tokensOnRegistration) return null;
  const wallet = await creditTokens(driverId, settings.tokensOnRegistration, "Free tokens on registration", null);
  return wallet;
};
