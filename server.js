const express = require("express");
require("dotenv").config();

// Import database and utilities
const db = require("./config/database");
const { isWithinGeofence } = require("./utils/geofence");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Health-check route
app.get("/api/health", (req, res) => {
  res
    .status(200)
    .json({ status: "success", message: "EYC Attendance Server is running!" });
});

// Test Geofence Route
app.get("/api/test-geofence", (req, res) => {
  // School coordinates from .env
  const schoolLat = parseFloat(process.env.SCHOOL_LAT) || 11.5564;
  const schoolLng = parseFloat(process.env.SCHOOL_LNG) || 104.9282;

  // Simulated Teacher GPS (e.g., 20 meters away)
  const teacherLat = 11.5565;
  const teacherLng = 104.9283;

  const result = isWithinGeofence(
    teacherLat,
    teacherLng,
    schoolLat,
    schoolLng,
    50,
  );

  res.json({
    schoolLocation: { lat: schoolLat, lng: schoolLng },
    teacherLocation: { lat: teacherLat, lng: teacherLng },
    result: result,
  });
});

app.listen(PORT, () => {
  console.log(`Server is live on port ${PORT}`);
});
