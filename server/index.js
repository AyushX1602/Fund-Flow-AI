const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");

dotenv.config();

const prisma = require("./prismaClient");

const config = require("./config");
const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");
const { generalLimiter } = require("./middleware/rateLimiter");
const { initializeSocket } = require("./socket");

// Import route modules
const authRoutes = require("./routes/auth");
const transactionRoutes = require("./routes/transactions");
const alertRoutes = require("./routes/alerts");
const investigationRoutes = require("./routes/investigations");
const accountRoutes = require("./routes/accounts");
const dashboardRoutes = require("./routes/dashboard");
const mlRoutes = require("./routes/ml");
const graphRoutes = require("./routes/graph");
const auditLogRoutes = require("./routes/auditLogs");

// Import services that need Socket.io injection
const transactionService = require("./services/transactionService");
const alertService = require("./services/alertService");
const simulationService = require("./services/simulationService");
const accountController = require("./controllers/accountController");
const graphController = require("./controllers/graphController");

// ─────────────────────────────────────────────
// App Setup
// ─────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: config.cors.origin,
    methods: ["GET", "POST"],
  },
});

// Inject Socket.io into services
transactionService.setSocketIO(io);
alertService.setSocketIO(io);
simulationService.setSocketIO(io);
accountController.setSocketIO(io);
graphController.setSocketIO(io);

// Initialize Socket.io handlers
initializeSocket(io);

// ─────────────────────────────────────────────
// Global Middleware
// ─────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(generalLimiter);

// HTTP request logging
app.use(
  morgan("short", {
    stream: { write: (msg) => logger.info(msg.trim()) },
  })
);

// ─────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  let dbStatus = "disconnected";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch {
    dbStatus = "disconnected";
  }

  res.json({
    success: true,
    message: "FundFlow AI server is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    services: {
      database: dbStatus,
      socketio: io.engine.clientsCount > 0 ? "active" : "idle",
    },
  });
});

// ─────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/investigations", investigationRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/ml", mlRoutes);
app.use("/api/graph", graphRoutes);
app.use("/api/audit-logs", auditLogRoutes);

// ─────────────────────────────────────────────
// 404 Handler
// ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ─────────────────────────────────────────────
// Global Error Handler (must be last)
// ─────────────────────────────────────────────
app.use(errorHandler);

// ─────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────
server.listen(config.port, async () => {
  logger.info(`🚀 FundFlow AI server running on http://localhost:${config.port}`);
  logger.info(`📡 Socket.io ready on ws://localhost:${config.port}`);
  logger.info(`📋 API docs: http://localhost:${config.port}/api/health`);
  if (config.demo.enabled) {
    logger.info("🎮 DEMO MODE is enabled — auth bypass active");
  }

  // Warm up Ollama (preload model into GPU VRAM so first Ask AI call is fast)
  try {
    const { warmupOllama } = require("./services/llmService");
    await warmupOllama();
  } catch (err) {
    logger.warn("Ollama warmup skipped:", err.message);
  }
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received. Shutting down gracefully...");
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

module.exports = { app, server, io };

// nodemon trigger
