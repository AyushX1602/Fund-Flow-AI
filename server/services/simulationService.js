const prisma = require("../prismaClient");
const { processTransaction } = require("./transactionService");
const { generateTransactionId } = require("../utils/helpers");
const { randomAmount, randomPick } = require("../utils/helpers");
const { INDIAN_BANKS, INDIAN_PSPS, SOCKET_EVENTS } = require("../utils/constants");
const logger = require("../utils/logger");

// ─── Active simulation state ──────────────────────────────────────────────
let activeSimulation = null;
let io = null;

function setSocketIO(socketIO) {
  io = socketIO;
}

// ─── Concurrency control ──────────────────────────────────────────────────
// Process up to CONCURRENCY transactions in parallel.
// With a pool of 10 and ~4 queries per txn, 3 workers ≈ 12 active queries max,
// leaving headroom for dashboard/API requests.
const CONCURRENCY = 3;

// Transaction types with realistic weights
const TXN_TYPE_WEIGHTS = [
  { type: "UPI", weight: 0.45 },
  { type: "NEFT", weight: 0.2 },
  { type: "IMPS", weight: 0.15 },
  { type: "RTGS", weight: 0.1 },
  { type: "CASH_DEPOSIT", weight: 0.05 },
  { type: "CASH_WITHDRAWAL", weight: 0.05 },
];

const CHANNEL_WEIGHTS = [
  { channel: "MOBILE_APP", weight: 0.5 },
  { channel: "NET_BANKING", weight: 0.25 },
  { channel: "ATM", weight: 0.1 },
  { channel: "BRANCH", weight: 0.05 },
  { channel: "POS", weight: 0.05 },
  { channel: "API", weight: 0.05 },
];

/**
 * Pick a weighted random item from an array of { value, weight } objects.
 */
function weightedPick(items, valueKey = "type") {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let random = Math.random() * total;
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item[valueKey] || item.type;
  }
  return items[0][valueKey] || items[0].type;
}

/**
 * Generate a realistic normal transaction.
 */
function generateNormalTransaction(accounts) {
  const sender = randomPick(accounts);
  let receiver = randomPick(accounts);
  let retries = 0;
  while (receiver.id === sender.id && retries < 100) {
    receiver = randomPick(accounts);
    retries++;
  }
  if (receiver.id === sender.id) {
    throw new Error("Cannot generate transaction — insufficient unique accounts");
  }

  const type = weightedPick(TXN_TYPE_WEIGHTS);
  const channel = weightedPick(CHANNEL_WEIGHTS, "channel");

  // Realistic amounts by transaction type
  const amountRanges = {
    UPI: [100, 25000],
    NEFT: [1000, 200000],
    IMPS: [500, 50000],
    RTGS: [200000, 5000000],
    CASH_DEPOSIT: [1000, 100000],
    CASH_WITHDRAWAL: [500, 50000],
  };

  const [min, max] = amountRanges[type] || [100, 50000];
  const amount = randomAmount(min, max);

  return {
    transactionId: generateTransactionId(),
    amount,
    type,
    channel,
    senderAccountId: sender.id,
    receiverAccountId: receiver.id,
    _senderAccount: sender,       // Pre-attach for fast-path
    _receiverAccount: receiver,   // Pre-attach for fast-path
    upiVpaSender: type === "UPI" ? `user${Math.floor(Math.random() * 1000)}@${randomPick(["oksbi", "ybl", "paytm", "okaxis"])}` : null,
    upiVpaReceiver: type === "UPI" ? `merchant${Math.floor(Math.random() * 500)}@${randomPick(["oksbi", "ybl", "paytm", "ibl"])}` : null,
    vpaAgeDays: type === "UPI" ? Math.floor(Math.random() * 365) + 10 : null,
    location: randomPick(["Mumbai", "Delhi", "Bangalore", "Chennai", "Kolkata", "Hyderabad", "Pune", "Ahmedabad"]),
    timestamp: new Date(),
  };
}

/**
 * Generate a fraudulent transaction pattern.
 */
function generateFraudTransaction(accounts) {
  const base = generateNormalTransaction(accounts);
  const fraudPattern = randomPick(["high_value", "structuring", "rapid_fire", "new_account_large", "mule_transfer"]);

  switch (fraudPattern) {
    case "high_value":
      base.amount = randomAmount(500000, 2000000);
      base.description = randomPick(["Investment returns", "Forex profit", "Business settlement", "Loan processing fee"]);
      break;

    case "structuring":
      base.amount = randomAmount(45000, 49999);
      base.type = "UPI";
      base.description = randomPick(["Monthly rent", "Prize money transfer", "Urgent help needed"]);
      break;

    case "rapid_fire":
      base.amount = randomAmount(5000, 15000);
      base.description = randomPick(["Game recharge", "Advance for job", "OTP charges refund", "KYC update"]);
      break;

    case "new_account_large":
      base.amount = randomAmount(100000, 500000);
      base.type = "NEFT";
      base.description = randomPick(["Property advance", "Lottery award money", "Forex return"]);
      break;

    case "mule_transfer":
      base.amount = randomAmount(20000, 80000);
      base.type = "IMPS";
      base.description = randomPick(["Salary", "Refund", "Wallet transfer", "Urgent medical"]);
      break;
  }

  // Use unusual hour for fraud
  const fraudTimestamp = new Date();
  fraudTimestamp.setHours(Math.floor(Math.random() * 4) + 1); // 1-4 AM
  base.timestamp = fraudTimestamp;

  return base;
}

/**
 * Start a simulation run with bounded concurrency.
 *
 * Strategy for speed:
 *   - 3 parallel workers process transactions concurrently
 *   - Pre-fetched accounts are passed to processTransaction (skip 2 DB queries/txn)
 *   - Account risk score updates are deferred to a batch at end (skip 4 queries/txn)
 *   - LLM analysis is skipped during simulation (skip 5-20s Gemini wait/txn)
 *   - Independent DB writes inside processTransaction are parallelised
 *
 * Net effect: ~4 DB queries per txn (down from 12+) × 3 parallel = ~3x faster.
 *
 * @param {Object} simulationConfig - { rate, count, fraudRatio }
 * @param {string} userId - User who started simulation
 */
async function startSimulation(simulationConfig = {}, userId = null) {
  if (activeSimulation) {
    throw new Error("A simulation is already running. Stop it first.");
  }

  const count = simulationConfig.count || 50;
  const fraudRatio = simulationConfig.fraudRatio || 0.08;

  // Get all accounts for simulation (pre-fetch once, reuse for all txns)
  const accounts = await prisma.account.findMany({ take: 100 });
  if (accounts.length < 2) {
    throw new Error("Need at least 2 accounts in the database to run simulation. Run seed first.");
  }

  // Build a lookup map for O(1) account resolution by ID
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  // Create simulation run record
  const simulationRun = await prisma.simulationRun.create({
    data: {
      status: "RUNNING",
      totalTransactions: count,
      config: { count, fraudRatio, concurrency: CONCURRENCY },
      startedAt: new Date(),
    },
  });

  activeSimulation = {
    id: simulationRun.id,
    config: { count, fraudRatio },
    dispatched: 0,
    processed: 0,
    fraudCount: 0,
    alertCount: 0,
    accounts,
    accountMap,
    userId,
    touchedAccountIds: new Set(), // Track for batch risk update at end
    consecutiveFailures: 0,
    inFlight: 0,
    _resolve: null, // Set by the returned promise
  };

  logger.info(`Simulation started: ${simulationRun.id} | Count: ${count} | Fraud: ${(fraudRatio * 100).toFixed(0)}% | Workers: ${CONCURRENCY}`);

  // Return the simulation run immediately; processing happens in background.
  // The completion promise is internal — we resolve it when all txns finish.
  const completionPromise = new Promise((resolve) => {
    activeSimulation._resolve = resolve;
  });

  // Kick off the worker pool
  schedule();

  // Don't block the API — return immediately
  return simulationRun;
}

/**
 * Central scheduler — fills up to CONCURRENCY slots.
 * Called every time a slot frees up.
 */
function schedule() {
  const sim = activeSimulation;
  if (!sim) return;

  const MAX_CONSECUTIVE_FAILURES = 5;
  const { count } = sim.config;
  const { fraudRatio } = sim.config;

  // Fill available concurrency slots
  while (sim.inFlight < CONCURRENCY && sim.dispatched < count && activeSimulation) {
    sim.dispatched++;
    sim.inFlight++;

    const txnIndex = sim.dispatched; // Capture for logging
    const isFraud = Math.random() < fraudRatio;
    const txnData = isFraud
      ? generateFraudTransaction(sim.accounts)
      : generateNormalTransaction(sim.accounts);

    // Track touched accounts for batch risk update at end
    sim.touchedAccountIds.add(txnData.senderAccountId);
    sim.touchedAccountIds.add(txnData.receiverAccountId);

    // Process in background — don't await
    processOneTick(sim, txnData, txnIndex, count, MAX_CONSECUTIVE_FAILURES);
  }

  // Check if all done
  if (sim.dispatched >= count && sim.inFlight === 0 && activeSimulation) {
    finishSimulation();
  }
}

/**
 * Process a single simulation tick (one transaction).
 * Runs as a "fire and forget" from schedule(), calling schedule() again when done.
 */
async function processOneTick(sim, txnData, txnIndex, count, maxFailures) {
  try {
    // Pass pre-fetched accounts + skip expensive per-txn operations
    const result = await processTransaction(txnData, sim.userId, {
      senderAccount: sim.accountMap.get(txnData.senderAccountId),
      receiverAccount: sim.accountMap.get(txnData.receiverAccountId),
      skipLLM: true,                // Skip Gemini during simulation
    });

    // Guard: simulation may have been stopped while we were processing
    if (!activeSimulation) return;

    sim.consecutiveFailures = 0;
    sim.processed++;
    if (result.mlResult.isFraud) sim.fraudCount++;
    if (result.alert) sim.alertCount++;

    // Emit progress
    if (io) {
      io.emit(SOCKET_EVENTS.SIMULATION_PROGRESS, {
        simulationId: sim.id,
        processed: sim.processed,
        total: count,
        fraudCount: sim.fraudCount,
        alertCount: sim.alertCount,
        percentage: Math.round((sim.processed / count) * 100),
        latestTransaction: {
          id: result.transaction.id,
          amount: result.transaction.amount,
          fraudScore: result.mlResult.fraudScore,
          isFraud: result.mlResult.isFraud,
        },
      });
    }
  } catch (error) {
    if (!activeSimulation) return;

    sim.consecutiveFailures++;
    logger.error(`Simulation txn #${txnIndex} failed (${sim.consecutiveFailures}/${maxFailures})`, {
      error: error.message,
    });

    if (sim.consecutiveFailures >= maxFailures) {
      logger.error("Too many consecutive failures — stopping simulation");
      await stopSimulation();
      return;
    }
  } finally {
    if (activeSimulation) {
      sim.inFlight--;
      // Schedule more work now that a slot freed up
      schedule();
    }
  }
}

/**
 * Called when all dispatched transactions have completed.
 * Runs batch account risk updates, then finalises the simulation record.
 */
async function finishSimulation() {
  const sim = activeSimulation;
  if (!sim) return;

  // Null out first to prevent re-entrant calls
  activeSimulation = null;

  try {
    await prisma.simulationRun.update({
      where: { id: sim.id },
      data: {
        status: "COMPLETED",
        processedCount: sim.processed,
        fraudCount: sim.fraudCount,
        alertCount: sim.alertCount,
        completedAt: new Date(),
      },
    });

    logger.info(`Simulation completed: ${sim.id} | Processed: ${sim.processed} | Frauds: ${sim.fraudCount} | Alerts: ${sim.alertCount}`);

    if (io) {
      io.emit(SOCKET_EVENTS.SIMULATION_PROGRESS, {
        simulationId: sim.id,
        processed: sim.processed,
        total: sim.config.count,
        fraudCount: sim.fraudCount,
        alertCount: sim.alertCount,
        percentage: 100,
        completed: true,
      });
    }
  } catch (err) {
    logger.error("Failed to finalise simulation", { error: err.message });
  }

  if (sim._resolve) sim._resolve(sim);
}

/**
 * Stop the active simulation (manual stop).
 */
async function stopSimulation() {
  const sim = activeSimulation;
  if (!sim) return null;

  // Null out immediately to stop scheduler and in-flight tasks from scheduling more
  activeSimulation = null;

  try {
    await prisma.simulationRun.update({
      where: { id: sim.id },
      data: {
        status: "COMPLETED",
        processedCount: sim.processed,
        fraudCount: sim.fraudCount,
        alertCount: sim.alertCount,
        completedAt: new Date(),
      },
    });

    logger.info(`Simulation stopped: ${sim.id} | Processed: ${sim.processed}/${sim.config.count} | Frauds: ${sim.fraudCount}`);
  } catch (err) {
    logger.error("Failed to update simulation run on stop", { error: err.message });
  }

  if (sim._resolve) sim._resolve(sim);
  return sim;
}

/**
 * Get active simulation status.
 */
function getSimulationStatus() {
  if (!activeSimulation) {
    return { active: false };
  }
  return {
    active: true,
    id: activeSimulation.id,
    processed: activeSimulation.processed,
    total: activeSimulation.config.count,
    fraudCount: activeSimulation.fraudCount,
    alertCount: activeSimulation.alertCount,
    percentage: Math.round((activeSimulation.processed / activeSimulation.config.count) * 100),
  };
}

module.exports = {
  startSimulation,
  stopSimulation,
  getSimulationStatus,
  setSocketIO,
};
