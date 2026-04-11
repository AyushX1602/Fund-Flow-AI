const express = require("express");
const router = express.Router();
const Joi = require("joi");
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimiter");

// ── Validation Schemas ──
const registerSchema = {
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).max(100).required(),
    role: Joi.string().valid("ANALYST", "SUPERVISOR", "ADMIN").optional(),
  }),
};

const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),
};

const updateProfileSchema = {
  body: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    password: Joi.string().min(6).optional(),
  }).min(1),
};

// ── Routes ──
router.post("/register", authLimiter, validate(registerSchema), authController.register);
router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.get("/me", authenticate, authController.getMe);
router.put("/profile", authenticate, validate(updateProfileSchema), authController.updateProfile);

module.exports = router;
