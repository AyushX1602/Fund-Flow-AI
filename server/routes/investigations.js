const express = require("express");
const router = express.Router();
const Joi = require("joi");
const investigationController = require("../controllers/investigationController");
const { authenticate, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");

// ── Validation Schemas ──
const createSchema = {
  body: Joi.object({
    title: Joi.string().min(3).max(200).required(),
    description: Joi.string().optional().allow(null, ""),
    priority: Joi.string().valid("LOW", "MEDIUM", "HIGH", "CRITICAL").default("MEDIUM").optional(),
    alertIds: Joi.array().items(Joi.string()).optional(),
  }),
};

const updateSchema = {
  body: Joi.object({
    title: Joi.string().min(3).max(200).optional(),
    description: Joi.string().optional().allow(null, ""),
    status: Joi.string().valid("OPEN", "IN_PROGRESS", "PENDING_REVIEW", "CLOSED_FRAUD", "CLOSED_LEGITIMATE", "CLOSED_INCONCLUSIVE").optional(),
    priority: Joi.string().valid("LOW", "MEDIUM", "HIGH", "CRITICAL").optional(),
  }).min(1),
};

const closeSchema = {
  body: Joi.object({
    findings: Joi.string().required(),
    status: Joi.string().valid("CLOSED_FRAUD", "CLOSED_LEGITIMATE", "CLOSED_INCONCLUSIVE").default("CLOSED_FRAUD").optional(),
  }),
};

const noteSchema = {
  body: Joi.object({
    content: Joi.string().min(1).required(),
  }),
};

const linkAlertsSchema = {
  body: Joi.object({
    alertIds: Joi.array().items(Joi.string()).min(1).required(),
  }),
};

// ── Routes ──
router.get("/", authenticate, investigationController.list);
router.get("/:id", authenticate, investigationController.getById);
router.post("/", authenticate, validate(createSchema), investigationController.create);
router.put("/:id", authenticate, validate(updateSchema), investigationController.update);
router.put("/:id/close", authenticate, authorize("SUPERVISOR", "ADMIN"), validate(closeSchema), investigationController.close);
router.post("/:id/notes", authenticate, validate(noteSchema), investigationController.addNote);
router.post("/:id/alerts", authenticate, validate(linkAlertsSchema), investigationController.linkAlerts);

module.exports = router;
