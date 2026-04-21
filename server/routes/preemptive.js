/**
 * POST /api/preemptive/screen
 *
 * Pre-transaction screening — analyze sender's behavioral history
 * BEFORE a transaction is submitted, and return a risk assessment
 * with recommendation: BLOCK / FLAG / ALLOW.
 *
 * Body: { senderId, receiverId, amount, type, channel }
 */

const express  = require("express");
const router   = express.Router();
const prisma   = require("../prismaClient");
const ApiResponse = require("../utils/ApiResponse");
const ApiError    = require("../utils/ApiError");

// ── Helper: compute pre-tx risk ─────────────────────────────────────────────
async function computePreTxRisk({ sender, receiver, amount, type }) {
  const now    = new Date();
  const t1h    = new Date(now - 1  * 3600 * 1000);
  const t24h   = new Date(now - 24 * 3600 * 1000);
  const t7d    = new Date(now - 7  * 24 * 3600 * 1000);

  const [txns1h, txns24h, txns7d] = await Promise.all([
    prisma.transaction.findMany({
      where:   { senderAccountId: sender.id, timestamp: { gte: t1h } },
      select:  { amount: true, receiverAccountId: true, timestamp: true },
    }),
    prisma.transaction.findMany({
      where:   { senderAccountId: sender.id, timestamp: { gte: t24h } },
      select:  { amount: true, receiverAccountId: true },
    }),
    prisma.transaction.findMany({
      where:   { senderAccountId: sender.id, timestamp: { gte: t7d } },
      select:  { amount: true },
    }),
  ]);

  const signals = [];
  let score = 0;

  // ── Signal 1: Velocity (1h) ─────────────────────────────────────────────
  const count1h = txns1h.length;
  let velScore  = 0;
  if (count1h >= 10)   velScore = 0.9;
  else if (count1h >= 5) velScore = 0.55;
  else if (count1h >= 3) velScore = 0.25;
  score += velScore * 0.28;
  signals.push({
    name:   "Velocity (1h)",
    value:  `${count1h} txns in last hour`,
    score:  velScore,
    impact: velScore > 0.5 ? "HIGH" : velScore > 0.2 ? "MEDIUM" : "LOW",
    description: count1h >= 5
      ? `Sender fired ${count1h} transactions in the last hour — automated activity suspected`
      : `Normal sending pace (${count1h} in 1h)`,
  });

  // ── Signal 2: Fan-Out (unique receivers in 1h) ───────────────────────────
  const uniqueRecv = new Set(txns1h.map(t => t.receiverAccountId)).size;
  let fanScore = 0;
  if (uniqueRecv >= 6)      fanScore = 0.9;
  else if (uniqueRecv >= 3) fanScore = 0.5;
  score += fanScore * 0.22;
  signals.push({
    name:   "Fan-Out (unique receivers)",
    value:  `${uniqueRecv} unique receivers in 1h`,
    score:  fanScore,
    impact: fanScore > 0.5 ? "HIGH" : fanScore > 0.2 ? "MEDIUM" : "LOW",
    description: uniqueRecv >= 3
      ? `Sending to ${uniqueRecv} different accounts in 1h — potential smurfing pattern`
      : `Normal receiver diversity`,
  });

  // ── Signal 3: Amount Anomaly (z-score vs 7-day baseline) ────────────────
  let amtScore = 0;
  let amtDesc  = "No historical baseline";
  if (txns7d.length >= 3) {
    const amounts = txns7d.map(t => t.amount);
    const avg     = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const std     = Math.sqrt(amounts.reduce((a, b) => a + (b - avg) ** 2, 0) / amounts.length);
    if (std > 0) {
      const z = Math.abs(amount - avg) / std;
      amtScore = z > 5 ? 1 : z > 3 ? 0.75 : z > 2 ? 0.45 : z > 1 ? 0.2 : 0;
      amtDesc  = `₹${amount.toLocaleString("en-IN")} vs 7-day avg ₹${avg.toFixed(0)} (z=${z.toFixed(1)})`;
    } else {
      amtDesc = `Amount matches historical pattern (avg ₹${avg.toFixed(0)})`;
    }
  }
  score += amtScore * 0.20;
  signals.push({
    name:   "Amount Anomaly",
    value:  `₹${amount.toLocaleString("en-IN")}`,
    score:  amtScore,
    impact: amtScore > 0.5 ? "HIGH" : amtScore > 0.2 ? "MEDIUM" : "LOW",
    description: amtDesc,
  });

  // ── Signal 4: New Receiver Risk ─────────────────────────────────────────
  const prevToReceiver = await prisma.transaction.count({
    where: { senderAccountId: sender.id, receiverAccountId: receiver.id },
  });
  const newRecvScore = prevToReceiver === 0 ? (amount > 10000 ? 0.7 : 0.3) : 0;
  score += newRecvScore * 0.15;
  signals.push({
    name:   "New Receiver",
    value:  prevToReceiver === 0 ? "First-time payee" : `${prevToReceiver} prior txns`,
    score:  newRecvScore,
    impact: newRecvScore > 0.5 ? "HIGH" : newRecvScore > 0 ? "MEDIUM" : "LOW",
    description: prevToReceiver === 0
      ? `This sender has NEVER transacted with this receiver before${amount > 10000 ? " — high-value first transfer is a phishing risk signal" : ""}`
      : `Known counterparty (${prevToReceiver} previous transactions)`,
  });

  // ── Signal 5: Sender Mule Score ─────────────────────────────────────────
  const muleScore = sender.muleScore || 0;
  const muleContrib = muleScore > 0.6 ? muleScore * 0.8 : muleScore > 0.3 ? muleScore * 0.4 : 0;
  score += muleContrib * 0.10;
  signals.push({
    name:   "Mule Risk",
    value:  `${(muleScore * 100).toFixed(1)}%`,
    score:  muleContrib,
    impact: muleScore > 0.6 ? "HIGH" : muleScore > 0.3 ? "MEDIUM" : "LOW",
    description: muleScore > 0.6
      ? `Sender has elevated mule score (${(muleScore * 100).toFixed(0)}%) — potential money conduit`
      : `Sender mule risk is within normal range`,
  });

  // ── Signal 6: KYC Risk ───────────────────────────────────────────────────
  const kycRiskMap = { MIN_KYC: 0.5, OTP_BASED: 0.25, FULL_KYC: 0 };
  const kycScore   = kycRiskMap[sender.kycType] ?? 0;
  score += kycScore * 0.05;
  signals.push({
    name:   "KYC Level",
    value:  sender.kycType || "UNKNOWN",
    score:  kycScore,
    impact: kycScore > 0.3 ? "HIGH" : kycScore > 0 ? "MEDIUM" : "LOW",
    description: sender.kycType === "MIN_KYC"
      ? "Minimum KYC — weakest verification tier, high impersonation risk"
      : sender.kycType === "OTP_BASED"
      ? "OTP eKYC — no in-person verification, elevated risk"
      : "Full KYC — verified identity",
  });

  const finalScore = Math.min(parseFloat(score.toFixed(4)), 1.0);
  const riskPct    = Math.round(finalScore * 100);

  let recommendation, tier, color;
  if (finalScore >= 0.75) {
    recommendation = "BLOCK";
    tier   = "CRITICAL";
    color  = "red";
  } else if (finalScore >= 0.50) {
    recommendation = "FLAG";
    tier   = "HIGH";
    color  = "orange";
  } else if (finalScore >= 0.30) {
    recommendation = "FLAG";
    tier   = "MEDIUM";
    color  = "amber";
  } else {
    recommendation = "ALLOW";
    tier   = "LOW";
    color  = "green";
  }

  return {
    score:          finalScore,
    riskPercent:    riskPct,
    tier,
    color,
    recommendation,
    signals,
    senderHistory: {
      txns1h:   count1h,
      txns24h:  txns24h.length,
      txns7d:   txns7d.length,
    },
    receiver: {
      id:            receiver.id,
      accountNumber: receiver.accountNumber,
      accountHolder: receiver.accountHolder,
      bankName:      receiver.bankName,
      muleScore:     receiver.muleScore,
      isFrozen:      receiver.isFrozen,
    },
  };
}

// ── POST /api/preemptive/screen ──────────────────────────────────────────────
router.post("/screen", async (req, res, next) => {
  try {
    const { senderId, receiverId, amount, type = "UPI", channel = "MOBILE_APP" } = req.body;

    if (!senderId || !receiverId || !amount) {
      return next(ApiError.badRequest("senderId, receiverId and amount are required"));
    }
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return next(ApiError.badRequest("amount must be a positive number"));
    }
    if (senderId === receiverId) {
      return next(ApiError.badRequest("Sender and receiver cannot be the same account"));
    }

    const [sender, receiver] = await Promise.all([
      prisma.account.findUnique({ where: { id: senderId } }),
      prisma.account.findUnique({ where: { id: receiverId } }),
    ]);

    if (!sender)   return next(ApiError.notFound("Sender account not found"));
    if (!receiver) return next(ApiError.notFound("Receiver account not found"));

    if (sender.isFrozen) {
      return ApiResponse.success({
        score: 1.0, riskPercent: 100, tier: "CRITICAL", color: "red",
        recommendation: "BLOCK",
        signals: [{ name: "Account Frozen", value: "FROZEN", score: 1, impact: "HIGH", description: "Sender account is currently frozen — all transactions blocked" }],
        senderHistory: { txns1h: 0, txns24h: 0, txns7d: 0 },
        receiver: { id: receiver.id, accountNumber: receiver.accountNumber, accountHolder: receiver.accountHolder, bankName: receiver.bankName },
      }, "Sender account is frozen — transaction blocked").send(res);
    }

    const result = await computePreTxRisk({ sender, receiver, amount: parseFloat(amount), type, channel });
    ApiResponse.success(result, "Pre-transaction screening complete").send(res);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/preemptive/status (already in index.js, replicated here for consistency) ──
router.get("/status", (req, res) => {
  try {
    const engine = require("../services/preemptiveEngine");
    res.json({ success: true, watchedCount: engine.getWatchedCount(), watchedAccounts: engine.getWatchedAccounts().slice(0, 20) });
  } catch {
    res.json({ success: true, watchedCount: 0, watchedAccounts: [] });
  }
});

module.exports = router;
