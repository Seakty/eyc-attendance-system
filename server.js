const express = require("express");
require("dotenv").config();

// Import database connection, utility functions, and API routes
const db = require("./config/database");
const { isWithinGeofence } = require("./utils/geofence");
const authRoutes = require("./routes/auth");

// Create the Express application
const app = express();

// Use the PORT from the .env file.
// If no PORT is provided, use port 3000.
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================

// Allow the server to receive and process JSON data from requests
app.use(express.json());

// Allow the server to receive form data from HTML forms
app.use(express.urlencoded({ extended: true }));

// Serve static files such as HTML, CSS, JavaScript, and images
// from the "public" folder
app.use(express.static("public"));

// ============================================================
// API ROUTES
// ============================================================

// All authentication-related routes are handled by authRoutes.
// For example:
// POST /api/auth/register
// POST /api/auth/login
app.use("/api/auth", authRoutes);

// ============================================================
// HEALTH CHECK
// ============================================================

// Simple route used to check whether the server is running correctly.
// This can also be useful for testing the API from a browser or Postman.
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "EYC Attendance Server is running!",
  });
});

// ============================================================
// TEST GEOFENCE ROUTE
// ============================================================

app.get("/api/test-geofence", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT name, school_lat, school_lng, gps_radius_meters FROM campuses WHERE id = 1",
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Campus not found in database. Did you run the setup script?",
      });
    }

    const campus = rows[0];
    const schoolLat = parseFloat(campus.school_lat);
    const schoolLng = parseFloat(campus.school_lng);
    const radius = campus.gps_radius_meters;

    const teacherLat = 11.5565;
    const teacherLng = 104.9283;

    const result = isWithinGeofence(
      teacherLat,
      teacherLng,
      schoolLat,
      schoolLng,
      radius,
    );

    res.json({
      status: "success",
      campusTested: campus.name,
      schoolLocation: {
        lat: schoolLat,
        lng: schoolLng,
      },
      teacherLocation: {
        lat: teacherLat,
        lng: teacherLng,
      },
      allowedRadiusMeters: radius,
      geofenceResult: result,
    });
  } catch (error) {
    console.error("Database query failed:", error);
    res.status(500).json({
      error: "Internal Server Error while querying campuses table",
    });
  }
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log(`Server is live on port ${PORT}`);
});
