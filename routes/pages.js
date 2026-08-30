const express = require("express");
const router = express.Router();
const db = require("../config/database");

// Load Login Page
router.get("/login", (req, res) => {
  res.render("login");
});

// Load Register Page
router.get("/register", async (req, res) => {
  try {
    const [campuses] = await db.execute("SELECT id, name FROM campuses");
    res.render("register", { campuses: campuses });
  } catch (error) {
    console.error("Failed to load campuses:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Load Admin Dashboard Page
router.get("/dashboard", (req, res) => {
  res.render("dashboard");
});

// Load Staff Page
router.get("/staff", (req, res) => {
  res.render("staff");
});

// Load Reports Page
router.get("/reports", (req, res) => {
  res.render("reports");
});

module.exports = router;
