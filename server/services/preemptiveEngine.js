/**
 * preemptiveEngine.js — Preemptive Fraud Detection
 *
 * Runs every 5 minutes as a background job.
 * Scans active accounts for behavioral anomalies and creates
 * alerts BEFORE a fraudulent transaction happens.
 *
 * Detection signals (multi-window, works on both live and seeded data):
 *  1. Velocity spike  — txn count in 1h or 24h vs baseline
 *  2. Fan-out spike   — unique receivers in 24h window
 *  3. Amount anomaly  — z-score vs 7-day personal average
 *  4. Mule score      — standalone signal (no velocity required)
 *  5. High risk score — account riskScore > 0.5 with volume
 *  6. Night activity  — transactions between 1AM-5AM IST
 */

const prisma  = require("../prismaClient");
const logger  = require("../utils/logger");

const INTERVAL_MS          = 5 * 60 * 1000; // run every 5 min
const PREEMPTIVE_THRESHOLD = 0.40;           // lowered — catches mule + volume patterns
const ACTIVITY_WINDOW_DAYS = 7;              // scan accounts active in last 7 days

// In-memory watch list: accountId → { score, alertedAt, reasons }
const watchedAccounts = new Map();

let ioRef        = null;
let intervalHandle = null;

function setSocketIO(io) { ioRef = io; }

// ── Velocity anomaly score (0–1) ─────────────────────────────────────────────
function velocityAnomalyScore(txn1h, txn24h) {
  let score = 0;
  // 1h window
  if (txn1h >= 10)      score += 0.6;
  else if (txn1h >= 5)  score += 0.3;
  else if (txn1h >= 3)  score += 0.15;
  // 24h window — broader baseline catches seeded demo data patterns
  if (txn24h >= 40)      score += 0.5;
  else if (txn24h >= 20) score += 0.3;
  else if (txn24h >= 10) score += 0.15;
  else if (txn24h >= 5)  score += 0.08;
  return Math.min(score, 1.0);
}

// ── Amount z-score anomaly (0–1) ─────────────────────────────────────────────
function amountAnomalyScore(amount, avg, std) {
  if (!std || std <= 0 || !avg || avg <= 0) return 0;
  const z = Math.abs(amount - avg) / std;
  if (z > 5) return 1.0;
  if (z > 3) return 0.7;
  if (z > 2) return 0.4;
  if (z > 1) return 0.2;
  return 0;
}

// ── Compute preemptive risk for one account ───────────────────────────────────
async function computeAccountRisk(account) {
  const now   = new Date();
  const t1h   = new Date(now - 1  * 3600 * 1000);
  const t24h  = new Date(now - 24 * 3600 * 1000);
  const t7d   = new Date(now - 7  * 24 * 3600 * 1000);

  const [txns1h, txns24h, txns7d] = await Promise.all([
    prisma.transaction.findMany({
      where:  { senderAccountId: account.id, timestamp: { gte: t1h } },
      select: { amount: true, timestamp: true, receiverAccountId: true },
    }),
    prisma.transaction.findMany({
      where:  { senderAccountId: account.id, timestamp: { gte: t24h } },
      select: { amount: true, receiverAccountId: true, timestamp: true },
    }),
    prisma.transaction.findMany({
      where:  { senderAccountId: account.id, timestamp: { gte: t7d } },
      select: { amount: true },
    }),
  ]);

  const count1h  = txns1h.length;
  const count24h = txns24h.length;
  const count7d  = txns7d.length;

  // ── Signal 1: Velocity ───────────────────────────────────────────────────
  const velScore = velocityAnomalyScore(count1h, count24h);

  // ── Signal 2: Fan-out (unique receivers in 24h — broader than 1h) ────────
  const allTxns    = txns1h.length > 0 ? txns1h : txns24h;
  const uniqueRecv = new Set(allTxns.map(t => t.receiverAccountId)).size;
  const fanOutScore = uniqueRecv >= 6 ? 0.8
                    : uniqueRecv >= 4 ? 0.55
                    : uniqueRecv >= 2 ? 0.25
                    : 0;

  // ── Signal 3: Amount anomaly vs 7-day baseline ───────────────────────────
  let amtScore = 0;
  if (txns7d.length >= 3) {
    const amounts  = txns7d.map(t => t.amount);
    const avg      = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const std      = Math.sqrt(amounts.reduce((a, b) => a + (b - avg) ** 2, 0) / amounts.length);
    const recent   = (txns24h[0] || txns7d[0])?.amount || 0;
    amtScore       = amountAnomalyScore(recent, avg, std);
  }

  // ── Signal 4: Mule score (standalone — no velocity required) ─────────────
  const muleRaw   = account.muleScore || 0;
  const muleScore = muleRaw > 0.7 ? 0.9
                  : muleRaw > 0.5 ? 0.6
                  : muleRaw > 0.3 ? 0.25
                  : 0;

  // ── Signal 5: Account risk score (from previous transactions) ────────────
  const riskRaw   = account.riskScore || 0;
  const riskScore = riskRaw > 0.7 ? 0.7
                  : riskRaw > 0.5 ? 0.45
                  : riskRaw > 0.3 ? 0.2
                  : 0;

  // ── Signal 6: Night activity (1AM–5AM IST = 19:30–23:30 UTC) ────────────
  const nightTxns = txns24h.filter(t => {
    const h = new Date(t.timestamp).getUTCHours();
    return h >= 19 && h <= 23;
  }).length;
  const nightScore = nightTxns >= 5 ? 0.6
                   : nightTxns >= 3 ? 0.4
                   : nightTxns >= 1 ? 0.15
                   : 0;

  // ── Weighted composite (sums intentionally > 1 possible, capped) ─────────
  const composite = Math.min(
    velScore    * 0.28 +
    fanOutScore * 0.22 +
    amtScore    * 0.15 +
    muleScore   * 0.20 + // standalone mule signal has high weight
    riskScore   * 0.10 +
    nightScore  * 0.05,
    1.0
  );

  const reasons = [];
  if (velScore    > 0) reasons.push(`Velocity: ${count1h} txns/1h, ${count24h} txns/24h`);
  if (fanOutScore > 0) reasons.push(`Fan-out: ${uniqueRecv} unique receivers`);
  if (muleScore   > 0) reasons.push(`Mule score: ${(muleRaw * 100).toFixed(0)}%`);
  if (riskScore   > 0) reasons.push(`Risk score: ${(riskRaw * 100).toFixed(0)}%`);
  if (nightScore  > 0) reasons.push(`Night activity: ${nightTxns} txns`);
  if (amtScore    > 0) reasons.push(`Amount anomaly (z-score)`);

  return {
    score:       parseFloat(composite.toFixed(4)),
    velScore, fanOutScore, amtScore, muleScore: muleRaw,
    riskScore: riskRaw, nightScore,
    count1h, count24h, count7d, uniqueRecv,
    reasons,
  };
}

// ── Single scan pass ──────────────────────────────────────────────────────────
async function runScan() {
  try {
    logger.info("[Preemptive] Running account risk scan...");

    // Scan accounts active in last 7 days (catches seeded + live data)
    const sinceWindow = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 3600 * 1000);
    const activeRows  = await prisma.transaction.findMany({
      where:    { timestamp: { gte: sinceWindow } },
      select:   { senderAccountId: true },
      distinct: ["senderAccountId"],
    });

    // ALSO always include high-risk + mule accounts even if no recent txns
    const highRiskRows = await prisma.account.findMany({
      where:    { OR: [{ muleScore: { gt: 0.3 } }, { riskScore: { gt: 0.4 } }], isFrozen: false },
      select:   { id: true },
    });

    const allIds = new Set([
      ...activeRows.map(r => r.senderAccountId),
      ...highRiskRows.map(r => r.id),
    ]);

    if (allIds.size === 0) {
      logger.info("[Preemptive] No accounts to scan");
      return;
    }

    const accounts = await prisma.account.findMany({
      where: { id: { in: Array.from(allIds) }, isFrozen: false },
    });

    let watched      = 0;
    let alertsCreated = 0;

    for (const account of accounts) {
      const risk = await computeAccountRisk(account);

      if (!risk || risk.score < PREEMPTIVE_THRESHOLD) {
        if (watchedAccounts.has(account.id)) {
          watchedAccounts.delete(account.id);
        }
        continue;
      }

      const existing   = watchedAccounts.get(account.id);
      const cooldownMs = 30 * 60 * 1000;
      const shouldAlert = !existing || (Date.now() - existing.alertedAt > cooldownMs);

      watchedAccounts.set(account.id, {
        score:         risk.score,
        alertedAt:     Date.now(),
        accountNumber: account.accountNumber,
        accountHolder: account.accountHolder,
        reasons:       risk.reasons,
      });
      watched++;

      if (shouldAlert) {
        const latestTxn = await prisma.transaction.findFirst({
          where:   { senderAccountId: account.id },
          orderBy: { timestamp: "desc" },
        });

        if (latestTxn) {
          const existingAlert = await prisma.alert.findUnique({
            where: { transactionId: latestTxn.id },
          });

          if (!existingAlert) {
            try {
              const severity = risk.score >= 0.80 ? "CRITICAL"
                             : risk.score >= 0.60 ? "HIGH"
                             : risk.score >= 0.40 ? "MEDIUM"
                             : "LOW";

              await prisma.alert.create({
                data: {
                  alertType:     "VELOCITY_BREACH",
                  severity,
                  status:        "NEW",
                  transactionId: latestTxn.id,
                  description:   `[PREEMPTIVE] ${account.accountHolder} (${account.accountNumber}) — behavioral risk score ${(risk.score * 100).toFixed(0)}%. Signals: ${risk.reasons.join(" · ")}`,
                  riskScore:     risk.score,
                  mlReasons: risk.reasons.map(r => ({ feature: "preemptive", impact: risk.score, description: r })),
                },
              });
              alertsCreated++;
              logger.info(`[Preemptive] ⚡ Alert for ${account.accountNumber} score=${risk.score} reasons=${risk.reasons.join(", ")}`);

              if (ioRef) {
                ioRef.emit("PREEMPTIVE_ALERT", {
                  accountId: account.id, accountNumber: account.accountNumber,
                  accountHolder: account.accountHolder, score: risk.score,
                  reasons: risk.reasons,
                });
              }
            } catch (e) {
              logger.debug(`[Preemptive] Alert skip (${account.accountNumber}): ${e.message}`);
            }
          }
        }
      }
    }

    logger.info(`[Preemptive] ✓ ${accounts.length} scanned · ${watched} under watch · ${alertsCreated} new alerts`);
  } catch (err) {
    logger.error("[Preemptive] Scan error:", err.message);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
function start() {
  if (intervalHandle) return;
  logger.info(`[Preemptive] Engine started — scanning every ${INTERVAL_MS / 60000} min · threshold=${PREEMPTIVE_THRESHOLD}`);
  setTimeout(runScan, 3000); // run 3 sec after boot (faster for demo)
  intervalHandle = setInterval(runScan, INTERVAL_MS);
}

function stop() {
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
  logger.info("[Preemptive] Engine stopped");
}

function getWatchedAccounts() {
  return Array.from(watchedAccounts.entries()).map(([id, data]) => ({ id, ...data }));
}

function getWatchedCount() {
  return watchedAccounts.size;
}

module.exports = { start, stop, setSocketIO, getWatchedAccounts, getWatchedCount };
