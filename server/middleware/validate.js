const ApiError = require("../utils/ApiError");

/**
 * Request validation middleware factory using Joi schemas.
 * Validates req.body, req.query, or req.params against provided schema.
 *
 * @param {Object} schema - Joi schema object with optional keys: body, query, params
 * @returns {Function} Express middleware
 *
 * Usage:
 *   const Joi = require("joi");
 *   router.post("/", validate({
 *     body: Joi.object({ email: Joi.string().email().required() })
 *   }), controller.create);
 */
function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const source of ["body", "query", "params"]) {
      if (schema[source]) {
        const { error, value } = schema[source].validate(req[source], {
          abortEarly: false,
          stripUnknown: true,
          allowUnknown: source === "query", // Allow extra query params
        });

        if (error) {
          errors.push(
            ...error.details.map((d) => ({
              source,
              field: d.path.join("."),
              message: d.message.replace(/"/g, "'"),
            }))
          );
        } else {
          // Replace with validated (and stripped) values
          req[source] = value;
        }
      }
    }

    if (errors.length > 0) {
      return next(ApiError.badRequest("Validation failed", errors));
    }

    next();
  };
}

module.exports = validate;
