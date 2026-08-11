const express = require("express");
require("dotenv").config();

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

app.listen(PORT, () => {
  console.log(`Server is live on port ${PORT}`);
});
