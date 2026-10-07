#!/usr/bin/env node
/**
 * Idempotent migration runner.
 *
 * - Reads DB credentials from .env (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT)
 * - Creates the database if it does not exist yet
 * - Applies db/schema.sql as the baseline when the core tables are missing
 * - Applies every .sql file in db/migrations/ in numeric order, once only
 * - Records every applied file in the `schema_migrations` table
 * - Never fails on "already exists" errors (duplicate column/key/table),
 *   so it is safe to run `npm run db:setup` on any machine, any number of times.
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ROOT = path.join(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const BASELINE_SCHEMA = path.join(ROOT, "db", "schema.sql");

const DB_NAME = process.env.DB_NAME || "eyc_attendance";

const SERVER_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
};

// MySQL errors that simply mean "this object is already there".
const ALREADY_EXISTS_CODES = new Set([
  "ER_DUP_FIELDNAME", // 1060 duplicate column
  "ER_DUP_KEYNAME", // 1061 duplicate index/key
  "ER_TABLE_EXISTS_ERROR", // 1050 duplicate table
]);

// ============================================================
// SQL helpers
// ============================================================

/** Split a script into individual statements, ignoring ";" inside quotes/comments. */
function splitStatements(sql) {
  const statements = [];
  let current = "";
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // "-- comment" (MySQL requires whitespace/newline after --, we are lenient)
    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      current += "\n";
      continue;
    }

    // "# comment"
    if (ch === "#") {
      while (i < sql.length && sql[i] !== "\n") i++;
      current += "\n";
      continue;
    }

    // "/* block comment */"
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    // Quoted strings / identifiers: copy verbatim (handles '' "" `` escapes)
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      current += ch;
      i++;
      while (i < sql.length) {
        current += sql[i];
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            current += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function tableExists(conn, table) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [DB_NAME, table],
  );
  return Number(rows[0].total) > 0;
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_NAME, table, column],
  );
  return Number(rows[0].total) > 0;
}

/**
 * Make a SQL script safe to run through the runner:
 *  - drop `USE some_db;` / `CREATE DATABASE ...;` (we always connect to DB_NAME
 *    from .env, and a hardcoded database name would break other environments)
 *  - drop `ALTER TABLE ... ADD COLUMN x` when column x already exists
 */
async function prepareStatements(conn, statements) {
  const runnable = [];

  for (const stmt of statements) {
    if (/^(USE|CREATE\s+(DATABASE|SCHEMA))\b/i.test(stmt)) {
      console.log(
        "   - skipping database-selection statement (using DB from .env)",
      );
      continue;
    }

    const match = stmt.match(
      /^\s*ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+(?:COLUMN\s+)?`?(\w+)`?/i,
    );

    if (match) {
      const [, table, column] = match;
      if (await columnExists(conn, table, column)) {
        console.log(
          `   - column ${table}.${column} already exists, skipping ADD COLUMN`,
        );
        continue;
      }
    }

    runnable.push(stmt);
  }

  return runnable;
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.toLowerCase().endsWith(".sql"))
    .sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      const rankA = Number.isNaN(numA) ? Number.MAX_SAFE_INTEGER : numA;
      const rankB = Number.isNaN(numB) ? Number.MAX_SAFE_INTEGER : numB;
      return rankA - rankB || a.localeCompare(b);
    });
}

// ============================================================
// Main
// ============================================================

async function run() {
  console.log(`\n[migrate] target database: ${DB_NAME} @ ${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`);

  // 1. Make sure the database itself exists (connect without a schema first).
  const serverConn = await mysql.createConnection(SERVER_CONFIG);
  await serverConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await serverConn.end();

  // 2. Connection bound to the database, multi-statement enabled for .sql files.
  const conn = await mysql.createConnection({
    ...SERVER_CONFIG,
    database: DB_NAME,
    multipleStatements: true,
  });

  try {
    // 3. Tracking table
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id INT AUTO_INCREMENT PRIMARY KEY,
         filename VARCHAR(255) NOT NULL UNIQUE,
         executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`,
    );

    const [trackedRows] = await conn.execute(
      "SELECT filename FROM schema_migrations",
    );
    const tracked = new Set(trackedRows.map((row) => row.filename));

    // 4. Baseline schema: only for brand-new databases.
    const hasCoreTables =
      (await tableExists(conn, "teachers")) &&
      (await tableExists(conn, "campuses"));

    if (!hasCoreTables) {
      console.log("[migrate] core tables missing -> applying db/schema.sql baseline");
      const baselineSql = fs.readFileSync(BASELINE_SCHEMA, "utf8");
      // Strip hardcoded USE/CREATE DATABASE statements so the baseline lands in
      // the database named by DB_NAME, not in whatever schema.sql was written for.
      const baselineStatements = await prepareStatements(
        conn,
        splitStatements(baselineSql),
      );
      await conn.query(baselineStatements.join(";\n"));
      await conn.execute(
        "INSERT IGNORE INTO schema_migrations (filename) VALUES (?)",
        ["000-baseline-schema.sql"],
      );
      tracked.add("000-baseline-schema.sql");
    } else if (!tracked.has("000-baseline-schema.sql")) {
      await conn.execute(
        "INSERT IGNORE INTO schema_migrations (filename) VALUES (?)",
        ["000-baseline-schema.sql"],
      );
      tracked.add("000-baseline-schema.sql");
      console.log("[migrate] db/schema.sql baseline already present, marked as applied");
    }

    // 5. Pending migrations
    const files = listMigrationFiles();

    if (files.length === 0) {
      console.log("[migrate] no migration files found in db/migrations/");
      return;
    }

    const pending = files.filter((file) => !tracked.has(file));

    if (pending.length === 0) {
      console.log(
        `[migrate] no pending migrations (${files.length} file(s) already applied)`,
      );
      return;
    }

    for (const file of pending) {
      console.log(`[migrate] applying ${file} ...`);

      const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      const statements = await prepareStatements(conn, splitStatements(raw));

      if (statements.length === 0) {
        console.log(`[migrate] ${file} had nothing left to apply (already in sync)`);
      } else {
        try {
          await conn.query(statements.join(";\n"));
        } catch (error) {
          // Defensive fallback: an "already exists" error means the desired
          // schema state is already there, so keep going instead of crashing.
          if (ALREADY_EXISTS_CODES.has(error.code)) {
            console.warn(
              `[migrate] ${file}: ${error.code} (${error.message}) treated as already applied`,
            );
          } else {
            throw error;
          }
        }
      }

      await conn.execute(
        "INSERT IGNORE INTO schema_migrations (filename) VALUES (?)",
        [file],
      );
      console.log(`[migrate] ${file} recorded in schema_migrations`);
    }

    console.log("[migrate] all migrations applied successfully");
  } finally {
    await conn.end();
  }
}

run().catch((error) => {
  console.error("[migrate] FAILED:");
  console.error("  ", error.message);
  if (error.code) console.error("   code:", error.code);
  process.exitCode = 1;
});
