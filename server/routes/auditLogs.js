const express = require("express");
const router = express.Router();
const auditLogController = require("../controllers/auditLogController");
const { authenticate, authorize } = require("../middleware/auth");

// ── Routes ──
router.get("/", authenticate, authorize("ADMIN"), auditLogController.list);
router.get("/entity/:entityId", authenticate, auditLogController.getByEntity);

module.exports = router;
