const express = require("express");

const router = express.Router();

const attendanceController = require("../controllers/attendanceController");

console.log("Attendance Controller:", attendanceController);

// POST /api/attendance/check-location
router.post("/check-location", attendanceController.checkLocation);

// GET /api/attendance/test-geofence
router.get("/test-geofence", attendanceController.testGeofence);

// GET /api/attendance/summary
router.get("/summary", attendanceController.getAttendanceSummary);

// GET /api/attendance/today
router.get("/today", attendanceController.getTodayAttendance);

module.exports = router;
