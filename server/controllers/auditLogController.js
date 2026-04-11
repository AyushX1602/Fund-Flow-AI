const prisma = require("../prismaClient");
const ApiResponse = require("../utils/ApiResponse");
const { parsePagination, buildPaginationMeta } = require("../utils/helpers");

/**
 * GET /api/audit-logs
 */
async function list(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { action, entity, userId } = req.query;

    const where = {};
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (userId) where.userId = userId;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    ApiResponse.paginated(logs, buildPaginationMeta(total, page, limit), "Audit logs retrieved").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/audit-logs/entity/:entityId
 */
async function getByEntity(req, res, next) {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { entityId: req.params.entityId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    ApiResponse.success(logs).send(res);
  } catch (error) {
    next(error);
  }
}

module.exports = { list, getByEntity };
