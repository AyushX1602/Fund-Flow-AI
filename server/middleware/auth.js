const jwt = require("jsonwebtoken");
const config = require("../config");
const prisma = require("../prismaClient");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");

// Pre-seeded demo user (created by seed script)
const DEMO_USER = {
  id: "demo-admin-001",
  email: "admin@fundflow.ai",
  name: "Demo Admin",
  role: "ADMIN",
  isActive: true,
};

/**
 * JWT authentication middleware.
 * Checks for Bearer token in Authorization header.
 * Supports X-Demo-Mode header to bypass auth for hackathon demo.
 */
async function authenticate(req, res, next) {
  try {
    // Demo mode bypass — judges should never see a login screen
    if (req.headers["x-demo-mode"] === "true" || config.demo.enabled) {
      req.user = DEMO_USER;
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw ApiError.unauthorized("No token provided");
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw ApiError.unauthorized("User not found or inactive");
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    if (error.name === "JsonWebTokenError") return next(ApiError.unauthorized("Invalid token"));
    if (error.name === "TokenExpiredError") return next(ApiError.unauthorized("Token expired"));
    next(error);
  }
}

/**
 * Role-based authorization middleware.
 * Must be used AFTER authenticate middleware.
 * @param  {...string} roles - Allowed roles (e.g., "ADMIN", "SUPERVISOR")
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized("Authentication required"));
    }
    if (!roles.includes(req.user.role)) {
      logger.warn(`Access denied: ${req.user.email} (${req.user.role}) tried to access ${req.method} ${req.originalUrl}`);
      return next(ApiError.forbidden(`Role '${req.user.role}' is not authorized for this action`));
    }
    next();
  };
}

module.exports = { authenticate, authorize };
