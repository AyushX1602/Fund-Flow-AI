const prisma = require("../prismaClient");
const mlService = require("./mlService");
const riskEngine = require("./riskEngine");
const { createAuditLog } = require("./auditService");
const { generateTransactionId, parseUpiVpa } = require("../utils/helpers");
const { AUDIT_ACTIONS, SOCKET_EVENTS } = require("../utils/constants");
const config = require("../config");
const logger = require("../utils/logger");

// Socket.io instance (injected from index.js)
let io = null;
function setSocketIO(socketIO) {
  io = socketIO;
}

/**
 * Process a single incoming transaction.
 * Steps:
 * 1. Enrich with UPI VPA data (India Stack)
 * 2. Create transaction record
 * 3. Score via ML service (or fallback)
 * 4. Update transaction with score
 * 5. Create FundFlowEdge
 * 6. Auto-generate alert if threshold met
 * 7. Emit Socket.io events
 *
 * @param {Object} data - Transaction data from API
 * @param {string} [userId] - User who triggered (for audit)
 * @returns {Object} Created transaction with ML results
 */
async function processTransaction(data, userId = null) {
  // Fetch sender & receiver accounts
  const senderAccount = await prisma.account.findUnique({
    where: { id: data.senderAccountId },
  });
  const receiverAccount = await prisma.account.findUnique({
    where: { id: data.receiverAccountId },
  });

  if (!senderAccount) throw new Error(`Sender account not found: ${data.senderAccountId}`);
  if (!receiverAccount) throw new Error(`Receiver account not found: ${data.receiverAccountId}`);

  // Enrich UPI VPA data
  let pspSender = data.pspSender || null;
  let pspReceiver = data.pspReceiver || null;

  if (data.upiVpaSender) {
    const parsed = parseUpiVpa(data.upiVpaSender);
    if (parsed) pspSender = parsed.psp;
  }
  if (data.upiVpaReceiver) {
    const parsed = parseUpiVpa(data.upiVpaReceiver);
    if (parsed) pspReceiver = parsed.psp;
  }

  // Create transaction
  const transaction = await prisma.transaction.create({
    data: {
      transactionId: data.transactionId || generateTransactionId(),
      amount: data.amount,
      currency: data.currency || "INR",
      type: data.type,
      channel: data.channel,
      senderAccountId: data.senderAccountId,
      receiverAccountId: data.receiverAccountId,
      upiVpaSender: data.upiVpaSender || null,
      upiVpaReceiver: data.upiVpaReceiver || null,
      pspSender,
      pspReceiver,
      vpaAgeDays: data.vpaAgeDays || null,
      chainId: data.chainId || null,
      ringId: data.ringId || null,
      ipAddress: data.ipAddress || null,
      deviceId: data.deviceId || null,
      location: data.location || null,
      description: data.description || null,
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    },
    include: {
      senderAccount: { select: { accountNumber: true, accountHolder: true, bankName: true } },
      receiverAccount: { select: { accountNumber: true, accountHolder: true, bankName: true } },
    },
  });

  // Emit new transaction event
  if (io) {
    io.emit(SOCKET_EVENTS.TRANSACTION_NEW, {
      id: transaction.id,
      transactionId: transaction.transactionId,
      amount: transaction.amount,
      type: transaction.type,
      timestamp: transaction.timestamp,
    });
  }

  // Score transaction via ML service
  const mlResult = await mlService.scoreTransaction(transaction, senderAccount, receiverAccount);

  // Update transaction with ML results
  const scoredTransaction = await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      fraudScore: mlResult.fraudScore,
      isFraud: mlResult.isFraud,
      mlModelVersion: mlResult.modelVersion,
      mlReasons: mlResult.reasons,
    },
    include: {
      senderAccount: { select: { id: true, accountNumber: true, accountHolder: true, bankName: true } },
      receiverAccount: { select: { id: true, accountNumber: true, accountHolder: true, bankName: true } },
    },
  });

  // Emit scored event
  if (io) {
    io.emit(SOCKET_EVENTS.TRANSACTION_SCORED, {
      id: scoredTransaction.id,
      transactionId: scoredTransaction.transactionId,
      fraudScore: mlResult.fraudScore,
      isFraud: mlResult.isFraud,
      reasons: mlResult.reasons,
    });
  }

  // Create FundFlowEdge
  await prisma.fundFlowEdge.create({
    data: {
      chainId: data.chainId || null,
      sourceAccountId: data.senderAccountId,
      targetAccountId: data.receiverAccountId,
      transactionId: transaction.id,
      amount: transaction.amount,
      timestamp: transaction.timestamp,
      riskScore: mlResult.fraudScore,
    },
  });

  // Compute 6-layer composite risk score
  const riskProfile = await riskEngine.computeRiskLayers(scoredTransaction, senderAccount, receiverAccount);
  logger.info(`Risk layers for ${scoredTransaction.transactionId}: composite=${riskProfile.compositeScore} dominant=${riskProfile.dominantLayer}`);

  // Auto-generate alert if fraud score OR composite score exceeds threshold
  let alert = null;
  const effectiveScore = Math.max(mlResult.fraudScore, riskProfile.compositeScore);
  if (mlResult.isFraud || effectiveScore >= config.alertThreshold) {
    alert = await createAlertForTransaction(scoredTransaction, mlResult, riskProfile);
  }

  // Update account risk scores
  await updateAccountRiskScores(senderAccount.id);
  await updateAccountRiskScores(receiverAccount.id);

  return { transaction: scoredTransaction, mlResult, riskProfile, alert };
}

/**
 * Create an alert for a flagged transaction.
 */
async function createAlertForTransaction(transaction, mlResult, riskProfile = null) {
  // Use the higher of ML score or composite score — whichever triggered the alert
  const effectiveScore = riskProfile
    ? Math.max(mlResult.fraudScore, riskProfile.compositeScore)
    : mlResult.fraudScore;

  const severity    = getSeverityFromScore(effectiveScore);
  const alertType   = getAlertType(mlResult);

  // Track which brain was the dominant trigger
  const triggeredBy = riskProfile && riskProfile.compositeScore > mlResult.fraudScore
    ? `6-layer [dominant: ${riskProfile.dominantLayer}]`
    : "ml-model";

  try {
    const alert = await prisma.alert.create({
      data: {
        alertType,
        severity,
        transactionId: transaction.id,
        description: buildAlertDescription(transaction, mlResult, riskProfile),
        riskScore: effectiveScore,      // ← effective score, not just ML
        mlReasons: {
          reasons:        mlResult.reasons,
          mlScore:        mlResult.fraudScore,
          compositeScore: riskProfile?.compositeScore ?? null,
          layers:         riskProfile?.layers ?? null,
          dominantLayer:  riskProfile?.dominantLayer ?? null,
          triggeredBy,
        },
      },
    });

    logger.info(`Alert created: ${alert.id} | Score: ${mlResult.fraudScore} | Type: ${alertType}`);

    if (io) {
      io.emit(SOCKET_EVENTS.ALERT_CREATED, {
        id: alert.id,
        alertType,
        severity,
        riskScore: mlResult.fraudScore,
        transactionId: transaction.transactionId,
        amount: transaction.amount,
      });
    }

    return alert;
  } catch (error) {
    // Alert for this transaction may already exist (unique constraint)
    if (error.code === "P2002") {
      logger.warn(`Alert already exists for transaction ${transaction.id}`);
      return null;
    }
    throw error;
  }
}

/**
 * Update rolling risk score for an account based on recent transactions.
 */
async function updateAccountRiskScores(accountId) {
  try {
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        OR: [{ senderAccountId: accountId }, { receiverAccountId: accountId }],
        fraudScore: { not: null },
        timestamp: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      },
      select: { fraudScore: true, isFraud: true, senderAccountId: true },
      orderBy: { timestamp: "desc" },
      take: 50,
    });

    if (recentTransactions.length === 0) return;

    // Weighted average — more recent transactions weigh more
    let totalWeight = 0;
    let weightedSum = 0;
    let fraudAsSender = 0;

    recentTransactions.forEach((txn, idx) => {
      const weight = 1 / (idx + 1); // Decay: 1, 0.5, 0.33, 0.25...
      weightedSum += txn.fraudScore * weight;
      totalWeight += weight;
      if (txn.isFraud && txn.senderAccountId === accountId) fraudAsSender++;
    });

    const riskScore = Math.min(1, weightedSum / totalWeight);
    const muleScore = Math.min(1, fraudAsSender / Math.max(1, recentTransactions.length) * 2);

    await prisma.account.update({
      where: { id: accountId },
      data: { riskScore, muleScore },
    });
  } catch (error) {
    logger.error("Failed to update account risk scores", { accountId, error: error.message });
  }
}

/**
 * Derive severity from fraud score.
 */
function getSeverityFromScore(score) {
  if (score >= 0.8) return "CRITICAL";
  if (score >= 0.6) return "HIGH";
  if (score >= 0.3) return "MEDIUM";
  return "LOW";
}

/**
 * Derive alert type from ML result reasons.
 */
function getAlertType(mlResult) {
  const reasons = mlResult.reasons || [];
  const features = reasons.map((r) => r.feature);

  if (features.includes("sender_mule_score") || features.includes("receiver_mule_score")) {
    return "MULE_ACCOUNT";
  }
  if (features.includes("near_50k_threshold") || features.includes("near_10l_threshold")) {
    return "SUSPICIOUS_PATTERN";
  }
  if (features.includes("amount") && mlResult.fraudScore >= 0.7) {
    return "HIGH_VALUE";
  }
  if (features.includes("velocity")) {
    return "VELOCITY_BREACH";
  }
  return "FRAUD_DETECTED";
}

/**
 * Build human-readable alert description.
 */
function buildAlertDescription(transaction, mlResult, riskProfile = null) {
  const topReasons = (mlResult.reasons || []).slice(0, 3).map((r) => r.description).join("; ");
  let desc = `Fraud alert for ${transaction.type} transaction of ₹${transaction.amount.toLocaleString()} ` +
    `(Score: ${mlResult.fraudScore}). ${topReasons}`;
  if (riskProfile) {
    desc += `. Composite risk: ${riskProfile.compositeScore} [dominant: ${riskProfile.dominantLayer}]`;
  }
  return desc;
}


module.exports = {
  processTransaction,
  setSocketIO,
  updateAccountRiskScores,
  getSeverityFromScore,
};
