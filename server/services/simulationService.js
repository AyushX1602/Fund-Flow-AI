const prisma = require("../prismaClient");
const { processTransaction } = require("./transactionService");
const { generateTransactionId } = require("../utils/helpers");
const { randomAmount, randomPick } = require("../utils/helpers");
const { INDIAN_BANKS, INDIAN_PSPS, SOCKET_EVENTS } = require("../utils/constants");
const logger = require("../utils/logger");

// Active simulation state
let activeSimulation = null;
let simulationTimer = null;
let io = null;

function setSocketIO(socketIO) {
  io = socketIO;
}

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
  while (receiver.id === sender.id) {
    receiver = randomPick(accounts);
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
      // Amount just under reporting threshold
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
 * Start a simulation run.
 * @param {Object} simulationConfig - { rate, count, fraudRatio }
 * @param {string} userId - User who started simulation
 */
async function startSimulation(simulationConfig = {}, userId = null) {
  if (activeSimulation) {
    throw new Error("A simulation is already running. Stop it first.");
  }

  const rate = simulationConfig.rate || 2; // txns per second
  const count = simulationConfig.count || 50;
  const fraudRatio = simulationConfig.fraudRatio || 0.08;

  // Get all accounts for simulation
  const accounts = await prisma.account.findMany({ take: 100 });
  if (accounts.length < 2) {
    throw new Error("Need at least 2 accounts in the database to run simulation. Run seed first.");
  }

  // Create simulation run record
  const simulationRun = await prisma.simulationRun.create({
    data: {
      status: "RUNNING",
      totalTransactions: count,
      config: { rate, count, fraudRatio },
      startedAt: new Date(),
    },
  });

  activeSimulation = {
    id: simulationRun.id,
    config: { rate, count, fraudRatio },
    processed: 0,
    fraudCount: 0,
    alertCount: 0,
    accounts,
  };

  logger.info(`Simulation started: ${simulationRun.id} | Rate: ${rate}/s | Count: ${count} | Fraud: ${fraudRatio * 100}%`);

  // Process transactions at specified rate
  const interval = 1000 / rate;
  simulationTimer = setInterval(async () => {
    // Guard against race condition — simulation may have been stopped
    const sim = activeSimulation;
    if (!sim || sim.processed >= count) {
      if (activeSimulation) await stopSimulation();
      return;
    }

    try {
      const isFraud = Math.random() < fraudRatio;
      const txnData = isFraud
        ? generateFraudTransaction(accounts)
        : generateNormalTransaction(accounts);

      const result = await processTransaction(txnData, userId);

      // Re-check after async operation — simulation may have been stopped
      if (!activeSimulation) return;

      activeSimulation.processed++;
      if (result.mlResult.isFraud) activeSimulation.fraudCount++;
      if (result.alert) activeSimulation.alertCount++;

      // Emit progress
      if (io && activeSimulation) {
        io.emit(SOCKET_EVENTS.SIMULATION_PROGRESS, {
          simulationId: activeSimulation.id,
          processed: activeSimulation.processed,
          total: count,
          fraudCount: activeSimulation.fraudCount,
          alertCount: activeSimulation.alertCount,
          percentage: Math.round((activeSimulation.processed / count) * 100),
          latestTransaction: {
            id: result.transaction.id,
            amount: result.transaction.amount,
            fraudScore: result.mlResult.fraudScore,
            isFraud: result.mlResult.isFraud,
          },
        });
      }
    } catch (error) {
      if (activeSimulation) {
        logger.error("Simulation transaction failed", { error: error.message });
      }
    }
  }, interval);

  return simulationRun;
}

/**
 * Stop the active simulation.
 */
async function stopSimulation() {
  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }

  if (activeSimulation) {
    await prisma.simulationRun.update({
      where: { id: activeSimulation.id },
      data: {
        status: "COMPLETED",
        processedCount: activeSimulation.processed,
        fraudCount: activeSimulation.fraudCount,
        alertCount: activeSimulation.alertCount,
        completedAt: new Date(),
      },
    });

    logger.info(`Simulation completed: ${activeSimulation.id} | Processed: ${activeSimulation.processed} | Frauds: ${activeSimulation.fraudCount} | Alerts: ${activeSimulation.alertCount}`);

    const result = { ...activeSimulation };
    activeSimulation = null;
    return result;
  }

  return null;
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
