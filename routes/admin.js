const express = require("express");
const router = express.Router();
const db = require("../config/database");
const requireAuth = require("../middleware/requireAuth");

router.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const [today] = await db.execute(
      `SELECT COUNT(*) AS total_logs,
              SUM(CASE WHEN status = 'On-Time' THEN 1 ELSE 0 END) AS on_time,
              SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) AS late,
              SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent
       FROM attendance_logs
       WHERE date = CURDATE()`,
    );

    const [teachers] = await db.execute(
      `SELECT COUNT(*) AS total_staff FROM teachers WHERE is_active = TRUE`,
    );

    return res.status(200).json({
      status: "success",
      summary: {
        totalStaff: Number(teachers[0]?.total_staff || 0),
        totalLogs: Number(today[0]?.total_logs || 0),
        onTime: Number(today[0]?.on_time || 0),
        late: Number(today[0]?.late || 0),
        absent: Number(today[0]?.absent || 0),
      },
    });
  } catch (error) {
    console.error("admin dashboard fetch failed:", error);
    return res.status(500).json({ status: "error", message: "Unable to load dashboard." });
  }
});

router.get("/staff", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT t.id, t.full_name, t.position, t.phone, t.is_active, c.name AS campus_name
       FROM teachers t
       LEFT JOIN campuses c ON c.id = t.campus_id
       ORDER BY t.full_name ASC`,
    );

    return res.status(200).json({
      status: "success",
      staff: rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        position: row.position,
        phone: row.phone,
        isActive: Boolean(row.is_active),
        campusName: row.campus_name || "Unknown",
      })),
    });
  } catch (error) {
    console.error("admin staff fetch failed:", error);
    return res.status(500).json({ status: "error", message: "Unable to fetch staff." });
  }
});

module.exports = router;
