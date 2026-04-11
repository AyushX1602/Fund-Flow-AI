const prisma = require("../prismaClient");
const { createAuditLog } = require("../services/auditService");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { parsePagination, buildPaginationMeta, generateCaseNumber } = require("../utils/helpers");
const { AUDIT_ACTIONS } = require("../utils/constants");

/**
 * GET /api/investigations
 */
async function list(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status, priority } = req.query;

    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [cases, total] = await Promise.all([
      prisma.investigation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { alerts: true, notes: true } },
        },
      }),
      prisma.investigation.count({ where }),
    ]);

    ApiResponse.paginated(cases, buildPaginationMeta(total, page, limit), "Investigations retrieved").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/investigations/:id
 */
async function getById(req, res, next) {
  try {
    const investigation = await prisma.investigation.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: { id: true, name: true, email: true, role: true } },
        alerts: {
          include: {
            transaction: {
              select: {
                transactionId: true, amount: true, type: true, fraudScore: true,
                senderAccount: { select: { accountNumber: true, accountHolder: true, bankName: true } },
                receiverAccount: { select: { accountNumber: true, accountHolder: true, bankName: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        notes: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!investigation) throw ApiError.notFound("Investigation not found");

    ApiResponse.success(investigation).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/investigations
 */
async function create(req, res, next) {
  try {
    const { title, description, priority, alertIds } = req.body;

    // Generate unique case number by finding the max existing case number
    const lastCase = await prisma.investigation.findFirst({
      orderBy: { caseNumber: "desc" },
      select: { caseNumber: true },
    });
    let nextNum = 1;
    if (lastCase?.caseNumber) {
      const match = lastCase.caseNumber.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const caseNumber = generateCaseNumber(nextNum);

    const investigation = await prisma.investigation.create({
      data: {
        caseNumber,
        title,
        description,
        priority: priority || "MEDIUM",
        createdById: req.user.id,
        ...(alertIds && alertIds.length > 0 && {
          alerts: { connect: alertIds.map((id) => ({ id })) },
        }),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        alerts: { select: { id: true, alertType: true, severity: true } },
      },
    });

    await createAuditLog(AUDIT_ACTIONS.CREATE_INVESTIGATION, "Investigation", investigation.id, req.user.id, {
      caseNumber, alertCount: alertIds?.length || 0,
    });

    ApiResponse.created(investigation, "Investigation created").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/investigations/:id
 */
async function update(req, res, next) {
  try {
    const { title, description, status, priority } = req.body;

    const investigation = await prisma.investigation.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
        ...(priority && { priority }),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { alerts: true } },
      },
    });

    ApiResponse.success(investigation, "Investigation updated").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/investigations/:id/close
 */
async function close(req, res, next) {
  try {
    const { findings, status } = req.body;
    const closeStatus = status || "CLOSED_FRAUD";

    if (!["CLOSED_FRAUD", "CLOSED_LEGITIMATE", "CLOSED_INCONCLUSIVE"].includes(closeStatus)) {
      throw ApiError.badRequest("Invalid close status");
    }

    const investigation = await prisma.investigation.update({
      where: { id: req.params.id },
      data: {
        status: closeStatus,
        findings,
        closedAt: new Date(),
      },
    });

    await createAuditLog(AUDIT_ACTIONS.CLOSE_INVESTIGATION, "Investigation", investigation.id, req.user.id, {
      closeStatus, findings,
    });

    ApiResponse.success(investigation, "Investigation closed").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/investigations/:id/notes
 */
async function addNote(req, res, next) {
  try {
    const { content } = req.body;
    if (!content || content.trim().length === 0) {
      throw ApiError.badRequest("Note content is required");
    }

    // Verify investigation exists
    const exists = await prisma.investigation.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!exists) throw ApiError.notFound("Investigation not found");

    const note = await prisma.caseNote.create({
      data: {
        content,
        investigationId: req.params.id,
        authorId: req.user.id,
      },
    });

    ApiResponse.created(note, "Note added").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/investigations/:id/alerts
 * Link existing alerts to investigation
 */
async function linkAlerts(req, res, next) {
  try {
    const { alertIds } = req.body;
    if (!Array.isArray(alertIds) || alertIds.length === 0) {
      throw ApiError.badRequest("Provide an array of alert IDs");
    }

    const investigation = await prisma.investigation.update({
      where: { id: req.params.id },
      data: {
        alerts: { connect: alertIds.map((id) => ({ id })) },
      },
      include: {
        _count: { select: { alerts: true } },
      },
    });

    await createAuditLog(AUDIT_ACTIONS.LINK_ALERT_TO_CASE, "Investigation", investigation.id, req.user.id, {
      linkedAlerts: alertIds,
    });

    ApiResponse.success(investigation, `${alertIds.length} alert(s) linked to case`).send(res);
  } catch (error) {
    next(error);
  }
}

module.exports = { list, getById, create, update, close, addNote, linkAlerts };
