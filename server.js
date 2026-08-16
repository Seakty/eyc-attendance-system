const express = require("express");
require("dotenv").config();

// Import database and utilities
const db = require("./config/database");
const { isWithinGeofence } = require("./utils/geofence");
const miniappRoutes = require("./routes/miniapp");   // <-- ADD THIS

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/api/attendance", miniappRoutes);            // <-- ADD THIS

// Health-check route
app.get("/api/health", (req, res) => {
  res
    .status(200)
    .json({ status: "success", message: "EYC Attendance Server is running!" });
});

// Test Geofence Route
// Test Geofence Route (Updated for Database Schema)
app.get("/api/test-geofence", async (req, res) => {
  try {
    // 1. Fetch the Main Campus (ID 1) directly from the database
    const [rows] = await db.execute(
      "SELECT name, school_lat, school_lng, gps_radius_meters FROM campuses WHERE id = 1",
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({
          error: "Campus not found in database. Did you run the setup script?",
        });
    }

    const campus = rows[0];
    const schoolLat = parseFloat(campus.school_lat);
    const schoolLng = parseFloat(campus.school_lng);
    const radius = campus.gps_radius_meters;

    // 2. Simulated Teacher GPS (e.g., testing from a few meters away)
    const teacherLat = 11.5565;
    const teacherLng = 104.9283;

    // 3. Calculate the Haversine distance using the database parameters
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
      schoolLocation: { lat: schoolLat, lng: schoolLng },
      teacherLocation: { lat: teacherLat, lng: teacherLng },
      allowedRadiusMeters: radius,
      geofenceResult: result,
    });
  } catch (error) {
    console.error("Database query failed:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error while querying campuses table" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is live on port ${PORT}`);
});