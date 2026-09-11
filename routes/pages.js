const express = require("express");

const router = express.Router();

const db = require("../config/database");

const QRCode = require("qrcode");

// ============================================================
// LOGIN PAGE
// ============================================================

router.get("/login", (req, res) => {
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

router.get("/admin/dashboard", (req, res) => {
  res.render("admin/dashboard");
});

// ============================================================
// ADMIN CAMPUS SETTINGS PAGE
// ============================================================

router.get("/admin/settings", (req, res) => {
  const settings = {
    late_cutoff_time: "08:00",
    school_lat: 11.5564,
    school_lng: 104.9282,
    gps_radius_meters: 50,
  };

  res.render("admin/settings", { settings });
});

// ============================================================
// HANDLE CAMPUS SETTINGS FORM SUBMISSION
// ============================================================

router.post("/admin/settings", async (req, res) => {
  try {
    const { late_cutoff_time, school_lat, school_lng, gps_radius_meters } = req.body;

    // Create payload string for the QR code
    const qrData = JSON.stringify({
      lat: school_lat,
      lng: school_lng,
      radius: gps_radius_meters,
      cutoff: late_cutoff_time
    });

    // Generate Data URL for the QR code image
    const qrCodeUrl = await QRCode.toDataURL(qrData);

    const settings = {
      late_cutoff_time,
      school_lat,
      school_lng,
      gps_radius_meters
    };

    // Render the page with the submitted settings & new QR code
    res.render("admin/settings", { settings, qrCodeUrl });
  } catch (error) {
    console.error("Failed to generate QR code:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
