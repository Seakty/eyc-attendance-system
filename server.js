const express = require("express");
require("dotenv").config();

// Import API and View routes
const authRoutes = require("./routes/auth");
const pageRoutes = require("./routes/pages");
const miniappRoutes = require("./routes/miniapp");
const adminRoutes = require("./routes/admin");

// Create the Express application
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// EJS View Engine (Keeps your frontend working!)
app.set("view engine", "ejs");

// ============================================================
// ROUTES
// ============================================================
// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/attendance", miniappRoutes);

// View Routes (Returns HTML/EJS)
app.use("/admin", adminRoutes);
app.use("/", pageRoutes);

// ============================================================
// HEALTH CHECK
// ============================================================
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
