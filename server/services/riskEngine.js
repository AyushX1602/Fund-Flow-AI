/**
 * riskEngine.js — 6-Layer Composite Risk Engine
 *
 * Computes a composite fraud score from 6 independent signal layers.
 * Formula: FinalScore = (0.7 × MaxLayer) + (0.3 × WeightedAvg)
 *
 * This ensures no single high-risk signal gets diluted by other low-risk layers.
 * The ML model (Layer 4) is just one of 6 inputs — not the only arbiter.
 *
 * Layers:
 *   L1 - Location Anomaly     (cross-state / high-risk bank pairs)
 *   L2 - Channel Risk         (channel-based base risk)
 *   L3 - Behavioral Pattern   (amount deviation vs sender history)
 *   L4 - ML Probability       (XGBoost fraudScore)
 *   L5 - Network Graph        (ring/chain membership)
 *   L6 - Velocity             (transaction frequency in last 5 min)
 */

const prisma = require("../prismaClient");

// ─── Channel base risk scores ─────────────────────────────────────────────
const CHANNEL_RISK = {
  MOBILE_APP:   0.25, // UPI via mobile — low friction but traceable
  NET_BANKING:  0.15, // Authenticated session
  ATM:          0.40, // Cash-based, harder to trace
  BRANCH:       0.10, // In-person, verified
  POS:          0.12, // Point of sale
  API:          0.30, // Automated — could be bulk ops
};

// ─── Bank pairs that indicate cross-region / high-risk transfers ──────────
// In India PSB context, certain bank combinations signal elevated risk
const HIGH_RISK_BANK_KEYWORDS = ["cooperative", "urban", "gramin", "rural", "nidhi"];

// ─── City-tier map for India (based on RBI financial inclusion tiers) ─────
// Tier-1: High-density metros with regulated banking infrastructure
const TIER1_CITIES = new Set([
  "mumbai", "delhi", "bangalore", "bengaluru", "hyderabad", "chennai",
  "kolkata", "pune", "ahmedabad", "surat", "jaipur", "lucknow",
]);
// Tier-3: Low-density cities with historically weaker AML enforcement
const TIER3_CITIES = new Set([
  "bhagalpur", "muzaffarpur", "dhule", "aligarh", "bareilly", "moradabad",
  "saharanpur", "gorakhpur", "ghazipur", "mau", "azamgarh", "sitapur",
  "hardoi", "unnao", "balrampur", "gonda", "bahraich", "shravasti",
]);
// High-risk UPI PSPs (cooperative / small payment banks)
const HIGH_RISK_PSPS = new Set(["ibl", "fino", "paytm", "airtel"]);

// ─── Weights for weighted average (must sum to 1.0) ──────────────────────
// Calibrated against XGBoost feature importances (ML Model page):
//   Channel signals (UPI/IMPS/NEFT/ATM) dominate at ~55% combined → L2 boosted
//   Time/velocity signals (Night Hours, Hour of Day) = ~14%       → L6 boosted
//   Terminal Receiver (network) = ~5% only                        → L5 reduced
//   Amount deviation (behavioral) = ~4% in model                  → L3 reduced
//   L4_ml stays highest — it already encodes all features internally
const LAYER_WEIGHTS = {
  L1_location:   0.12, // Cross-bank + city-tier + PSP risk
  L2_channel:    0.15, // ↑ Channel is #1 ML feature (UPI/IMPS/NEFT/ATM = 55%)
  L3_behavioral: 0.15, // ↓ Amount deviation less critical per ML (~4%)
  L4_ml:         0.35, // ML XGBoost score — highest weight, encodes all features
  L5_network:    0.10, // ↓ Terminal receiver only ~5% importance in XGBoost
  L6_velocity:   0.13, // ↑ Night hours + hour of day = ~14% in ML
  // Sum: 0.12 + 0.15 + 0.15 + 0.35 + 0.10 + 0.13 = 1.00
};

/**
 * Compute 6-layer risk score for a transaction.
 *
 * @param {Object} transaction - Full transaction object from DB
 * @param {Object} senderAccount - Sender account with bankName, riskScore, muleScore
 * @param {Object} receiverAccount - Receiver account
 * @returns {Object} { compositeScore, layers, dominantLayer, formula }
 */
async function computeRiskLayers(transaction, senderAccount, receiverAccount) {
  const layers = {};

  // ── L1: Location Anomaly ─────────────────────────────────────────────────
  // Combines bank-tier risk + city-tier risk + PSP cross-region signal
  layers.L1_location = computeLocationRisk(transaction, senderAccount, receiverAccount);

  // ── L2: Channel Trust ────────────────────────────────────────────────────
  // Each channel has an inherent risk profile
  layers.L2_channel = CHANNEL_RISK[transaction.channel] ?? 0.2;

  // ── L3: Behavioral Pattern ───────────────────────────────────────────────
  // How much does this amount deviate from the sender's norm?
  layers.L3_behavioral = await computeBehavioralRisk(transaction, senderAccount);

  // ── L4: ML Probability ───────────────────────────────────────────────────
  // XGBoost score — already computed and stored on the transaction
  layers.L4_ml = transaction.fraudScore ?? 0;

  // ── L5: Network Graph ────────────────────────────────────────────────────
  // Is this account part of a known ring or chain?
  layers.L5_network = await computeNetworkRisk(transaction, senderAccount, receiverAccount);

  // ── L6: Velocity ─────────────────────────────────────────────────────────
  // How many transactions has the sender sent in the last 5 minutes?
  layers.L6_velocity = await computeVelocityRisk(transaction);

  // ── Composite Formula ────────────────────────────────────────────────────
  const layerValues = Object.values(layers);
  const maxLayer = Math.max(...layerValues);

  const weightedAvg = Object.entries(layers).reduce((sum, [key, val]) => {
    return sum + val * (LAYER_WEIGHTS[key] ?? 0);
  }, 0);

  // FraudSense formula: dominant signal gets 70%, weighted avg gets 30%
  const compositeScore = Math.min(1, (0.7 * maxLayer) + (0.3 * weightedAvg));

  // Find which layer is the dominant risk driver
  const dominantLayer = Object.entries(layers).reduce((a, b) => a[1] > b[1] ? a : b)[0];

  return {
    compositeScore: parseFloat(compositeScore.toFixed(4)),
    layers: {
      location:   parseFloat(layers.L1_location.toFixed(3)),
      channel:    parseFloat(layers.L2_channel.toFixed(3)),
      behavioral: parseFloat(layers.L3_behavioral.toFixed(3)),
      ml:         parseFloat(layers.L4_ml.toFixed(3)),
      network:    parseFloat(layers.L5_network.toFixed(3)),
      velocity:   parseFloat(layers.L6_velocity.toFixed(3)),
    },
    dominantLayer: dominantLayer.replace("L1_", "").replace("L2_", "").replace("L3_", "").replace("L4_", "").replace("L5_", "").replace("L6_", ""),
    formula: `(0.7 × ${maxLayer.toFixed(3)}) + (0.3 × ${weightedAvg.toFixed(3)}) = ${compositeScore.toFixed(3)}`,
  };
}

// ─── Layer Implementations ────────────────────────────────────────────────

function computeLocationRisk(transaction, senderAccount, receiverAccount) {
  let risk = 0.1; // baseline

  const senderBank    = (senderAccount?.bankName  || "").toLowerCase();
  const receiverBank  = (receiverAccount?.bankName || "").toLowerCase();
  const originCity    = (transaction?.location     || "").toLowerCase();

  // ── Bank keyword risk (cooperative / gramin = weaker KYC) ───────────────
  const senderHighRisk   = HIGH_RISK_BANK_KEYWORDS.some(k => senderBank.includes(k));
  const receiverHighRisk = HIGH_RISK_BANK_KEYWORDS.some(k => receiverBank.includes(k));
  if (senderHighRisk)   risk += 0.25;
  if (receiverHighRisk) risk += 0.20;

  // ── Cross-bank transfer ──────────────────────────────────────────────────
  if (senderBank !== receiverBank) risk += 0.10;

  // ── City-tier risk (RBI classification) ─────────────────────────────────
  if (originCity) {
    if (TIER3_CITIES.has(originCity)) {
      risk += 0.20; // Known high-risk low-density city
    } else if (!TIER1_CITIES.has(originCity)) {
      risk += 0.08; // Unknown Tier-2 — mild boost
    }
  }

  // ── Receiver UPI PSP risk ────────────────────────────────────────────────
  const receiverPsp = (transaction?.upiVpaReceiver || "").split("@")[1]?.toLowerCase();
  if (receiverPsp && HIGH_RISK_PSPS.has(receiverPsp)) risk += 0.12;

  // ── Sender account-level risk cascade ───────────────────────────────────
  if (senderAccount?.riskScore > 0.5) risk += 0.20;

  return Math.min(1, risk);
}

async function computeBehavioralRisk(transaction, senderAccount) {
  try {
    // Get sender's last 30 transactions for avg amount
    const history = await prisma.transaction.findMany({
      where: {
        senderAccountId: senderAccount.id,
        id: { not: transaction.id },
      },
      select: { amount: true },
      orderBy: { timestamp: "desc" },
      take: 30,
    });

    if (history.length < 3) {
      // Not enough history — new account, slightly elevated
      return 0.35;
    }

    const amounts = history.map(t => Number(t.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const currentAmount = Number(transaction.amount);

    if (avgAmount === 0) return 0.2;

    const ratio = currentAmount / avgAmount;

    // Score based on how much the current amount deviates from normal
    if (ratio > 20)  return 0.95; // 20x above average
    if (ratio > 10)  return 0.85;
    if (ratio > 5)   return 0.70;
    if (ratio > 3)   return 0.55;
    if (ratio > 1.5) return 0.30;
    if (ratio < 0.1) return 0.40; // Unusually small (structuring)
    return 0.10; // Normal range

  } catch {
    return 0.2; // fallback
  }
}

async function computeNetworkRisk(transaction, senderAccount, receiverAccount) {
  let risk = 0;

  // Ring member — highest network risk
  if (transaction.ringId) risk = Math.max(risk, 0.85);

  // Chain member
  if (transaction.chainId) risk = Math.max(risk, 0.65);

  // Sender is flagged as mule
  if (senderAccount?.muleScore > 0.5) risk = Math.max(risk, 0.75);
  if (receiverAccount?.muleScore > 0.5) risk = Math.max(risk, 0.70);

  // Check if sender has > 3 FundFlowEdges in last hour (layered multi-hop)
  try {
    const recentEdges = await prisma.fundFlowEdge.count({
      where: {
        sourceAccountId: senderAccount.id,
        timestamp: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentEdges > 5)  risk = Math.max(risk, 0.80);
    else if (recentEdges > 2) risk = Math.max(risk, 0.50);
  } catch {
    // ignore
  }

  return Math.min(1, risk);
}

async function computeVelocityRisk(transaction) {
  try {
    // Count transactions from same sender in last 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentCount = await prisma.transaction.count({
      where: {
        senderAccountId: transaction.senderAccountId,
        timestamp: { gte: fiveMinAgo },
        id: { not: transaction.id },
      },
    });

    // Also check last 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hourCount = await prisma.transaction.count({
      where: {
        senderAccountId: transaction.senderAccountId,
        timestamp: { gte: oneHourAgo },
        id: { not: transaction.id },
      },
    });

    if (recentCount >= 8) return 0.95; // 8+ in 5 min — velocity burst
    if (recentCount >= 5) return 0.80;
    if (recentCount >= 3) return 0.65;
    if (hourCount   >= 15) return 0.55;
    if (hourCount   >= 8)  return 0.35;
    return 0.05; // Normal
  } catch {
    return 0.05;
  }
}

module.exports = { computeRiskLayers, LAYER_WEIGHTS };
