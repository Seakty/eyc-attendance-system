const express = require("express");
require("dotenv").config();

// Import database connection, utility functions, and API routes
const db = require("./config/database");
const { isWithinGeofence } = require("./utils/geofence");
const authRoutes = require("./routes/auth");
const pageRoutes = require("./routes/pages");
const attendanceRoutes = require("./routes/attendance");

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

app.set("view engine", "ejs");

// ============================================================
// API ROUTES
// ============================================================

// All authentication-related routes are handled by authRoutes.
app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
// View Routes (Returns HTML/EJS)
app.use("/", pageRoutes);

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
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log(`Server is live on port ${PORT}`);
});
