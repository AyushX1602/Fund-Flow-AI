const express = require("express");
const router = express.Router();
const Joi = require("joi");
const accountController = require("../controllers/accountController");
const { authenticate, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");

// ── Validation Schemas ──
const createSchema = {
  body: Joi.object({
    accountNumber: Joi.string().required(),
    accountHolder: Joi.string().required(),
    bankName: Joi.string().required(),
    ifscCode: Joi.string().optional().allow(null, ""),
    accountType: Joi.string().valid("SAVINGS", "CURRENT", "SALARY", "NRI").default("SAVINGS").optional(),
    balance: Joi.number().min(0).default(0).optional(),
    kycType: Joi.string().valid("FULL_KYC", "OTP_BASED", "MIN_KYC").default("FULL_KYC").optional(),
    aadhaarLinked: Joi.boolean().default(false).optional(),
    panLinked: Joi.boolean().default(false).optional(),
    vpa: Joi.string().optional().allow(null, ""),
  }),
};

const updateSchema = {
  body: Joi.object({
    accountHolder: Joi.string().optional(),
    bankName: Joi.string().optional(),
    ifscCode: Joi.string().optional().allow(null, ""),
    accountType: Joi.string().valid("SAVINGS", "CURRENT", "SALARY", "NRI").optional(),
    balance: Joi.number().min(0).optional(),
    kycType: Joi.string().valid("FULL_KYC", "OTP_BASED", "MIN_KYC").optional(),
    aadhaarLinked: Joi.boolean().optional(),
    panLinked: Joi.boolean().optional(),
    vpa: Joi.string().optional().allow(null, ""),
  }).min(1),
};

const freezeSchema = {
  body: Joi.object({
    reason: Joi.string().optional().allow(null, ""),
  }),
};

// ── Routes ──
router.get("/", authenticate, accountController.list);
router.get("/:id", authenticate, accountController.getById);
router.post("/", authenticate, validate(createSchema), accountController.create);
router.put("/:id", authenticate, validate(updateSchema), accountController.update);
router.put("/:id/freeze", authenticate, authorize("SUPERVISOR", "ADMIN"), validate(freezeSchema), accountController.freezeAccount);
router.put("/:id/unfreeze", authenticate, authorize("SUPERVISOR", "ADMIN"), validate(freezeSchema), accountController.unfreezeAccount);
router.get("/:id/transactions", authenticate, accountController.getTransactions);
router.get("/:id/risk-profile", authenticate, accountController.getRiskProfile);

module.exports = router;
