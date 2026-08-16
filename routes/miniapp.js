const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendanceController");

// POST /api/attendance/check-location
router.post("/check-location", attendanceController.checkLocation);

module.exports = router;