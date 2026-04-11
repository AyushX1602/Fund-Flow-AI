const express = require("express");
const router = express.Router();
const Joi = require("joi");
const mlController = require("../controllers/mlController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");

// ── Validation Schemas ──
const scoreSchema = {
  body: Joi.object({
    transactionId: Joi.string().required(),
  }),
};

const batchScoreSchema = {
  body: Joi.object({
    transactionIds: Joi.array().items(Joi.string()).min(1).max(50).required(),
  }),
};

// ── Routes ──
router.post("/score", authenticate, validate(scoreSchema), mlController.score);
router.post("/batch-score", authenticate, validate(batchScoreSchema), mlController.batchScore);
router.get("/model-info", authenticate, mlController.getModelInfo);
router.post("/explain/:transactionId", authenticate, mlController.explain);

module.exports = router;
