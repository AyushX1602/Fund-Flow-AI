const prisma = require("../prismaClient");
const logger = require("../utils/logger");

/**
 * Create an audit log entry.
 * Called from controllers/services on significant actions.
 *
 * @param {string} action - Action type from AUDIT_ACTIONS constants
 * @param {string} entity - Entity type ("Account", "Alert", etc.)
 * @param {string} entityId - ID of the affected entity
 * @param {string} userId - ID of the user performing the action
 * @param {Object} [details] - Additional details (JSON)
 */
async function createAuditLog(action, entity, entityId, userId, details = null) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        userId,
        details,
      },
    });

    logger.info(`Audit: ${action} on ${entity}:${entityId} by user:${userId}`);
  } catch (error) {
    // Audit logging should never crash the main flow
    logger.error("Failed to create audit log", {
      action,
      entity,
      entityId,
      userId,
      error: error.message,
    });
  }
}

module.exports = { createAuditLog };
