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

const { requireAdminApi } = require("../middleware/requireAdmin");

// Every route in this file is for admins only
router.use(requireAdminApi);

// Admin Dashboard APIs
router.get("/summary", getAttendanceSummary);
router.get("/today", getTodayAttendance);

// Admin Reports APIs
// GET /api/admin/reports/export[?month=YYYY-MM]  (ADM-04 + optional ADM-05 month filter)
// The Reports & Analytics PAGE lives at /admin/reports in routes/pages.js,
// because this router is mounted under /api/admin and guards with requireAdminApi.
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
