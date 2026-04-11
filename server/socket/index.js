const logger = require("../utils/logger");

/**
 * Initialize Socket.io event handlers.
 * @param {import("socket.io").Server} io - Socket.io server instance
 */
function initializeSocket(io) {
  io.on("connection", (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Join rooms based on user role (for targeted events)
    socket.on("join:role", (role) => {
      socket.join(`role:${role}`);
      logger.debug(`Socket ${socket.id} joined role:${role}`);
    });

    // Join account-specific room (for account monitoring)
    socket.on("watch:account", (accountId) => {
      socket.join(`account:${accountId}`);
      logger.debug(`Socket ${socket.id} watching account:${accountId}`);
    });

    // Leave account-specific room
    socket.on("unwatch:account", (accountId) => {
      socket.leave(`account:${accountId}`);
    });

    // Join investigation room
    socket.on("watch:investigation", (investigationId) => {
      socket.join(`investigation:${investigationId}`);
    });

    socket.on("disconnect", (reason) => {
      logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  logger.info("Socket.io initialized");
}

module.exports = { initializeSocket };
