const express = require("express");
const router = express.Router();

const {
  getAttendanceSummary,
  getTodayAttendance,
  // Report export
  exportAttendanceReport,
  // Staff
  getStaffList,
  updateStaff,
  resetStaffPassword,
  deactivateStaff,
  activateStaff,
} = require("../controllers/adminController");

// Admin Dashboard APIs
router.get("/summary", getAttendanceSummary);
router.get("/today", getTodayAttendance);

// Admin Reports APIs
router.get("/reports/export", exportAttendanceReport);

// STAFF APIs
// Get all staff
router.get("/staff", getStaffList);
// Edit staff
router.put("/staff/:id", updateStaff);
// Reset staff password
router.post("/staff/:id/reset-password", resetStaffPassword);
// Deactivate staff
router.patch("/staff/:id/deactivate", deactivateStaff);
// Reactivate staff
router.patch("/staff/:id/activate", activateStaff);

module.exports = router;
