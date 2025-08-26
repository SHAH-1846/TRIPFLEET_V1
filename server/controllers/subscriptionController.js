const { Types } = require("mongoose");

const SubscriptionPlan = require("../db/models/subscription_plans");
const DriverSubscription = require("../db/models/driver_subscriptions");
const LeadPricing = require("../db/models/lead_pricing");
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

const { subscriptionSchemas } = require("../validations/schemas");

// Admin: Plans CRUD
exports.createPlan = async (req, res) => {
  try {
    const { error, value } = subscriptionSchemas.createPlan.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    const exists = await SubscriptionPlan.findOne({ name: value.name });
    if (exists) return res.status(409).json(badRequest("Plan with this name already exists"));

    const plan = await SubscriptionPlan.create(value);
    return res.status(201).json(created({ plan }, "Plan created"));
  } catch (err) {
    console.error("createPlan error", err);
    return res.status(500).json(serverError("Failed to create plan"));
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { error, value } = subscriptionSchemas.updatePlan.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    const plan = await SubscriptionPlan.findByIdAndUpdate(planId, { ...value, updatedAt: new Date() }, { new: true });
    if (!plan) return res.status(404).json(notFound("Plan not found"));
    return res.json(updated({ plan }, "Plan updated"));
  } catch (err) {
    console.error("updatePlan error", err);
    return res.status(500).json(serverError("Failed to update plan"));
  }
};

exports.listPlans = async (_req, res) => {
  try {
    const plans = await SubscriptionPlan.find({isActive : true});
    return res.json(success(plans, "Plans retrieved"));
  } catch (err) {
    console.error("listPlans error", err);
    return res.status(500).json(serverError("Failed to get plans"));
  }
};

exports.deletePlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const plan = await SubscriptionPlan.findByIdAndUpdate(planId, { isActive: false, updatedAt: new Date() }, { new: true });
    if (!plan) return res.status(404).json(notFound("Plan not found"));
    return res.json(deleted("Plan archived"));
  } catch (err) {
    console.error("deletePlan error", err);
    return res.status(500).json(serverError("Failed to delete plan"));
  }
};

// Admin: Lead pricing
exports.createLeadPricing = async (req, res) => {
  try {
    const { error, value } = subscriptionSchemas.leadPricingCreate.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    const overlap = await LeadPricing.findOne({
      $or: [
        { distanceKmFrom: { $lte: value.distanceKmFrom }, distanceKmTo: { $gt: value.distanceKmFrom } },
        { distanceKmFrom: { $lt: value.distanceKmTo }, distanceKmTo: { $gte: value.distanceKmTo } },
      ],
    });
    if (overlap) return res.status(409).json(badRequest("Overlapping distance band exists"));

    const pricing = await LeadPricing.create(value);
    return res.status(201).json(created({ pricing }, "Lead pricing created"));
  } catch (err) {
    console.error("createLeadPricing error", err);
    return res.status(500).json(serverError("Failed to create lead pricing"));
  }
};

exports.updateLeadPricing = async (req, res) => {
  try {
    const { pricingId } = req.params;
    const { error, value } = subscriptionSchemas.leadPricingUpdate.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    const pricing = await LeadPricing.findByIdAndUpdate(pricingId, { ...value, updatedAt: new Date() }, { new: true });
    if (!pricing) return res.status(404).json(notFound("Lead pricing not found"));
    return res.json(updated({ pricing }, "Lead pricing updated"));
  } catch (err) {
    console.error("updateLeadPricing error", err);
    return res.status(500).json(serverError("Failed to update lead pricing"));
  }
};

exports.listLeadPricing = async (_req, res) => {
  try {
    const bands = await LeadPricing.find({ isActive: true }).sort({ distanceKmFrom: 1 });
    return res.json(success(bands, "Lead pricing bands retrieved"));
  } catch (err) {
    console.error("listLeadPricing error", err);
    return res.status(500).json(serverError("Failed to get lead pricing"));
  }
};

// Driver: Subscribe / Upgrade / Cancel / Status
const getActiveSubscription = async (driverId) => {
  return DriverSubscription.findOne({ driver: driverId, status: "active", endDate: { $gte: new Date() } }).populate("plan");
};

const calculateProratedUpgrade = (currentPlan, currentSub, newPlan) => {
  const now = new Date();
  const totalMs = currentSub.endDate.getTime() - currentSub.startDate.getTime();
  const remainingMs = Math.max(0, currentSub.endDate.getTime() - now.getTime());
  const remainingRatio = totalMs > 0 ? remainingMs / totalMs : 0;
  const creditMinor = Math.round((currentPlan.priceMinor || 0) * remainingRatio);
  const dueMinor = Math.max(0, (newPlan.priceMinor || 0) - creditMinor);
  return { creditMinor, dueMinor };
};

exports.subscribe = async (req, res) => {
  try {
    const driverId = req.user.user_id;
    const { error, value } = subscriptionSchemas.subscribe.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    const user = await users.findById(driverId);
    if (!user || !user.isActive) return res.status(401).json(unauthorized("User not found or inactive"));

    const plan = await SubscriptionPlan.findById(value.planId);
    if (!plan || !plan.isActive) return res.status(404).json(notFound("Plan not found or inactive"));

    const existing = await getActiveSubscription(driverId);
    if (existing) return res.status(400).json(badRequest("Active subscription already exists. Use upgrade."));

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    const sub = await DriverSubscription.create({
      driver: driverId,
      plan: plan._id,
      status: "active",
      startDate,
      endDate,
      priceMinorPaid: plan.priceMinor,
      currency: plan.currency,
    });

    const populated = await DriverSubscription.findById(sub._id).populate("plan");
    return res.status(201).json(created({ subscription: populated }, "Subscribed successfully"));
  } catch (err) {
    console.error("subscribe error", err);
    return res.status(500).json(serverError("Failed to subscribe"));
  }
};

exports.upgrade = async (req, res) => {
  try {
    const driverId = req.user.user_id;
    const { error, value } = subscriptionSchemas.upgrade.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    const currentSub = await getActiveSubscription(driverId);
    if (!currentSub) return res.status(400).json(badRequest("No active subscription to upgrade"));

    const newPlan = await SubscriptionPlan.findById(value.newPlanId);
    if (!newPlan || !newPlan.isActive) return res.status(404).json(notFound("New plan not found or inactive"));

    if (String(currentSub.plan._id) === String(newPlan._id)) {
      return res.status(400).json(badRequest("Already on this plan"));
    }

    let dueMinor = newPlan.priceMinor;
    let creditMinor = 0;
    if (value.strategy === "prorate") {
      const calc = calculateProratedUpgrade(currentSub.plan, currentSub, newPlan);
      creditMinor = calc.creditMinor;
      dueMinor = calc.dueMinor;
    }

    // End current subscription now
    await DriverSubscription.findByIdAndUpdate(currentSub._id, { status: "expired", endDate: new Date(), updatedAt: new Date() });

    // Start new subscription from now
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + newPlan.durationDays * 24 * 60 * 60 * 1000);
    const sub = await DriverSubscription.create({
      driver: driverId,
      plan: newPlan._id,
      status: "active",
      startDate,
      endDate,
      priceMinorPaid: dueMinor,
      currency: newPlan.currency,
    });

    const populated = await DriverSubscription.findById(sub._id).populate("plan");
    return res.json(updated({ subscription: populated, creditMinor, dueMinor }, "Upgraded plan successfully"));
  } catch (err) {
    console.error("upgrade error", err);
    return res.status(500).json(serverError("Failed to upgrade"));
  }
};

exports.cancel = async (req, res) => {
  try {
    const driverId = req.user.user_id;
    const { error, value } = subscriptionSchemas.cancel.validate(req.body || {}, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json(badRequest("Validation failed", error.details));

    const currentSub = await getActiveSubscription(driverId);
    if (!currentSub) return res.status(400).json(badRequest("No active subscription to cancel"));

    await DriverSubscription.findByIdAndUpdate(currentSub._id, {
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: value.reason,
      updatedAt: new Date(),
    });

    return res.json(updated({}, "Cancelled subscription"));
  } catch (err) {
    console.error("cancel error", err);
    return res.status(500).json(serverError("Failed to cancel"));
  }
};

exports.status = async (req, res) => {
  try {
    const driverId = req.user.user_id;
    const sub = await getActiveSubscription(driverId);
    return res.json(success({ subscription: sub || null }, "Subscription status"));
  } catch (err) {
    console.error("status error", err);
    return res.status(500).json(serverError("Failed to get status"));
  }
};


