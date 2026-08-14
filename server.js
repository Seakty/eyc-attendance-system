const express = require("express");
require("dotenv").config();

// Import database, utilities, and routes
const db = require("./config/database");
const { isWithinGeofence } = require("./utils/geofence");
const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running normally" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});