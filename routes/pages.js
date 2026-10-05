

const express = require("express");

const router = express.Router();

const db = require("../config/database");

const adminController = require("../controllers/adminController");
const { requireAdminPage } = require("../middleware/requireAdmin");

// ============================================================
// LOGIN PAGE
// ============================================================

router.get("/login", (req, res) => {
  // Already logged in as admin? Skip the form and go to the dashboard.
  if (req.session && req.session.user && req.session.user.role === "admin") {
    return res.redirect("/admin/dashboard");
  }

  res.render("login");
});

// ============================================================
// REGISTER PAGE
// ============================================================

router.get("/register", async (req, res) => {
  try {
    const [campuses] = await db.execute("SELECT id, name FROM campuses");

    res.render("register", {
      campuses: campuses,
    });
  } catch (error) {
    console.error("Failed to load campuses:", error);

    res.status(500).send("Internal Server Error");
  }
});

// ============================================================
// ADMIN DASHBOARD
// ============================================================

router.get("/admin/dashboard", requireAdminPage, (req, res) => {
  res.render("admin/dashboard", { user: req.session.user });
});

// ============================================================
// ADMIN CAMPUS SETTINGS
// ============================================================
router.get("/admin/settings", requireAdminPage, adminController.getSettings);
router.post(
  "/admin/settings",
  requireAdminPage,
  adminController.updateSettings,
);

// ============================================================
// ADMIN STAFF MANAGEMENT
// ============================================================
router.get("/admin/staff.ejs",/* requireAuth, */ adminController.getStaffList);
router.put("/admin/staff/:id", /* requireAuth, */ adminController.updateStaff);
router.delete("/admin/staff/:id", /* requireAuth, */ adminController.deactivateStaff);
router.post("/admin/staff/:id/activate", /* requireAuth, */ adminController.activateStaff);
router.post("/admin/staff/:id/reset-password", /* requireAuth, */ adminController.resetStaffPassword);
router.get("/admin/staff", (req, res) => {
  res.render("admin/staff");
});
module.exports = router;
