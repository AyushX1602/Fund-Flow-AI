const prisma = require("../prismaClient");
const { SOCKET_EVENTS } = require("../utils/constants");
const logger = require("../utils/logger");

// Socket.io instance (injected from index.js)
let io = null;
function setSocketIO(socketIO) {
  io = socketIO;
}

/**
 * Update alert status and emit Socket.io event.
 */
async function updateAlertStatus(alertId, status, userId) {
  const updateData = { status };

  // If resolving, set resolvedAt timestamp
  if (["RESOLVED_FRAUD", "RESOLVED_LEGITIMATE", "DISMISSED"].includes(status)) {
    updateData.resolvedAt = new Date();
  }

  const alert = await prisma.alert.update({
    where: { id: alertId },
    data: updateData,
    include: {
      transaction: {
        select: { transactionId: true, amount: true, type: true },
      },
    },
  });

  if (io) {
    io.emit(SOCKET_EVENTS.ALERT_UPDATED, {
      id: alert.id,
      status: alert.status,
      severity: alert.severity,
      transactionId: alert.transaction.transactionId,
    });
  }

  return alert;
}

/**
 * Assign alert to an analyst.
 */
async function assignAlert(alertId, assignedToId) {
  return prisma.alert.update({
    where: { id: alertId },
    data: {
      assignedToId,
      status: "REVIEWING",
    },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      transaction: { select: { transactionId: true, amount: true } },
    },
  });
}

/**
 * Escalate alert to higher severity.
 */
async function escalateAlert(alertId) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) throw new Error("Alert not found");

  const escalationMap = {
    LOW: "MEDIUM",
    MEDIUM: "HIGH",
    HIGH: "CRITICAL",
    CRITICAL: "CRITICAL",
  };

  return prisma.alert.update({
    where: { id: alertId },
    data: {
      status: "ESCALATED",
      severity: escalationMap[alert.severity],
    },
    include: {
      transaction: { select: { transactionId: true, amount: true, type: true } },
    },
  });
}

module.exports = {
  updateAlertStatus,
  assignAlert,
  escalateAlert,
  setSocketIO,
};
