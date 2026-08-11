const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function initializeDatabase() {
  try {
    console.log("Connecting to MySQL Server...");

    // 1. Connect to MySQL without specifying a database name yet.
    // We MUST set multipleStatements: true to run the whole schema.sql file at once.
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      port: process.env.DB_PORT || 3306,
      multipleStatements: true,
    });

    // 2. Read the schema.sql file
    const schemaPath = path.join(__dirname, "schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");

    // 3. Execute the SQL commands
    console.log("Executing schema.sql...");
    await connection.query(schemaSql);

    console.log(
      "✅ Database and tables created successfully! You are ready to code.",
    );

    // Close the connection
    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to initialize database:", error.message);
    process.exit(1);
  }
}

initializeDatabase();
