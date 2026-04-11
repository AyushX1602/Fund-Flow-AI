const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { authenticate } = require("../middleware/auth");

// ── Routes ──
router.get("/overview", authenticate, dashboardController.getOverview);
router.get("/fraud-trend", authenticate, dashboardController.getFraudTrend);
router.get("/risk-distribution", authenticate, dashboardController.getRiskDistribution);
router.get("/recent-alerts", authenticate, dashboardController.getRecentAlerts);
router.get("/top-risk-accounts", authenticate, dashboardController.getTopRiskAccounts);
router.get("/channel-breakdown", authenticate, dashboardController.getChannelBreakdown);
router.get("/mule-network", authenticate, dashboardController.getMuleNetwork);

module.exports = router;
