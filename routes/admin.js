const express = require("express");
const router = express.Router();

const {
  getAttendanceSummary,
  getTodayAttendance,
  getSettings,
  updateSettings,
} = require("../controllers/adminController");

// Admin Dashboard API Routes
router.get("/summary", getAttendanceSummary);
router.get("/today", getTodayAttendance);

// Campus Settings Page Routes
router.get("/settings", getSettings);
router.post("/settings", updateSettings);

module.exports = router;