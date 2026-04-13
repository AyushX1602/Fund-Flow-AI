const express = require("express");
const router = express.Router();
const Joi = require("joi");
const transactionController = require("../controllers/transactionController");
const { authenticate, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");

// ── Validation Schemas ──
const createSchema = {
  body: Joi.object({
    transactionId: Joi.string().optional(),
    amount: Joi.number().positive().required(),
    currency: Joi.string().default("INR").optional(),
    type: Joi.string().valid("UPI", "NEFT", "RTGS", "IMPS", "WIRE", "CASH_DEPOSIT", "CASH_WITHDRAWAL").required(),
    channel: Joi.string().valid("MOBILE_APP", "NET_BANKING", "ATM", "BRANCH", "POS", "API").required(),
    senderAccountId: Joi.string().required(),
    receiverAccountId: Joi.string().required(),
    upiVpaSender: Joi.string().optional().allow(null, ""),
    upiVpaReceiver: Joi.string().optional().allow(null, ""),
    pspSender: Joi.string().optional().allow(null, ""),
    pspReceiver: Joi.string().optional().allow(null, ""),
    vpaAgeDays: Joi.number().integer().min(0).optional().allow(null),
    chainId: Joi.string().optional().allow(null, ""),
    ringId: Joi.string().optional().allow(null, ""),
    ipAddress: Joi.string().optional().allow(null, ""),
    deviceId: Joi.string().optional().allow(null, ""),
    location: Joi.string().optional().allow(null, ""),
    description: Joi.string().optional().allow(null, ""),
    timestamp: Joi.date().optional(),
  }),
};

const simulateSchema = {
  body: Joi.object({
    rate: Joi.number().min(0.5).max(50).default(2).optional(),
    count: Joi.number().integer().min(1).max(500).default(50).optional(),
    fraudRatio: Joi.number().min(0).max(1).default(0.08).optional(),
  }),
};

// ── Routes ──
router.get("/", authenticate, transactionController.list);
router.get("/stats", authenticate, transactionController.getStats);
router.get("/:id", authenticate, transactionController.getById);
router.post("/", authenticate, validate(createSchema), transactionController.create);

const bulkSchema = {
  body: Joi.object({
    transactions: Joi.array().items(createSchema.body).min(1).max(100).required(),
  }),
};
router.post("/bulk", authenticate, validate(bulkSchema), transactionController.bulkCreate);
router.post("/simulate", authenticate, authorize("SUPERVISOR", "ADMIN"), validate(simulateSchema), transactionController.simulate);
router.post("/simulate/stop", authenticate, authorize("SUPERVISOR", "ADMIN"), transactionController.stopSim);

module.exports = router;
