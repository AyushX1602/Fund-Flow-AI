const express = require("express");
const router = express.Router();
const Joi = require("joi");
const alertController = require("../controllers/alertController");
const { authenticate, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");

// ── Validation Schemas ──
const assignSchema = {
  body: Joi.object({
    assignedToId: Joi.string().required(),
  }),
};

const statusSchema = {
  body: Joi.object({
    status: Joi.string()
      .valid("NEW", "REVIEWING", "ESCALATED", "RESOLVED_FRAUD", "RESOLVED_LEGITIMATE", "DISMISSED")
      .required(),
  }),
};

const resolveSchema = {
  body: Joi.object({
    resolution: Joi.string().optional().allow(null, ""),
    status: Joi.string()
      .valid("RESOLVED_FRAUD", "RESOLVED_LEGITIMATE", "DISMISSED")
      .default("RESOLVED_FRAUD")
      .optional(),
  }),
};

// ── Routes ──
router.get("/", authenticate, alertController.list);
router.get("/stats", authenticate, alertController.getStats);
router.get("/:id", authenticate, alertController.getById);
router.put("/:id/assign", authenticate, authorize("SUPERVISOR", "ADMIN"), validate(assignSchema), alertController.assign);
router.put("/:id/status", authenticate, validate(statusSchema), alertController.updateStatus);
router.put("/:id/escalate", authenticate, alertController.escalate);
router.put("/:id/resolve", authenticate, validate(resolveSchema), alertController.resolve);

module.exports = router;
