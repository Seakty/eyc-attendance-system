const express = require("express");

const router = express.Router();

const {
  getAttendanceSummary,
  getTodayAttendance,
  exportAttendanceReport
} = require("../controllers/adminController");

// Admin Dashboard APIs

router.get("/summary", getAttendanceSummary);

router.get("/reports/export", exportAttendanceReport);

router.get("/today", getTodayAttendance);

module.exports = router;
