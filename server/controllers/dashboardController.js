const prisma = require("../prismaClient");
const ApiResponse = require("../utils/ApiResponse");

/**
 * GET /api/dashboard/overview
 * Key metrics for the main dashboard
 * Uses interactive transaction to share a single DB connection for all counts
 */
async function getOverview(req, res, next) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const [
        totalTransactions,
        fraudCount,
        totalAlerts,
        unresolvedAlerts,
        totalAccounts,
        frozenAccounts,
        totalAmount,
        todayTxnCount,
      ] = await Promise.all([
        tx.transaction.count(),
        tx.transaction.count({ where: { isFraud: true } }),
        tx.alert.count(),
        tx.alert.count({ where: { status: { in: ["NEW", "REVIEWING", "ESCALATED"] } } }),
        tx.account.count(),
        tx.account.count({ where: { isFrozen: true } }),
        tx.transaction.aggregate({ _sum: { amount: true } }),
        tx.transaction.count({
          where: {
            timestamp: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
        }),
      ]);

      return {
        totalTransactions,
        fraudCount,
        fraudRate: totalTransactions > 0 ? ((fraudCount / totalTransactions) * 100).toFixed(2) : "0.00",
        totalAlerts,
        unresolvedAlerts,
        totalAccounts,
        frozenAccounts,
        totalVolume: totalAmount._sum.amount || 0,
        todayTxnCount,
      };
    }, { timeout: 15000 });

    ApiResponse.success(result).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/fraud-trend
 * Fraud count grouped by day (last 30 days)
 */
async function getFraudTrend(req, res, next) {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const transactions = await prisma.transaction.findMany({
      where: { timestamp: { gte: startDate } },
      select: { timestamp: true, isFraud: true, fraudScore: true },
      orderBy: { timestamp: "asc" },
      take: 10000,                         // guard: timestamp index handles this efficiently
    });

    // Group by day
    const dayMap = {};
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      dayMap[key] = { date: key, total: 0, fraud: 0, legitimate: 0, avgScore: 0, scores: [] };
    }

    transactions.forEach((t) => {
      const key = t.timestamp.toISOString().split("T")[0];
      if (dayMap[key]) {
        dayMap[key].total++;
        if (t.isFraud) dayMap[key].fraud++;
        else dayMap[key].legitimate++;
        if (t.fraudScore) dayMap[key].scores.push(t.fraudScore);
      }
    });

    const trend = Object.values(dayMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ scores, ...rest }) => ({
        ...rest,
        avgScore: scores.length > 0
          ? (scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(4)
          : null,
      }));

    ApiResponse.success(trend).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/risk-distribution
 * Risk score histogram
 */
async function getRiskDistribution(req, res, next) {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { fraudScore: { not: null } },
      select: { fraudScore: true },
      take: 5000,                          // cap — indexes on fraudScore handle this fast
      orderBy: { timestamp: "desc" },     // most recent 5K for representative sample
    });

    const buckets = {
      "0.0-0.1": 0, "0.1-0.2": 0, "0.2-0.3": 0, "0.3-0.4": 0, "0.4-0.5": 0,
      "0.5-0.6": 0, "0.6-0.7": 0, "0.7-0.8": 0, "0.8-0.9": 0, "0.9-1.0": 0,
    };

    transactions.forEach((t) => {
      const score = t.fraudScore;
      if (score < 0.1) buckets["0.0-0.1"]++;
      else if (score < 0.2) buckets["0.1-0.2"]++;
      else if (score < 0.3) buckets["0.2-0.3"]++;
      else if (score < 0.4) buckets["0.3-0.4"]++;
      else if (score < 0.5) buckets["0.4-0.5"]++;
      else if (score < 0.6) buckets["0.5-0.6"]++;
      else if (score < 0.7) buckets["0.6-0.7"]++;
      else if (score < 0.8) buckets["0.7-0.8"]++;
      else if (score < 0.9) buckets["0.8-0.9"]++;
      else buckets["0.9-1.0"]++;
    });

    const distribution = Object.entries(buckets).map(([range, count]) => ({ range, count }));

    ApiResponse.success(distribution).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/recent-alerts
 */
async function getRecentAlerts(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;

    const alerts = await prisma.alert.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        transaction: {
          select: {
            transactionId: true, amount: true, type: true, timestamp: true,
            senderAccount: { select: { accountHolder: true, bankName: true } },
            receiverAccount: { select: { accountHolder: true, bankName: true } },
          },
        },
        assignedTo: { select: { name: true } },
      },
    });

    ApiResponse.success(alerts).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/top-risk-accounts
 */
async function getTopRiskAccounts(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;

    const accounts = await prisma.account.findMany({
      take: limit,
      orderBy: { riskScore: "desc" },
      where: { riskScore: { gt: 0 } },
      select: {
        id: true,
        accountNumber: true,
        accountHolder: true,
        bankName: true,
        riskScore: true,
        muleScore: true,
        isFrozen: true,
        kycType: true,
        kycFlagged: true,
        _count: {
          select: { sentTransactions: true, receivedTransactions: true },
        },
      },
    });

    ApiResponse.success(accounts).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/channel-breakdown
 */
async function getChannelBreakdown(req, res, next) {
  try {
    const breakdown = await prisma.transaction.groupBy({
      by: ["channel"],
      _count: true,
      _sum: { amount: true },
      _avg: { fraudScore: true },
    });

    const result = breakdown.map((b) => ({
      channel: b.channel,
      count: b._count,
      totalAmount: b._sum.amount || 0,
      avgFraudScore: b._avg.fraudScore ? b._avg.fraudScore.toFixed(4) : null,
    }));

    ApiResponse.success(result).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/dashboard/mule-network
 * Accounts with high mule scores and their connections
 */
async function getMuleNetwork(req, res, next) {
  try {
    const minMuleScore = parseFloat(req.query.minScore) || 0.3;

    const result = await prisma.$transaction(async (tx) => {
      const muleAccounts = await tx.account.findMany({
        where: { muleScore: { gte: minMuleScore } },
        orderBy: { muleScore: "desc" },
        take: 20,
        select: {
          id: true,
          accountNumber: true,
          accountHolder: true,
          bankName: true,
          muleScore: true,
          riskScore: true,
          isFrozen: true,
        },
      });

      const muleIds = muleAccounts.map((a) => a.id);

      // Get edges connecting mule accounts
      const edges = await tx.fundFlowEdge.findMany({
        where: {
          OR: [
            { sourceAccountId: { in: muleIds } },
            { targetAccountId: { in: muleIds } },
          ],
        },
        select: {
          id: true,
          sourceAccountId: true,
          targetAccountId: true,
          amount: true,
          timestamp: true,
          riskScore: true,
        },
        orderBy: { timestamp: "desc" },
        take: 100,
      });

      return {
        nodes: muleAccounts,
        edges,
        totalMuleAccounts: muleAccounts.length,
      };
    }, { timeout: 15000 });

    ApiResponse.success(result).send(res);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOverview,
  getFraudTrend,
  getRiskDistribution,
  getRecentAlerts,
  getTopRiskAccounts,
  getChannelBreakdown,
  getMuleNetwork,
};
