const prisma = require("../prismaClient");
const { createAuditLog } = require("../services/auditService");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { parsePagination, buildPaginationMeta } = require("../utils/helpers");
const { AUDIT_ACTIONS, SOCKET_EVENTS } = require("../utils/constants");

// Socket.io instance
let io = null;
function setSocketIO(socketIO) {
  io = socketIO;
}

/**
 * GET /api/accounts
 */
async function list(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { bankName, accountType, isFrozen, minRisk, search } = req.query;

    const where = {};
    if (bankName) where.bankName = bankName;
    if (accountType) where.accountType = accountType;
    if (isFrozen !== undefined) where.isFrozen = isFrozen === "true";
    if (minRisk) where.riskScore = { gte: parseFloat(minRisk) };
    if (search) {
      where.OR = [
        { accountNumber: { contains: search, mode: "insensitive" } },
        { accountHolder: { contains: search, mode: "insensitive" } },
      ];
    }

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        skip,
        take: limit,
        orderBy: { riskScore: "desc" },
        include: {
          _count: {
            select: { sentTransactions: true, receivedTransactions: true },
          },
        },
      }),
      prisma.account.count({ where }),
    ]);

    ApiResponse.paginated(accounts, buildPaginationMeta(total, page, limit), "Accounts retrieved").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/accounts/:id
 */
async function getById(req, res, next) {
  try {
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: { sentTransactions: true, receivedTransactions: true, outgoingEdges: true, incomingEdges: true },
        },
      },
    });

    if (!account) throw ApiError.notFound("Account not found");

    ApiResponse.success(account).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/accounts
 */
async function create(req, res, next) {
  try {
    const account = await prisma.account.create({
      data: {
        accountNumber: req.body.accountNumber,
        accountHolder: req.body.accountHolder,
        bankName: req.body.bankName,
        ifscCode: req.body.ifscCode || null,
        accountType: req.body.accountType || "SAVINGS",
        balance: req.body.balance || 0,
        kycType: req.body.kycType || "FULL_KYC",
        aadhaarLinked: req.body.aadhaarLinked || false,
        panLinked: req.body.panLinked || false,
        vpa: req.body.vpa || null,
      },
    });

    await createAuditLog(AUDIT_ACTIONS.CREATE_ACCOUNT, "Account", account.id, req.user.id);

    ApiResponse.created(account, "Account created").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/accounts/:id
 */
async function update(req, res, next) {
  try {
    const { accountHolder, bankName, ifscCode, accountType, balance, kycType, aadhaarLinked, panLinked, vpa } = req.body;

    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: {
        ...(accountHolder && { accountHolder }),
        ...(bankName && { bankName }),
        ...(ifscCode !== undefined && { ifscCode }),
        ...(accountType && { accountType }),
        ...(balance !== undefined && { balance }),
        ...(kycType && { kycType }),
        ...(aadhaarLinked !== undefined && { aadhaarLinked }),
        ...(panLinked !== undefined && { panLinked }),
        ...(vpa !== undefined && { vpa }),
      },
    });

    await createAuditLog(AUDIT_ACTIONS.UPDATE_ACCOUNT, "Account", account.id, req.user.id);

    ApiResponse.success(account, "Account updated").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/accounts/:id/freeze
 */
async function freezeAccount(req, res, next) {
  try {
    const { reason } = req.body;

    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: {
        isFrozen: true,
        frozenAt: new Date(),
        frozenReason: reason || "Suspicious activity detected",
      },
    });

    await createAuditLog(AUDIT_ACTIONS.FREEZE_ACCOUNT, "Account", account.id, req.user.id, { reason });

    if (io) {
      io.emit(SOCKET_EVENTS.ACCOUNT_FROZEN, {
        accountId: account.id,
        accountNumber: account.accountNumber,
        action: "FROZEN",
        reason,
      });
    }

    ApiResponse.success(account, "Account frozen").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/accounts/:id/unfreeze
 */
async function unfreezeAccount(req, res, next) {
  try {
    const { reason } = req.body;

    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: {
        isFrozen: false,
        frozenAt: null,
        frozenReason: null,
      },
    });

    await createAuditLog(AUDIT_ACTIONS.UNFREEZE_ACCOUNT, "Account", account.id, req.user.id, { reason });

    if (io) {
      io.emit(SOCKET_EVENTS.ACCOUNT_FROZEN, {
        accountId: account.id,
        accountNumber: account.accountNumber,
        action: "UNFROZEN",
        reason,
      });
    }

    ApiResponse.success(account, "Account unfrozen").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/accounts/:id/transactions
 */
async function getTransactions(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const accountId = req.params.id;

    const where = {
      OR: [
        { senderAccountId: accountId },
        { receiverAccountId: accountId },
      ],
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: "desc" },
        include: {
          senderAccount: { select: { id: true, accountNumber: true, accountHolder: true, bankName: true } },
          receiverAccount: { select: { id: true, accountNumber: true, accountHolder: true, bankName: true } },
          alert: { select: { id: true, severity: true, status: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    ApiResponse.paginated(transactions, buildPaginationMeta(total, page, limit), "Account transactions retrieved").send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/accounts/:id/risk-profile
 */
async function getRiskProfile(req, res, next) {
  try {
    const accountId = req.params.id;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });
    if (!account) throw ApiError.notFound("Account not found");

    // Get transaction stats
    const [sentStats, receivedStats, recentFraud, alertCount] = await Promise.all([
      prisma.transaction.aggregate({
        where: { senderAccountId: accountId },
        _count: true,
        _sum: { amount: true },
        _avg: { fraudScore: true },
      }),
      prisma.transaction.aggregate({
        where: { receiverAccountId: accountId },
        _count: true,
        _sum: { amount: true },
        _avg: { fraudScore: true },
      }),
      prisma.transaction.count({
        where: {
          OR: [{ senderAccountId: accountId }, { receiverAccountId: accountId }],
          isFraud: true,
          timestamp: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.alert.count({
        where: {
          transaction: {
            OR: [{ senderAccountId: accountId }, { receiverAccountId: accountId }],
          },
        },
      }),
    ]);

    ApiResponse.success({
      account: {
        id: account.id,
        accountNumber: account.accountNumber,
        accountHolder: account.accountHolder,
        bankName: account.bankName,
        riskScore: account.riskScore,
        muleScore: account.muleScore,
        isFrozen: account.isFrozen,
        kycType: account.kycType,
        kycFlagged: account.kycFlagged,
      },
      transactionStats: {
        sent: { count: sentStats._count, totalAmount: sentStats._sum.amount || 0, avgFraudScore: sentStats._avg.fraudScore },
        received: { count: receivedStats._count, totalAmount: receivedStats._sum.amount || 0, avgFraudScore: receivedStats._avg.fraudScore },
      },
      riskFactors: {
        recentFraudCount: recentFraud,
        totalAlerts: alertCount,
        muleScore: account.muleScore,
        kycRisk: account.kycType === "MIN_KYC" ? "HIGH" : account.kycType === "OTP_BASED" ? "MEDIUM" : "LOW",
        kycFlagged: account.kycFlagged,
        accountAgeDays: Math.floor((Date.now() - new Date(account.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
      },
    }).send(res);
  } catch (error) {
    next(error);
  }
}

module.exports = { list, getById, create, update, freezeAccount, unfreezeAccount, getTransactions, getRiskProfile, setSocketIO };
