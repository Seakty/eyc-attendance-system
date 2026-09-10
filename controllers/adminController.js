const db = require("../config/database");

/**
 * GET /api/admin/summary
 * Returns today's attendance summary for the admin dashboard.
 */
async function getAttendanceSummary(req, res) {
  try {
    const [rows] = await db.execute(`
      SELECT
        SUM(
          CASE
            WHEN status IN ('On-Time', 'Late')
            THEN 1
            ELSE 0
          END
        ) AS total_present,

        SUM(
          CASE
            WHEN status = 'Late'
            THEN 1
            ELSE 0
          END
        ) AS late,

        SUM(
          CASE
            WHEN status = 'Absent'
            THEN 1
            ELSE 0
          END
        ) AS absent,

        SUM(
          CASE
            WHEN gps_verified = 0
            THEN 1
            ELSE 0
          END
        ) AS flagged_scans

      FROM attendance_logs

      WHERE date = CURDATE()
    `);

    const summary = rows[0];

    return res.status(200).json({
      status: "success",

      data: {
        totalPresent: Number(summary.total_present || 0),
        late: Number(summary.late || 0),
        absent: Number(summary.absent || 0),
        flaggedScans: Number(summary.flagged_scans || 0),
      },
    });
  } catch (error) {
    console.error("get-attendance-summary failed:", error);

    return res.status(500).json({
      status: "error",
      message: "Could not load attendance summary.",
    });
  }
}

/**
 * GET /api/admin/today
 * Returns today's attendance records for the admin dashboard.
 */
async function getTodayAttendance(req, res) {
  try {
    const [rows] = await db.execute(`
      SELECT
        attendance_logs.id,
        teachers.full_name,
        teachers.position,
        campuses.name AS campus_name,
        attendance_logs.check_in_at,
        attendance_logs.check_out_at,
        attendance_logs.status,
        attendance_logs.gps_verified

      FROM attendance_logs

      INNER JOIN teachers
        ON attendance_logs.teacher_id = teachers.id

      INNER JOIN campuses
        ON teachers.campus_id = campuses.id

      WHERE attendance_logs.date = CURDATE()

      ORDER BY attendance_logs.check_in_at DESC
    `);

    return res.status(200).json({
      status: "success",
      data: rows,
    });
  } catch (error) {
    console.error("get-today-attendance failed:", error);

    return res.status(500).json({
      status: "error",
      message: "Could not load today's attendance.",
    });
  }
}

module.exports = {
  getAttendanceSummary,
  getTodayAttendance,
};
