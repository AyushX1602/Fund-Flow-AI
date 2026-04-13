const { PrismaClient } = require("./generated/prisma");

// Neon free-tier has limited connection pool (5 max).
// We limit Prisma to 3 connections to avoid pool exhaustion.
const databaseUrl = process.env.DATABASE_URL || "";
const separator = databaseUrl.includes("?") ? "&" : "?";
const connectionUrl = databaseUrl.includes("connection_limit")
  ? databaseUrl
  : `${databaseUrl}${separator}connection_limit=3&pool_timeout=15&pgbouncer=true`;

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
