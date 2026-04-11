/**
 * Database seed script.
 * Creates demo user, sample accounts, and risk thresholds.
 *
 * Run: node seed.js
 */
const prisma = require("./prismaClient");
const bcrypt = require("bcryptjs");

const INDIAN_BANKS = [
  "State Bank of India", "Punjab National Bank", "Bank of Baroda",
  "Canara Bank", "Union Bank of India", "Bank of India",
  "Indian Bank", "Central Bank of India", "HDFC Bank",
  "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank",
];

async function main() {
  console.log("🌱 Seeding database...\n");

  // ── 1. Create demo admin user ──
  const hashedPassword = await bcrypt.hash("admin123", 12);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@fundflow.ai" },
    update: {},
    create: {
      id: "demo-admin-001",
      email: "admin@fundflow.ai",
      password: hashedPassword,
      name: "Demo Admin",
      role: "ADMIN",
    },
  });
  console.log(`✅ Admin user: ${adminUser.email}`);

  // Create analyst + supervisor
  const analyst = await prisma.user.upsert({
    where: { email: "analyst@fundflow.ai" },
    update: {},
    create: {
      email: "analyst@fundflow.ai",
      password: hashedPassword,
      name: "Rahul Sharma",
      role: "ANALYST",
    },
  });
  console.log(`✅ Analyst user: ${analyst.email}`);

  const supervisor = await prisma.user.upsert({
    where: { email: "supervisor@fundflow.ai" },
    update: {},
    create: {
      email: "supervisor@fundflow.ai",
      password: hashedPassword,
      name: "Priya Patel",
      role: "SUPERVISOR",
    },
  });
  console.log(`✅ Supervisor user: ${supervisor.email}`);

  // ── 2. Create sample bank accounts ──
  const accountData = [
    { accountNumber: "SBI001234567890", accountHolder: "Rajesh Kumar", bankName: "State Bank of India", ifscCode: "SBIN0001234", accountType: "SAVINGS", balance: 250000, kycType: "FULL_KYC", aadhaarLinked: true, panLinked: true, vpa: "rajesh.kumar@oksbi" },
    { accountNumber: "PNB009876543210", accountHolder: "Amit Singh", bankName: "Punjab National Bank", ifscCode: "PUNB0098765", accountType: "CURRENT", balance: 1500000, kycType: "FULL_KYC", aadhaarLinked: true, panLinked: true, vpa: "amit.singh@pnb" },
    { accountNumber: "BOB005678901234", accountHolder: "Sunita Devi", bankName: "Bank of Baroda", ifscCode: "BARB0056789", accountType: "SAVINGS", balance: 85000, kycType: "OTP_BASED", aadhaarLinked: true, panLinked: false, vpa: "sunita@bob" },
    { accountNumber: "CAN002345678901", accountHolder: "Vikram Rathore", bankName: "Canara Bank", ifscCode: "CNRB0023456", accountType: "SAVINGS", balance: 45000, kycType: "MIN_KYC", aadhaarLinked: false, panLinked: false, vpa: "vikram@ybl" },
    { accountNumber: "UBI003456789012", accountHolder: "Neha Gupta", bankName: "Union Bank of India", ifscCode: "UBIN0034567", accountType: "SALARY", balance: 320000, kycType: "FULL_KYC", aadhaarLinked: true, panLinked: true, vpa: "neha.gupta@ubi" },
    { accountNumber: "BOI004567890123", accountHolder: "Mohammed Irfan", bankName: "Bank of India", ifscCode: "BKID0045678", accountType: "SAVINGS", balance: 120000, kycType: "FULL_KYC", aadhaarLinked: true, panLinked: true, vpa: "irfan@boi" },
    { accountNumber: "IND005678901234", accountHolder: "Kavitha Nair", bankName: "Indian Bank", ifscCode: "IDIB0056789", accountType: "SAVINGS", balance: 67000, kycType: "OTP_BASED", aadhaarLinked: true, panLinked: false, vpa: "kavitha@indianbank" },
    { accountNumber: "CBI006789012345", accountHolder: "Deepak Joshi", bankName: "Central Bank of India", ifscCode: "CBIN0067890", accountType: "CURRENT", balance: 890000, kycType: "FULL_KYC", aadhaarLinked: true, panLinked: true, vpa: "deepak.joshi@cbi" },
    { accountNumber: "HDFC007890123456", accountHolder: "Ananya Sharma", bankName: "HDFC Bank", ifscCode: "HDFC0078901", accountType: "SAVINGS", balance: 550000, kycType: "FULL_KYC", aadhaarLinked: true, panLinked: true, vpa: "ananya@okhdfcbank" },
    { accountNumber: "ICICI008901234567", accountHolder: "Ravi Teja", bankName: "ICICI Bank", ifscCode: "ICIC0089012", accountType: "SAVINGS", balance: 180000, kycType: "FULL_KYC", aadhaarLinked: true, panLinked: true, vpa: "ravi.teja@okicici" },
    { accountNumber: "AXIS009012345678", accountHolder: "Pooja Mehta", bankName: "Axis Bank", ifscCode: "UTIB0090123", accountType: "SALARY", balance: 420000, kycType: "FULL_KYC", aadhaarLinked: true, panLinked: true, vpa: "pooja@okaxis" },
    { accountNumber: "KMB010123456789", accountHolder: "Suresh Patel", bankName: "Kotak Mahindra Bank", ifscCode: "KKBK0101234", accountType: "SAVINGS", balance: 95000, kycType: "OTP_BASED", aadhaarLinked: true, panLinked: false, vpa: "suresh@kotak" },
    // Suspected mule accounts (low balance, new, weak KYC)
    { accountNumber: "SBI011234567890", accountHolder: "Unknown User 1", bankName: "State Bank of India", ifscCode: "SBIN0112345", accountType: "SAVINGS", balance: 500, kycType: "MIN_KYC", aadhaarLinked: false, panLinked: false, vpa: "user9911@ybl", muleScore: 0.6 },
    { accountNumber: "PNB012345678901", accountHolder: "Unknown User 2", bankName: "Punjab National Bank", ifscCode: "PUNB0123456", accountType: "SAVINGS", balance: 1200, kycType: "MIN_KYC", aadhaarLinked: false, panLinked: false, vpa: "quick.pay88@paytm", muleScore: 0.7 },
    { accountNumber: "BOB013456789012", accountHolder: "Unknown User 3", bankName: "Bank of Baroda", ifscCode: "BARB0134567", accountType: "SAVINGS", balance: 300, kycType: "OTP_BASED", aadhaarLinked: false, panLinked: false, vpa: "fastmoney@ybl", muleScore: 0.55 },
  ];

  for (const acc of accountData) {
    await prisma.account.upsert({
      where: { accountNumber: acc.accountNumber },
      update: {},
      create: acc,
    });
  }
  console.log(`✅ ${accountData.length} accounts created`);

  // ── 3. Create risk thresholds ──
  const thresholds = [
    { name: "low", minScore: 0, maxScore: 0.3, severity: "LOW", autoAlert: false },
    { name: "medium", minScore: 0.3, maxScore: 0.6, severity: "MEDIUM", autoAlert: false },
    { name: "high", minScore: 0.6, maxScore: 0.8, severity: "HIGH", autoAlert: true },
    { name: "critical", minScore: 0.8, maxScore: 1.0, severity: "CRITICAL", autoAlert: true },
  ];

  for (const t of thresholds) {
    await prisma.riskThreshold.upsert({
      where: { name: t.name },
      update: {},
      create: t,
    });
  }
  console.log(`✅ ${thresholds.length} risk thresholds created`);

  // ── 4. Create model metadata (rule-based fallback) ──
  await prisma.modelMetadata.upsert({
    where: { modelName_version: { modelName: "rule-based-fallback", version: "v1" } },
    update: {},
    create: {
      modelName: "rule-based-fallback",
      version: "v1",
      isActive: true,
      metadata: {
        type: "heuristic",
        rulesCount: 12,
        description: "Rule-based scoring fallback for demo without ML service",
      },
    },
  });
  console.log("✅ Model metadata created");

  // ── 5. System config ──
  const configs = [
    { key: "alert_threshold", value: "0.6", description: "Minimum fraud score to auto-create alert" },
    { key: "simulation_default_rate", value: "2", description: "Default transactions per second" },
    { key: "simulation_default_count", value: "50", description: "Default total transactions per simulation" },
    { key: "ml_service_url", value: "http://localhost:8000", description: "FastAPI ML service URL" },
  ];

  for (const c of configs) {
    await prisma.systemConfig.upsert({
      where: { key: c.key },
      update: {},
      create: c,
    });
  }
  console.log(`✅ ${configs.length} system configs created`);

  console.log("\n🎉 Seeding complete!");
  console.log("\n📋 Demo credentials:");
  console.log("   Admin:      admin@fundflow.ai / admin123");
  console.log("   Analyst:    analyst@fundflow.ai / admin123");
  console.log("   Supervisor: supervisor@fundflow.ai / admin123");
  console.log("\n💡 Or use X-Demo-Mode: true header to bypass auth\n");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
