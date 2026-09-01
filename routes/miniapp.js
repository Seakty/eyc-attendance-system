const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendanceController");

// POST /api/attendance/check-location
router.post("/check-location", attendanceController.checkLocation);
// POST /api/attendance/scan
router.post("/scan", attendanceController.scanAttendance);
// GET /api/attendance/test-geofence
router.get("/test-geofence", attendanceController.testGeofence);

module.exports = router;
