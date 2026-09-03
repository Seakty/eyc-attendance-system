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
router.get("/admin/dashboard", (req, res) => {
  res.render("admin/dashboard");
});
module.exports = router;
