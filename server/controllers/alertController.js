const prisma = require("../prismaClient");
const alertService = require("../services/alertService");
const { createAuditLog } = require("../services/auditService");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { parsePagination, buildPaginationMeta } = require("../utils/helpers");
const { AUDIT_ACTIONS } = require("../utils/constants");

/**
 * GET /api/alerts
 */
async function list(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status, severity, alertType, assignedToId } = req.query;

    const where = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (alertType) where.alertType = alertType;
    if (assignedToId) where.assignedToId = assignedToId;

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          transaction: {
            select: {
              id: true, transactionId: true, amount: true, type: true, channel: true, timestamp: true, fraudScore: true, description: true,
              senderAccount: { select: { id: true, accountNumber: true, accountHolder: true, bankName: true } },
              receiverAccount: { select: { id: true, accountNumber: true, accountHolder: true, bankName: true } },
            },
          },
          assignedTo: { select: { id: true, name: true, email: true } },
          investigation: { select: { id: true, caseNumber: true, title: true } },
        },
      }),
      prisma.alert.count({ where }),
    ]);

    ApiResponse.paginated(alerts, buildPaginationMeta(total, page, limit), "Alerts retrieved").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/alerts/:id
 */
async function getById(req, res, next) {
  try {
    const alert = await prisma.alert.findUnique({
      where: { id: req.params.id },
      include: {
        transaction: {
          include: {
            senderAccount: true,
            receiverAccount: true,
          },
        },
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        investigation: true,
      },
    });

    if (!alert) throw ApiError.notFound("Alert not found");

    ApiResponse.success(alert).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/alerts/:id/assign
 */
async function assign(req, res, next) {
  try {
    const { assignedToId } = req.body;

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: assignedToId } });
    if (!user) throw ApiError.badRequest("Assigned user not found");

    const alert = await alertService.assignAlert(req.params.id, assignedToId);

    await createAuditLog(AUDIT_ACTIONS.ASSIGN_ALERT, "Alert", alert.id, req.user.id, {
      assignedTo: assignedToId,
    });

    ApiResponse.success(alert, "Alert assigned").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/alerts/:id/status
 */
async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;
    const validStatuses = ["NEW", "REVIEWING", "ESCALATED", "RESOLVED_FRAUD", "RESOLVED_LEGITIMATE", "DISMISSED"];
    if (!validStatuses.includes(status)) {
      throw ApiError.badRequest(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
    }

    const alert = await alertService.updateAlertStatus(req.params.id, status, req.user.id);

    await createAuditLog(AUDIT_ACTIONS.UPDATE_ALERT_STATUS, "Alert", alert.id, req.user.id, { status });

    ApiResponse.success(alert, "Alert status updated").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/alerts/:id/escalate
 */
async function escalate(req, res, next) {
  try {
    const alert = await alertService.escalateAlert(req.params.id);

    await createAuditLog(AUDIT_ACTIONS.ESCALATE_ALERT, "Alert", alert.id, req.user.id, {
      newSeverity: alert.severity,
    });

    ApiResponse.success(alert, "Alert escalated").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/alerts/:id/resolve
 */
async function resolve(req, res, next) {
  try {
    const { resolution, status } = req.body;
    const resolveStatus = status || "RESOLVED_FRAUD";

    if (!["RESOLVED_FRAUD", "RESOLVED_LEGITIMATE", "DISMISSED"].includes(resolveStatus)) {
      throw ApiError.badRequest("Invalid resolution status");
    }

    const alert = await prisma.alert.update({
      where: { id: req.params.id },
      data: {
        status: resolveStatus,
        resolution: resolution || null,
        resolvedAt: new Date(),
      },
      include: {
        transaction: { select: { transactionId: true, amount: true } },
      },
    });

    await createAuditLog(AUDIT_ACTIONS.RESOLVE_ALERT, "Alert", alert.id, req.user.id, {
      resolution, resolveStatus,
    });

    ApiResponse.success(alert, "Alert resolved").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/alerts/stats
 */
async function getStats(req, res, next) {
  try {
    const [total, byStatus, bySeverity, byType, unresolvedCount] = await Promise.all([
      prisma.alert.count(),
      prisma.alert.groupBy({ by: ["status"], _count: true }),
      prisma.alert.groupBy({ by: ["severity"], _count: true }),
      prisma.alert.groupBy({ by: ["alertType"], _count: true }),
      prisma.alert.count({
        where: { status: { in: ["NEW", "REVIEWING", "ESCALATED"] } },
      }),
    ]);

    ApiResponse.success({
      total,
      unresolvedCount,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      bySeverity: Object.fromEntries(bySeverity.map((s) => [s.severity, s._count])),
      byType: Object.fromEntries(byType.map((t) => [t.alertType, t._count])),
    }).send(res);
  } catch (error) {
    next(error);
  }
}

module.exports = { list, getById, assign, updateStatus, escalate, resolve, getStats };
