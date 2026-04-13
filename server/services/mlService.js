const axios = require("axios");
const config = require("../config");
const logger = require("../utils/logger");

/**
 * ML Service — handles fraud scoring.
 *
 * Strategy:
 * 1. Try to reach FastAPI ML service first (when deployed)
 * 2. If unavailable, fall back to rule-based scoring
 *
 * The rule-based fallback ensures the demo works WITHOUT the ML service.
 * This is the #1 priority for demo readiness.
 */

let fastApiAvailable = null; // null = unknown, true/false = cached

/**
 * Check if FastAPI ML service is reachable.
 * Caches result for 30 seconds to avoid spamming health checks.
 */
let lastHealthCheck = 0;
async function isFastApiAvailable() {
  const now = Date.now();
  if (fastApiAvailable !== null && now - lastHealthCheck < 30000) {
    return fastApiAvailable;
  }

  try {
    await axios.get(`${config.mlService.url}/health`, { timeout: 2000 });
    fastApiAvailable = true;
    lastHealthCheck = now;
    logger.info("FastAPI ML service is available");
  } catch {
    fastApiAvailable = false;
    lastHealthCheck = now;
    logger.debug("FastAPI ML service unavailable — using rule-based fallback");
  }
  return fastApiAvailable;
}

/**
 * Score a single transaction.
 * Returns: { fraudScore, isFraud, reasons[], modelVersion }
 */
async function scoreTransaction(transaction, senderAccount, receiverAccount) {
  const available = await isFastApiAvailable();

  if (available) {
    try {
      return await scoreViaFastApi(transaction, senderAccount, receiverAccount);
    } catch (error) {
      logger.warn("FastAPI scoring failed, falling back to rules", { error: error.message });
    }
  }

  // Rule-based fallback
  return ruleBasedScore(transaction, senderAccount, receiverAccount);
}

/**
 * Score via FastAPI ML service.
 */
async function scoreViaFastApi(transaction, senderAccount, receiverAccount) {
  const payload = {
    transaction_id: transaction.transactionId,
    amount: transaction.amount,
    type: transaction.type,
    txn_type: transaction.type,
    channel: transaction.channel?.toLowerCase() || "mobile",
    sender_account: senderAccount.accountNumber,
    receiver_account: receiverAccount.accountNumber,
    sender_bank: senderAccount.bankName,
    receiver_bank: receiverAccount.bankName,
    sender_kyc_type: senderAccount.kycType,
    sender_mule_score: senderAccount.muleScore,
    timestamp: transaction.timestamp,
  };

  const headers = {};
  if (config.mlService.apiKey) {
    headers["X-API-Key"] = config.mlService.apiKey;
  }

  const response = await axios.post(`${config.mlService.url}/predict`, payload, {
    timeout: config.mlService.timeout,
    headers,
  });

  return {
    fraudScore: response.data.fraud_score,
    isFraud: response.data.is_fraud,
    reasons: response.data.reasons || [],
    modelVersion: response.data.model_version || "xgboost-v1",
  };
}

/**
 * Rule-based fraud scoring fallback.
 * Provides realistic scoring without ML model.
 * Each rule adds a weighted contribution to the final score.
 */
function ruleBasedScore(transaction, senderAccount, receiverAccount) {
  let score = 0;
  const reasons = [];

  // ── Amount-based rules ──
  if (transaction.amount > 500000) {
    score += 0.3;
    reasons.push({
      feature: "amount",
      value: transaction.amount,
      impact: 0.3,
      description: `High-value transaction: ₹${(transaction.amount / 100000).toFixed(1)}L exceeds ₹5L threshold`,
    });
  } else if (transaction.amount > 50000 && transaction.type === "UPI") {
    score += 0.25;
    reasons.push({
      feature: "amount_channel",
      value: transaction.amount,
      impact: 0.25,
      description: `UPI transaction ₹${transaction.amount.toLocaleString()} exceeds typical UPI range`,
    });
  }

  // ── Structuring detection (near thresholds) ──
  if (transaction.amount >= 45000 && transaction.amount <= 50000) {
    score += 0.25;
    reasons.push({
      feature: "near_50k_threshold",
      value: transaction.amount,
      impact: 0.25,
      description: `Amount ₹${transaction.amount.toLocaleString()} is suspiciously close to ₹50,000 reporting threshold`,
    });
  }

  if (transaction.amount >= 900000 && transaction.amount <= 1000000) {
    score += 0.3;
    reasons.push({
      feature: "near_10l_threshold",
      value: transaction.amount,
      impact: 0.3,
      description: `Amount ₹${(transaction.amount / 100000).toFixed(1)}L is near ₹10L PMLA reporting threshold`,
    });
  }

  // ── KYC-based rules (India Stack) ──
  if (senderAccount.kycType === "OTP_BASED") {
    score += 0.1;
    reasons.push({
      feature: "kyc_type",
      value: "OTP_BASED",
      impact: 0.1,
      description: "Sender has OTP-based KYC (lower verification tier)",
    });
  }

  if (senderAccount.kycType === "MIN_KYC") {
    score += 0.15;
    reasons.push({
      feature: "kyc_type",
      value: "MIN_KYC",
      impact: 0.15,
      description: "Sender has minimum KYC — high-risk verification level",
    });
  }

  if (senderAccount.kycFlagged) {
    score += 0.2;
    reasons.push({
      feature: "kyc_flagged",
      value: true,
      impact: 0.2,
      description: `Sender KYC flagged: ${senderAccount.kycFlagReason || "compliance issue"}`,
    });
  }

  // ── Mule score rules ──
  if (senderAccount.muleScore > 0.5) {
    score += 0.2;
    reasons.push({
      feature: "sender_mule_score",
      value: senderAccount.muleScore,
      impact: 0.2,
      description: `Sender account has elevated mule score: ${senderAccount.muleScore.toFixed(2)}`,
    });
  }

  if (receiverAccount.muleScore > 0.5) {
    score += 0.15;
    reasons.push({
      feature: "receiver_mule_score",
      value: receiverAccount.muleScore,
      impact: 0.15,
      description: `Receiver account has elevated mule score: ${receiverAccount.muleScore.toFixed(2)}`,
    });
  }

  // ── Cross-bank transfer ──
  if (senderAccount.bankName !== receiverAccount.bankName) {
    score += 0.05;
    reasons.push({
      feature: "cross_bank",
      value: true,
      impact: 0.05,
      description: `Cross-bank transfer: ${senderAccount.bankName} → ${receiverAccount.bankName}`,
    });
  }

  // ── Account age risk ──
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(senderAccount.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (accountAgeDays < 30) {
    score += 0.15;
    reasons.push({
      feature: "account_age",
      value: accountAgeDays,
      impact: 0.15,
      description: `Sender account is only ${accountAgeDays} days old — new account risk`,
    });
  }

  // ── VPA age risk ──
  if (transaction.vpaAgeDays !== null && transaction.vpaAgeDays !== undefined && transaction.vpaAgeDays < 7) {
    score += 0.1;
    reasons.push({
      feature: "vpa_age",
      value: transaction.vpaAgeDays,
      impact: 0.1,
      description: `Sender VPA is only ${transaction.vpaAgeDays} days old`,
    });
  }

  // ── Frozen account check ──
  if (senderAccount.isFrozen) {
    score += 0.4;
    reasons.push({
      feature: "sender_frozen",
      value: true,
      impact: 0.4,
      description: "Sender account is frozen — transaction from flagged account",
    });
  }

  if (receiverAccount.isFrozen) {
    score += 0.3;
    reasons.push({
      feature: "receiver_frozen",
      value: true,
      impact: 0.3,
      description: "Receiver account is currently frozen — transfer to frozen account",
    });
  }

  // ── Unusual channel/time patterns ──
  const hour = new Date(transaction.timestamp).getHours();
  if (hour >= 1 && hour <= 5) {
    score += 0.1;
    reasons.push({
      feature: "unusual_hour",
      value: hour,
      impact: 0.1,
      description: `Transaction at unusual hour: ${hour}:00 (1AM-5AM window)`,
    });
  }

  // ── Scam Keywords in Remarks ──
  const SCAM_KEYWORDS = [
    "prize", "lottery", "investment return", "forex profit",
    "job advance", "loan", "otp", "urgent help",
    "award money", "kyc update"
  ];
  
  const desc = (transaction.description || "").toLowerCase();
  const hasScamKeyword = SCAM_KEYWORDS.some(k => desc.includes(k));
  if (hasScamKeyword) {
    score += 0.35;
    reasons.push({ 
      feature: "scam_keyword", 
      value: true,
      impact: 0.35,
      description: `Payment remark contains known scam phrase: "${transaction.description}"` 
    });
  }

  // Clamp score between 0 and 1
  const fraudScore = Math.min(1, Math.max(0, score));
  const isFraud = fraudScore >= config.alertThreshold;

  // Sort reasons by impact (highest first)
  reasons.sort((a, b) => b.impact - a.impact);

  return {
    fraudScore: Math.round(fraudScore * 1000) / 1000,
    isFraud,
    reasons,
    modelVersion: "rule-based-v1",
  };
}

/**
 * Get SHAP explanation for a transaction (proxy to FastAPI).
 * Falls back to stored mlReasons.
 */
async function getExplanation(transactionId, storedReasons) {
  const available = await isFastApiAvailable();

  if (available) {
    try {
      const response = await axios.get(
        `${config.mlService.url}/explain/${transactionId}`,
        { timeout: config.mlService.timeout }
      );
      return response.data;
    } catch (error) {
      logger.warn("FastAPI explain failed, returning stored reasons", { error: error.message });
    }
  }

  // Fallback: return stored reasons
  return {
    transactionId,
    explanationType: "rule-based",
    reasons: storedReasons || [],
    modelVersion: "rule-based-v1",
  };
}

/**
 * Get current model info.
 */
async function getModelInfo() {
  const available = await isFastApiAvailable();

  if (available) {
    try {
      const response = await axios.get(`${config.mlService.url}/model-info`, { timeout: 3000 });
      return response.data;
    } catch {
      // fall through
    }
  }

  return {
    modelName: "rule-based-fallback",
    version: "v1",
    type: "rule-based",
    description: "Heuristic rule-based scoring (FastAPI ML service not connected)",
    rulesCount: 12,
    isMLActive: false,
    features: [
      "amount", "amount_channel", "near_50k_threshold", "near_10l_threshold",
      "kyc_type", "kyc_flagged", "sender_mule_score", "receiver_mule_score",
      "cross_bank", "account_age", "vpa_age", "unusual_hour",
    ],
  };
}

module.exports = {
  scoreTransaction,
  getExplanation,
  getModelInfo,
  isFastApiAvailable,
};
