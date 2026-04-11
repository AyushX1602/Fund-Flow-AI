const prisma = require("../prismaClient");
const { processTransaction } = require("../services/transactionService");
const { startSimulation, stopSimulation, getSimulationStatus } = require("../services/simulationService");
const { createAuditLog } = require("../services/auditService");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { parsePagination, buildPaginationMeta, maskAccountNumber } = require("../utils/helpers");
const { AUDIT_ACTIONS } = require("../utils/constants");

/**
 * GET /api/transactions
 * List transactions with pagination + filters
 */
async function list(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { type, channel, isFraud, minAmount, maxAmount, startDate, endDate, search } = req.query;

    const where = {};
    if (type) where.type = type;
    if (channel) where.channel = channel;
    if (isFraud !== undefined) where.isFraud = isFraud === "true";
    if (minAmount || maxAmount) {
      where.amount = {};
      if (minAmount) where.amount.gte = parseFloat(minAmount);
      if (maxAmount) where.amount.lte = parseFloat(maxAmount);
    }
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }
    if (search) {
      where.transactionId = { contains: search, mode: "insensitive" };
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: "desc" },
        include: {
          senderAccount: { select: { id: true, accountNumber: true, accountHolder: true, bankName: true } },
          receiverAccount: { select: { id: true, accountNumber: true, accountHolder: true, bankName: true } },
          alert: { select: { id: true, status: true, severity: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    ApiResponse.paginated(
      transactions,
      buildPaginationMeta(total, page, limit),
      "Transactions retrieved"
    ).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/transactions/:id
 */
async function getById(req, res, next) {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id },
      include: {
        senderAccount: true,
        receiverAccount: true,
        alert: true,
        fundFlowEdges: {
          include: {
            sourceAccount: { select: { id: true, accountNumber: true, accountHolder: true } },
            targetAccount: { select: { id: true, accountNumber: true, accountHolder: true } },
          },
        },
      },
    });

    if (!transaction) throw ApiError.notFound("Transaction not found");

    ApiResponse.success(transaction).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/transactions
 * Create and process a single transaction
 */
async function create(req, res, next) {
  try {
    const result = await processTransaction(req.body, req.user.id);

    ApiResponse.created({
      transaction: result.transaction,
      mlResult: result.mlResult,
      alert: result.alert,
    }, "Transaction processed").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/transactions/bulk
 * Process batch of transactions
 */
async function bulkCreate(req, res, next) {
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      throw ApiError.badRequest("Provide an array of transactions");
    }
    if (transactions.length > 100) {
      throw ApiError.badRequest("Maximum 100 transactions per batch");
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < transactions.length; i++) {
      try {
        const result = await processTransaction(transactions[i], req.user.id);
        results.push({
          index: i,
          transactionId: result.transaction.transactionId,
          fraudScore: result.mlResult.fraudScore,
          isFraud: result.mlResult.isFraud,
          alertCreated: !!result.alert,
        });
      } catch (error) {
        errors.push({ index: i, error: error.message });
      }
    }

    ApiResponse.created({
      processed: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    }, `Batch processed: ${results.length} succeeded, ${errors.length} failed`).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/transactions/simulate
 * Start transaction stream simulation
 */
async function simulate(req, res, next) {
  try {
    const { rate, count, fraudRatio } = req.body;
    const simulationRun = await startSimulation({ rate, count, fraudRatio }, req.user.id);

    await createAuditLog(AUDIT_ACTIONS.START_SIMULATION, "SimulationRun", simulationRun.id, req.user.id, {
      rate, count, fraudRatio,
    });

    ApiResponse.created(simulationRun, "Simulation started").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/transactions/simulate/stop
 * Stop active simulation
 */
async function stopSim(req, res, next) {
  try {
    const result = await stopSimulation();

    if (!result) {
      return ApiResponse.success({ active: false }, "No active simulation to stop").send(res);
    }

    await createAuditLog(AUDIT_ACTIONS.STOP_SIMULATION, "SimulationRun", result.id, req.user.id);

    ApiResponse.success(result, "Simulation stopped").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/transactions/stats
 */
async function getStats(req, res, next) {
  try {
    const [total, fraudCount, totalAmount, avgFraudScore, byType, byChannel] = await Promise.all([
      prisma.transaction.count(),
      prisma.transaction.count({ where: { isFraud: true } }),
      prisma.transaction.aggregate({ _sum: { amount: true } }),
      prisma.transaction.aggregate({ _avg: { fraudScore: true }, where: { fraudScore: { not: null } } }),
      prisma.transaction.groupBy({ by: ["type"], _count: true, _sum: { amount: true } }),
      prisma.transaction.groupBy({ by: ["channel"], _count: true }),
    ]);

    ApiResponse.success({
      total,
      fraudCount,
      fraudRate: total > 0 ? (fraudCount / total * 100).toFixed(2) + "%" : "0%",
      totalAmount: totalAmount._sum.amount || 0,
      avgFraudScore: avgFraudScore._avg.fraudScore ? avgFraudScore._avg.fraudScore.toFixed(4) : null,
      byType,
      byChannel,
      simulationStatus: getSimulationStatus(),
    }).send(res);
  } catch (error) {
    next(error);
  }
}

module.exports = { list, getById, create, bulkCreate, simulate, stopSim, getStats };
