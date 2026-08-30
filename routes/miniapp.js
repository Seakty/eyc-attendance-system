const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendanceController");
const requireAuth = require("../middleware/requireAuth");

// POST /api/attendance/check-location
router.post("/check-location", requireAuth, attendanceController.checkLocation);
// POST /api/attendance/check-in
router.post("/check-in", requireAuth, attendanceController.checkIn);
// POST /api/attendance/check-out
router.post("/check-out", requireAuth, attendanceController.checkOut);
// POST /api/attendance/scan
router.post("/scan", requireAuth, attendanceController.scanAttendance);
// GET /api/attendance/test-geofence
router.get("/test-geofence", attendanceController.testGeofence);
// GET /api/attendance/my-history
router.get("/my-history", requireAuth, attendanceController.getMyHistory);

module.exports = router;
