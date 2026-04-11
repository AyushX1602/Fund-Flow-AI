const dotenv = require("dotenv");
dotenv.config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,
  databaseUrl: process.env.DATABASE_URL,

  jwt: {
    secret: process.env.JWT_SECRET || "fundflow-ai-dev-secret-change-in-production",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },

  // FastAPI ML service URL — set when ML service is deployed
  mlService: {
    url: process.env.ML_SERVICE_URL || "http://localhost:8000",
    timeout: parseInt(process.env.ML_SERVICE_TIMEOUT, 10) || 5000,
    apiKey: process.env.ML_SERVICE_API_KEY || "",
  },

  // Demo mode — bypasses auth for hackathon demo
  demo: {
    enabled: process.env.DEMO_MODE === "true",
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // requests per window
  },

  // Risk thresholds (defaults, also configurable via DB)
  riskThresholds: {
    low: { min: 0, max: 0.3 },
    medium: { min: 0.3, max: 0.6 },
    high: { min: 0.6, max: 0.8 },
    critical: { min: 0.8, max: 1.0 },
  },

  // Alert auto-creation threshold
  alertThreshold: parseFloat(process.env.ALERT_THRESHOLD) || 0.6,

  // Simulation defaults
  simulation: {
    defaultRate: 2, // transactions per second
    defaultCount: 50, // total transactions per run
    fraudRatio: 0.08, // 8% fraud injection rate
  },

  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  },
};
