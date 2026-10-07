#!/usr/bin/env node
/**
 * Idempotent seed script.
 *
 * Gives every developer the exact same starting data:
 *   - two sample campuses
 *   - one admin account (role = 'admin')
 *   - a handful of sample staff accounts (role = 'staff')
 *
 * Safe to run any number of times: campuses are inserted with INSERT IGNORE
 * (so locally tuned coordinates are never overwritten) and teachers are
 * upserted by the unique `phone` key with ON DUPLICATE KEY UPDATE.
 *
 * Passwords are stored as bcrypt hashes, exactly like the login route does.
 *
 * Overrides (optional, put them in .env):
 *   SEED_ADMIN_PHONE, SEED_ADMIN_PASSWORD, SEED_STAFF_PASSWORD,
 *   SEED_RESET_PASSWORDS=1  -> force seeded accounts back to the default password
 */
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const DB_NAME = process.env.DB_NAME || "eyc_attendance";

const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  port: Number(process.env.DB_PORT) || 3306,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
};

const BCRYPT_ROUNDS = 10;
const RESET_PASSWORDS = ["1", "true", "yes"].includes(
  String(process.env.SEED_RESET_PASSWORDS || "").toLowerCase(),
);

const ADMIN_PHONE = process.env.SEED_ADMIN_PHONE || "0999999999";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Admin@123";
const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD || "Staff@123";

const CAMPUS_SEEDS = [
  {
    name: "Main Campus",
    late_cutoff_time: "08:15:00",
    school_lat: 11.5564,
    school_lng: 104.9282,
    gps_radius_meters: 50,
  },
  {
    name: "Second Campus",
    late_cutoff_time: "08:15:00",
    school_lat: 11.56,
    school_lng: 104.93,
    gps_radius_meters: 50,
  },
];

const TEACHER_SEEDS = [
  {
    full_name: "EYC Admin",
    position: "System Administrator",
    phone: ADMIN_PHONE,
    role: "admin",
    campus: "Main Campus",
    password: ADMIN_PASSWORD,
  },
  {
    full_name: "Sokha Chan",
    position: "English Teacher",
    phone: "0999999991",
    role: "staff",
    campus: "Main Campus",
    password: STAFF_PASSWORD,
  },
  {
    full_name: "Dara Vong",
    position: "Mathematics Teacher",
    phone: "0999999992",
    role: "staff",
    campus: "Main Campus",
    password: STAFF_PASSWORD,
  },
  {
    full_name: "Leak Smey",
    position: "Science Teacher",
    phone: "0999999993",
    role: "staff",
    campus: "Second Campus",
    password: STAFF_PASSWORD,
  },
  {
    full_name: "Chhorn Bopha",
    position: "Khmer Teacher",
    phone: "0999999994",
    role: "staff",
    campus: "Second Campus",
    password: STAFF_PASSWORD,
  },
];

async function assertSchemaReady(pool) {
  const [tables] = await pool.execute(
    `SELECT TABLE_NAME AS name
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('teachers', 'campuses')`,
    [DB_NAME],
  );

  if (tables.length < 2) {
    throw new Error(
      `Tables are missing in "${DB_NAME}". Run "npm run db:migrate" first.`,
    );
  }

  const [columns] = await pool.execute(
    `SELECT COUNT(*) AS total
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'teachers' AND COLUMN_NAME = 'role'`,
    [DB_NAME],
  );

  if (Number(columns[0].total) === 0) {
    throw new Error(
      `Column teachers.role is missing in "${DB_NAME}". Run "npm run db:migrate" first.`,
    );
  }
}

async function seedCampuses(pool) {
  for (const campus of CAMPUS_SEEDS) {
    // INSERT IGNORE: never overwrites coordinates/cutoffs a developer already tuned.
    await pool.execute(
      `INSERT IGNORE INTO campuses
         (name, late_cutoff_time, school_lat, school_lng, gps_radius_meters)
       VALUES (?, ?, ?, ?, ?)`,
      [
        campus.name,
        campus.late_cutoff_time,
        campus.school_lat,
        campus.school_lng,
        campus.gps_radius_meters,
      ],
    );
  }

  const names = CAMPUS_SEEDS.map((campus) => campus.name);
  const [rows] = await pool.execute(
    `SELECT id, name FROM campuses WHERE name IN (${names.map(() => "?").join(", ")})`,
    names,
  );

  const byName = new Map(rows.map((row) => [row.name, row.id]));
  const missing = names.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`Campus seed failed, could not resolve: ${missing.join(", ")}`);
  }

  return byName;
}

async function seedTeachers(pool, campusIds) {
  const columns = [
    "full_name",
    "position",
    "role",
    "campus_id",
    "phone",
    "password_hash",
    "is_active",
  ];

  // Everything except password_hash is refreshed on re-runs; the password of an
  // existing row is only rewritten when SEED_RESET_PASSWORDS=1.
  const updateColumns = columns.filter(
    (column) => column !== "password_hash" || RESET_PASSWORDS,
  );

  const sql = `INSERT INTO teachers (${columns.join(", ")})
               VALUES (${columns.map(() => "?").join(", ")})
               ON DUPLICATE KEY UPDATE
                 ${updateColumns.map((column) => `${column} = ?`).join(",\n                 ")}`;

  const created = [];
  const updated = [];

  for (const seed of TEACHER_SEEDS) {
    const [before] = await pool.execute(
      "SELECT id FROM teachers WHERE phone = ?",
      [seed.phone],
    );

    const passwordHash = await bcrypt.hash(seed.password, BCRYPT_ROUNDS);
    const values = [
      seed.full_name,
      seed.position,
      seed.role,
      campusIds.get(seed.campus),
      seed.phone,
      passwordHash,
      1,
    ];
    const updateValues = updateColumns.map((column) =>
      column === "password_hash" ? passwordHash : values[columns.indexOf(column)],
    );

    await pool.execute(sql, [...values, ...updateValues]);

    if (before.length === 0) created.push(seed);
    else updated.push(seed);
  }

  return { created, updated };
}

async function run() {
  console.log(`\n[seed] target database: ${DB_NAME} @ ${DB_CONFIG.host}:${DB_CONFIG.port}`);

  const pool = mysql.createPool(DB_CONFIG);

  try {
    await assertSchemaReady(pool);

    const campusIds = await seedCampuses(pool);
    const { created, updated } = await seedTeachers(pool, campusIds);

    const [counts] = await pool.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(role = 'admin') AS admins,
         SUM(role = 'staff') AS staffs
       FROM teachers`,
    );

    console.log(`[seed] campuses: ${CAMPUS_SEEDS.length}`);
    console.log(
      `[seed] teachers: ${counts[0].total} total (${counts[0].admins} admin, ${counts[0].staffs} staff)`,
    );
    console.log(`[seed] created: ${created.length}, refreshed: ${updated.length}`);

    console.log("\n[seed] default logins:");
    for (const seed of TEACHER_SEEDS) {
      const action = seed.phone === ADMIN_PHONE ? "ADMIN" : "staff";
      console.log(`   ${action}: ${seed.phone} / ${seed.password}  (${seed.full_name})`);
    }
    if (RESET_PASSWORDS) {
      console.log("[seed] SEED_RESET_PASSWORDS=1 -> seeded passwords were reset");
    }
    console.log("\n[seed] done\n");
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("[seed] FAILED:");
  console.error("  ", error.message);
  if (error.code) console.error("   code:", error.code);
  process.exitCode = 1;
});
