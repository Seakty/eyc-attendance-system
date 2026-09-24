//=============================>>> Old origin <<<<<<
// const express = require("express");

// const router = express.Router();

// const {
//   getAttendanceSummary,
//   getTodayAttendance,
// } = require("../controllers/adminController");

// // Admin Dashboard APIs

// router.get("/summary", getAttendanceSummary);

// router.get("/today", getTodayAttendance);


// module.exports = router;

//=============================>>> New origin just add more code and prevent from issue after editing <<<<<<
const express = require("express");
const router = express.Router();

const {
  getAttendanceSummary,
  getTodayAttendance,

  // Staff
  getStaffList,
  updateStaff,
  resetStaffPassword,
  deactivateStaff,
  activateStaff,
} = require("../controllers/adminController");

// ============================================================
// ADMIN DASHBOARD APIs
// ============================================================
router.get("/summary", getAttendanceSummary);
router.get("/today", getTodayAttendance);
// ============================================================
// STAFF APIs
// ============================================================
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