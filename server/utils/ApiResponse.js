/**
 * Standardized API response wrapper.
 * Every endpoint returns this shape for consistency.
 */
class ApiResponse {
  constructor(statusCode, message, data = null, meta = null) {
    this.success = statusCode >= 200 && statusCode < 300;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.meta = meta;
  }

  static success(data, message = "Success", meta = null) {
    return new ApiResponse(200, message, data, meta);
  }

  static created(data, message = "Created successfully") {
    return new ApiResponse(201, message, data);
  }

  static paginated(data, pagination, message = "Success") {
    return new ApiResponse(200, message, data, { pagination });
  }

  /**
   * Send response via Express res object
   */
  send(res) {
    const body = { success: this.success, message: this.message };
    if (this.data !== null) body.data = this.data;
    if (this.meta !== null) body.meta = this.meta;
    return res.status(this.statusCode).json(body);
  }
}

module.exports = ApiResponse;
