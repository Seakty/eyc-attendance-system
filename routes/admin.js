const express = require("express");

const router = express.Router();

const {
  getAttendanceSummary,
  getTodayAttendance,
  exportAttendanceReport,
} = require("../controllers/adminController");

// Admin Dashboard APIs
router.get("/summary", getAttendanceSummary);
router.get("/today", getTodayAttendance);

// Admin Reports APIs
router.get("/reports/export", exportAttendanceReport);

module.exports = router;
