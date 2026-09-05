const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendanceController");
const requireAuth = require("../middleware/requireAuth");

// POST /api/attendance/check-location
router.post("/check-location", attendanceController.checkLocation);
// POST /api/attendance/scan
router.post("/scan", requireAuth, attendanceController.scanAttendance);
// GET /api/attendance/test-geofence
router.get("/test-geofence", attendanceController.testGeofence);
// GET /api/attendance/today
router.get("/today", requireAuth, attendanceController.getTodayStatus);
// GET /api/attendance/my-history
router.get("/my-history", requireAuth, attendanceController.getMyHistory);

module.exports = router;
