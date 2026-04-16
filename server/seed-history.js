/**
 * seed-history.js — Insert 30 days of realistic transaction history
 * Creates ~600 transactions + ~40 alerts spread across the last 30 days
 * so dashboard charts (Fraud Trend, Risk Distribution, etc.) look populated.
 */
const prisma = require("./prismaClient");

const TYPES = ["UPI", "NEFT", "IMPS", "RTGS", "WIRE", "CASH_DEPOSIT"];
const CHANNELS = ["MOBILE_APP", "NET_BANKING", "ATM", "BRANCH", "API"];
const TYPE_WEIGHTS = [0.40, 0.20, 0.20, 0.05, 0.05, 0.10]; // UPI dominant
const CHANNEL_WEIGHTS = [0.45, 0.30, 0.08, 0.12, 0.05];

const CITIES = ["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad", "Kolkata", "Pune", "Ahmedabad"];
const DESCRIPTIONS = [
  "Salary credit", "Rent payment", "Online shopping", "Utility bill", "Investment transfer",
  "Loan EMI", "Insurance premium", "Mobile recharge", "Grocery purchase", "Restaurant payment",
  "Medical expense", "Education fee", "Travel booking", "Subscription renewal", "Gift transfer",
  "Business payment", "Freelance income", "Stock trade", "Mutual fund SIP", "Tax payment",
];

function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function randomBetween(min, max) { return Math.random() * (max - min) + min; }
function randomInt(min, max) { return Math.floor(randomBetween(min, max)); }
function randomItem(arr) { return arr[randomInt(0, arr.length)]; }

function generateTxnId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const rand = Array.from({ length: 8 }, () => chars[randomInt(0, chars.length)]).join("");
  return `TXN-${rand}-HIST`;
}

async function seedHistory() {
  // Get existing accounts
  const accounts = await prisma.account.findMany({ select: { id: true, accountHolder: true } });
  if (accounts.length < 2) {
    console.error("Need at least 2 accounts. Run 'node seed.js' first.");
    process.exit(1);
  }
  console.log(`Found ${accounts.length} accounts. Seeding 30 days of history...\n`);

  const now = new Date();
  const transactions = [];
  const alerts = [];

  for (let dayOffset = 30; dayOffset >= 1; dayOffset--) {
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);

    // Vary volume: weekdays 15-25 txns, weekends 8-14
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const dailyCount = isWeekend ? randomInt(8, 15) : randomInt(15, 26);

    // Fraud rate: random 3-8% per day, with occasional spikes
    const isSpike = Math.random() < 0.15; // 15% chance of a fraud spike day
    const fraudRate = isSpike ? randomBetween(0.10, 0.18) : randomBetween(0.03, 0.08);

    let dayFraud = 0;
    let dayTotal = 0;

    for (let t = 0; t < dailyCount; t++) {
      // Random time during the day
      const txnTime = new Date(date);
      txnTime.setHours(randomInt(6, 23), randomInt(0, 60), randomInt(0, 60));

      // Pick accounts
      const senderIdx = randomInt(0, accounts.length);
      let receiverIdx = randomInt(0, accounts.length);
      while (receiverIdx === senderIdx) receiverIdx = randomInt(0, accounts.length);

      const isFraud = Math.random() < fraudRate;
      const type = weightedRandom(TYPES, TYPE_WEIGHTS);
      const channel = weightedRandom(CHANNELS, CHANNEL_WEIGHTS);

      // Amount distribution: legit = ₹100-₹50K, fraud = ₹5K-₹5L
      const amount = isFraud
        ? Math.round(randomBetween(5000, 500000) * 100) / 100
        : Math.round(randomBetween(100, 50000) * 100) / 100;

      const fraudScore = isFraud
        ? randomBetween(0.65, 0.98)
        : randomBetween(0.01, 0.35);

      const txnId = generateTxnId();

      transactions.push({
        transactionId: txnId,
        amount,
        type,
        channel,
        senderAccountId: accounts[senderIdx].id,
        receiverAccountId: accounts[receiverIdx].id,
        fraudScore: Math.round(fraudScore * 10000) / 10000,
        isFraud,
        mlModelVersion: "xgboost-v1",
        location: randomItem(CITIES),
        description: randomItem(DESCRIPTIONS),
        timestamp: txnTime,
        createdAt: txnTime,
      });

      if (isFraud) dayFraud++;
      dayTotal++;

      // Create alert for high-score transactions
      if (fraudScore >= 0.55) {
        const statuses = ["NEW", "REVIEWING", "ESCALATED", "RESOLVED_FRAUD", "RESOLVED_LEGITIMATE"];
        // Older alerts more likely to be resolved
        const statusWeights = dayOffset > 14
          ? [0.05, 0.1, 0.1, 0.5, 0.25]  // old: mostly closed
          : dayOffset > 5
            ? [0.15, 0.2, 0.3, 0.2, 0.15] // mid: mixed
            : [0.4, 0.3, 0.2, 0.05, 0.05]; // recent: mostly open

        const status = weightedRandom(statuses, statusWeights);

        alerts.push({
          transactionId: txnId, // will be linked after insert
          severity: fraudScore >= 0.8 ? "CRITICAL" : fraudScore >= 0.6 ? "HIGH" : "MEDIUM",
          status,
          source: "ML_MODEL",
          description: `Fraud alert for ${type} transaction of ₹${amount.toLocaleString("en-IN")} (Score: ${fraudScore.toFixed(4)})`,
          effectiveScore: fraudScore,
          riskLayers: { ml: fraudScore, velocity: randomBetween(0.1, 0.8), behavioral: randomBetween(0.1, 0.6) },
          compositeScore: fraudScore * 0.85,
          dominantLayer: "ml",
          createdAt: txnTime,
          updatedAt: txnTime,
        });
      }
    }

    const label = isSpike ? "🔴 SPIKE" : "    ";
    console.log(`  Day -${String(dayOffset).padStart(2)}: ${dayTotal} txns, ${dayFraud} fraud (${(dayFraud/dayTotal*100).toFixed(0)}%) ${label}`);
  }

  // Insert transactions in batches
  console.log(`\nInserting ${transactions.length} transactions...`);
  const batchSize = 50;
  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    await prisma.transaction.createMany({ data: batch, skipDuplicates: true });
  }
  console.log("✅ Transactions inserted");

  // Now insert alerts (need to look up transaction IDs)
  console.log(`Inserting ${alerts.length} alerts...`);
  for (const alertData of alerts) {
    const txn = await prisma.transaction.findUnique({
      where: { transactionId: alertData.transactionId },
      select: { id: true },
    });
    if (!txn) continue;

    try {
      const alertType = alertData.effectiveScore >= 0.8 ? "FRAUD_DETECTED"
        : alertData.effectiveScore >= 0.6 ? "SUSPICIOUS_PATTERN" : "HIGH_VALUE";
      await prisma.alert.create({
        data: {
          transactionId: txn.id,
          alertType,
          severity: alertData.severity,
          status: alertData.status,
          description: alertData.description,
          riskScore: alertData.effectiveScore,
          createdAt: alertData.createdAt,
        },
      });
    } catch (e) {
      // Skip duplicate alert for same transaction
    }
  }
  console.log("✅ Alerts inserted");

  // Summary
  const totalTxns = await prisma.transaction.count();
  const totalFraud = await prisma.transaction.count({ where: { isFraud: true } });
  const totalAlerts = await prisma.alert.count();
  console.log(`\n🎉 Done! Database now has:`);
  console.log(`   ${totalTxns} transactions (${totalFraud} fraud)`);
  console.log(`   ${totalAlerts} alerts`);

  await prisma.$disconnect();
}

seedHistory().catch((e) => { console.error(e); process.exit(1); });
