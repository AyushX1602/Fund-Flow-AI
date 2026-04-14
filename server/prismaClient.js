const { PrismaClient } = require("./generated/prisma");

// Neon free-tier supports up to ~10 concurrent connections via pgbouncer.
// Pool of 10 with 30s timeout gives simulation headroom for 3 concurrent workers
// while leaving connections for API requests and dashboard queries.
const databaseUrl = process.env.DATABASE_URL || "";
const separator = databaseUrl.includes("?") ? "&" : "?";
const connectionUrl = databaseUrl.includes("connection_limit")
  ? databaseUrl
  : `${databaseUrl}${separator}connection_limit=10&pool_timeout=30&pgbouncer=true`;

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  datasources: {
    db: {
      url: connectionUrl,
    },
  },
});

// Graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
