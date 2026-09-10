const express = require("express");

const router = express.Router();

const {
  getAttendanceSummary,
  getTodayAttendance,
} = require("../controllers/adminController");

// Admin Dashboard APIs

router.get("/summary", getAttendanceSummary);

router.get("/today", getTodayAttendance);

module.exports = router;
