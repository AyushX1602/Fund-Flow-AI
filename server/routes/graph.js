const express = require("express");
const router = express.Router();
const graphController = require("../controllers/graphController");
const { authenticate, authorize } = require("../middleware/auth");

// ── Routes ──
router.get("/fund-flow/:accountId", authenticate, graphController.getFundFlow);
router.get("/network/:accountId", authenticate, graphController.getNetwork);
router.get("/rings", authenticate, graphController.detectRings);
router.post("/freeze-simulate/:accountId", authenticate, authorize("SUPERVISOR", "ADMIN"), graphController.freezeSimulate);

module.exports = router;
