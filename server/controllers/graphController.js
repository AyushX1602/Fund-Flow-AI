const prisma = require("../prismaClient");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { parsePagination, buildPaginationMeta } = require("../utils/helpers");
const { SOCKET_EVENTS } = require("../utils/constants");

let io = null;
function setSocketIO(socketIO) {
  io = socketIO;
}

/**
 * GET /api/graph/fund-flow/:accountId
 * Trace fund flow from an account (multi-hop)
 */
async function getFundFlow(req, res, next) {
  try {
    const { accountId } = req.params;
    const maxHops = parseInt(req.query.hops, 10) || 3;
    const direction = req.query.direction || "outgoing"; // outgoing | incoming | both

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw ApiError.notFound("Account not found");

    // BFS to trace fund flow
    const visited = new Set();
    const nodes = [];
    const edges = [];
    let queue = [{ accountId, hop: 0 }];

    while (queue.length > 0) {
      const nextQueue = [];

      for (const { accountId: currentId, hop } of queue) {
        if (visited.has(currentId) || hop > maxHops) continue;
        visited.add(currentId);

        // Get account info
        const acc = await prisma.account.findUnique({
          where: { id: currentId },
          select: {
            id: true, accountNumber: true, accountHolder: true, bankName: true,
            riskScore: true, muleScore: true, isFrozen: true,
          },
        });
        if (acc) nodes.push({ ...acc, hop });

        // Get edges
        const whereClause = {};
        if (direction === "outgoing") whereClause.sourceAccountId = currentId;
        else if (direction === "incoming") whereClause.targetAccountId = currentId;
        else whereClause.OR = [{ sourceAccountId: currentId }, { targetAccountId: currentId }];

        const flowEdges = await prisma.fundFlowEdge.findMany({
          where: whereClause,
          include: {
            sourceAccount: { select: { id: true, accountNumber: true, accountHolder: true } },
            targetAccount: { select: { id: true, accountNumber: true, accountHolder: true } },
            transaction: { select: { transactionId: true, amount: true, type: true, fraudScore: true, timestamp: true } },
          },
          orderBy: { timestamp: "asc" },
          take: 50,
        });

        for (const edge of flowEdges) {
          edges.push(edge);
          const nextAccount = direction === "incoming" ? edge.sourceAccountId : edge.targetAccountId;
          if (!visited.has(nextAccount)) {
            nextQueue.push({ accountId: nextAccount, hop: hop + 1 });
          }
        }
      }

      queue = nextQueue;
    }

    ApiResponse.success({
      rootAccount: accountId,
      maxHops,
      direction,
      nodes,
      edges,
      totalNodes: nodes.length,
      totalEdges: edges.length,
    }).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/graph/network/:accountId
 * Get account's direct transaction network
 */
async function getNetwork(req, res, next) {
  try {
    const { accountId } = req.params;

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw ApiError.notFound("Account not found");

    // Get all connected accounts via fund flow edges
    const edges = await prisma.fundFlowEdge.findMany({
      where: {
        OR: [{ sourceAccountId: accountId }, { targetAccountId: accountId }],
      },
      include: {
        sourceAccount: {
          select: { id: true, accountNumber: true, accountHolder: true, bankName: true, riskScore: true, muleScore: true, isFrozen: true },
        },
        targetAccount: {
          select: { id: true, accountNumber: true, accountHolder: true, bankName: true, riskScore: true, muleScore: true, isFrozen: true },
        },
      },
      orderBy: { timestamp: "desc" },
      take: 100,
    });

    // Deduplicate nodes
    const nodeMap = new Map();
    nodeMap.set(account.id, {
      id: account.id,
      accountNumber: account.accountNumber,
      accountHolder: account.accountHolder,
      bankName: account.bankName,
      riskScore: account.riskScore,
      muleScore: account.muleScore,
      isFrozen: account.isFrozen,
      isRoot: true,
    });

    edges.forEach((edge) => {
      if (!nodeMap.has(edge.sourceAccount.id)) nodeMap.set(edge.sourceAccount.id, { ...edge.sourceAccount, isRoot: false });
      if (!nodeMap.has(edge.targetAccount.id)) nodeMap.set(edge.targetAccount.id, { ...edge.targetAccount, isRoot: false });
    });

    ApiResponse.success({
      nodes: Array.from(nodeMap.values()),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.sourceAccountId,
        target: e.targetAccountId,
        amount: e.amount,
        timestamp: e.timestamp,
        riskScore: e.riskScore,
      })),
    }).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/graph/rings
 * Detect potential fraud rings (accounts appearing in circular fund flows)
 */
async function detectRings(req, res, next) {
  try {
    // Find accounts that appear as both sender and receiver in suspicious transactions
    const suspiciousEdges = await prisma.fundFlowEdge.findMany({
      where: { riskScore: { gte: 0.4 } },
      select: {
        sourceAccountId: true,
        targetAccountId: true,
        amount: true,
        timestamp: true,
        riskScore: true,
        chainId: true,
      },
      orderBy: { timestamp: "desc" },
      take: 500,
    });

    // Build adjacency map
    const adjacency = new Map();
    suspiciousEdges.forEach((edge) => {
      if (!adjacency.has(edge.sourceAccountId)) adjacency.set(edge.sourceAccountId, []);
      adjacency.get(edge.sourceAccountId).push(edge.targetAccountId);
    });

    // Find cycles (simple DFS for small graphs)
    const rings = [];
    const globalVisited = new Set();

    for (const [startNode] of adjacency) {
      if (globalVisited.has(startNode)) continue;

      const path = [];
      const visited = new Set();

      function dfs(node, depth) {
        if (depth > 6) return; // Max ring length
        if (visited.has(node)) {
          if (node === startNode && path.length >= 3) {
            rings.push([...path]);
          }
          return;
        }
        visited.add(node);
        path.push(node);

        const neighbors = adjacency.get(node) || [];
        for (const next of neighbors) {
          dfs(next, depth + 1);
        }

        path.pop();
        visited.delete(node);
      }

      dfs(startNode, 0);
      globalVisited.add(startNode);

      if (rings.length >= 10) break; // Limit results
    }

    // Enrich ring data with account info
    const allAccountIds = [...new Set(rings.flat())];
    const accounts = await prisma.account.findMany({
      where: { id: { in: allAccountIds } },
      select: {
        id: true, accountNumber: true, accountHolder: true, bankName: true,
        riskScore: true, muleScore: true, isFrozen: true,
      },
    });

    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    const enrichedRings = rings.map((ring, idx) => ({
      ringId: `RING-${idx + 1}`,
      size: ring.length,
      accounts: ring.map((id) => accountMap.get(id) || { id }),
      avgRiskScore: ring.reduce((sum, id) => {
        const acc = accountMap.get(id);
        return sum + (acc?.riskScore || 0);
      }, 0) / ring.length,
    }));

    ApiResponse.success({
      rings: enrichedRings,
      totalRings: enrichedRings.length,
      totalSuspiciousEdges: suspiciousEdges.length,
    }).send(res);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/graph/freeze-simulate/:accountId
 * Simulate the impact of freezing an account
 */
async function freezeSimulate(req, res, next) {
  try {
    const { accountId } = req.params;

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw ApiError.notFound("Account not found");

    // Get all pending/recent transactions involving this account
    const affectedTransactions = await prisma.transaction.findMany({
      where: {
        OR: [{ senderAccountId: accountId }, { receiverAccountId: accountId }],
        timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
      },
      include: {
        senderAccount: { select: { id: true, accountNumber: true, accountHolder: true, bankName: true } },
        receiverAccount: { select: { id: true, accountNumber: true, accountHolder: true, bankName: true } },
      },
      orderBy: { timestamp: "desc" },
    });

    // Find downstream accounts (accounts that received money from this account)
    const downstreamEdges = await prisma.fundFlowEdge.findMany({
      where: { sourceAccountId: accountId },
      include: {
        targetAccount: {
          select: { id: true, accountNumber: true, accountHolder: true, bankName: true, riskScore: true, muleScore: true },
        },
      },
    });

    const downstreamAccounts = [...new Map(downstreamEdges.map((e) => [e.targetAccount.id, e.targetAccount])).values()];

    // Calculate impact metrics
    const totalBlockedAmount = affectedTransactions
      .filter((t) => t.senderAccountId === accountId)
      .reduce((sum, t) => sum + t.amount, 0);

    const incomingBlockedAmount = affectedTransactions
      .filter((t) => t.receiverAccountId === accountId)
      .reduce((sum, t) => sum + t.amount, 0);

    const fraudulentTxns = affectedTransactions.filter((t) => t.isFraud);

    const result = {
      account: {
        id: account.id,
        accountNumber: account.accountNumber,
        accountHolder: account.accountHolder,
        bankName: account.bankName,
        currentBalance: account.balance,
        riskScore: account.riskScore,
        muleScore: account.muleScore,
        alreadyFrozen: account.isFrozen,
      },
      impact: {
        affectedTransactionCount: affectedTransactions.length,
        fraudulentTransactionCount: fraudulentTxns.length,
        outgoingBlockedAmount: totalBlockedAmount,
        incomingBlockedAmount,
        totalBlockedAmount: totalBlockedAmount + incomingBlockedAmount,
        downstreamAccountsAffected: downstreamAccounts.length,
        downstreamAccounts,
      },
      recommendation: account.riskScore >= 0.7 || account.muleScore >= 0.5
        ? "FREEZE_RECOMMENDED"
        : account.riskScore >= 0.4
          ? "REVIEW_REQUIRED"
          : "LOW_RISK",
      recentTransactions: affectedTransactions.slice(0, 10),
    };

    // Emit result via socket
    if (io) {
      io.emit(SOCKET_EVENTS.FREEZE_SIMULATE_RESULT, result);
    }

    ApiResponse.success(result, "Freeze simulation completed").send(res);
  } catch (error) {
    next(error);
  }
}

module.exports = { getFundFlow, getNetwork, detectRings, freezeSimulate, setSocketIO };
