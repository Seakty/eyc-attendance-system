const express = require("express");

const router = express.Router();

const {
  getAttendanceSummary,
  getTodayAttendance,
} = require("../controllers/adminController");

const { requireAdminApi } = require("../middleware/requireAdmin");

// Every route in this file is for admins only
router.use(requireAdminApi);

// Admin Dashboard APIs

router.get("/summary", getAttendanceSummary);

router.get("/today", getTodayAttendance);

module.exports = router;
