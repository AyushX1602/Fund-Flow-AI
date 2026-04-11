const logger = require("../utils/logger");
const ApiError = require("../utils/ApiError");

/**
 * Global error handling middleware.
 * Catches all errors and returns standardized JSON response.
 * Must be registered LAST in middleware chain.
 */
function errorHandler(err, req, res, _next) {
  // Default to 500 if no status code set
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let details = err.details || null;

  // Prisma known request errors
  if (err.code === "P2002") {
    statusCode = 409;
    const field = err.meta?.target?.join(", ") || "field";
    message = `Duplicate value for ${field}`;
  }
  if (err.code === "P2025") {
    statusCode = 404;
    message = "Record not found";
  }
  if (err.code === "P2003") {
    statusCode = 400;
    message = "Invalid reference — related record not found";
  }

  // Joi validation errors
  if (err.isJoi) {
    statusCode = 400;
    message = "Validation error";
    details = err.details.map((d) => ({
      field: d.path.join("."),
      message: d.message,
    }));
  }

  // Log server errors
  if (statusCode >= 500) {
    logger.error(`${statusCode} ${req.method} ${req.originalUrl}`, {
      error: message,
      stack: err.stack,
      body: req.body,
    });
  } else {
    logger.warn(`${statusCode} ${req.method} ${req.originalUrl}: ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details && { details }),
    ...(process.env.NODE_ENV === "development" && statusCode >= 500 && { stack: err.stack }),
  });
}

module.exports = errorHandler;
