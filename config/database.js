const mysql = require("mysql2/promise");
require("dotenv").config();

// Create a connection pool to handle multiple simultaneous user requests
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "eyc_attendance",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test the database connection on server initialization
(async () => {
  try {
    const connection = await db.getConnection();
    console.log("Successfully connected to MySQL Database!");
    connection.release();
  } catch (error) {
    console.error("Database connection failed:", error.message);
  }
})();

module.exports = db;
