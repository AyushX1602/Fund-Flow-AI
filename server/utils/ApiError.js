/**
 * Custom API Error class with HTTP status codes.
 * Throw these from controllers/services — caught by errorHandler middleware.
 */
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, message);
  }

  static forbidden(message = "Forbidden") {
    return new ApiError(403, message);
  }

  static notFound(message = "Resource not found") {
    return new ApiError(404, message);
  }

  static conflict(message, details) {
    return new ApiError(409, message, details);
  }

  static internal(message = "Internal server error") {
    return new ApiError(500, message);
  }

  static serviceUnavailable(message = "Service unavailable") {
    return new ApiError(503, message);
  }
}

module.exports = ApiError;
