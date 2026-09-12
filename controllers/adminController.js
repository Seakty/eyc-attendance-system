const db = require("../config/database");
const QRCode = require("qrcode");

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

// ============================================================
// GET /admin/settings
// Renders the campus settings form with current DB values.
// ============================================================
async function getSettings(req, res) {
  try {
    const [rows] = await db.execute(
      "SELECT late_cutoff_time, school_lat, school_lng, gps_radius_meters FROM campuses WHERE id = 1",
    );

    if (rows.length === 0) {
      return res.status(404).send("Campus not found in database.");
    }

    const settings = rows[0];

    // Convert time to HH:mm format for the HTML time input if needed
    if (settings.late_cutoff_time) {
      settings.late_cutoff_time = settings.late_cutoff_time.substring(0, 5);
    }

    res.render("admin/settings", { settings, qrCodeUrl: null });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    res.status(500).send("Internal Server Error");
  }
}

// ============================================================
// POST /admin/settings
// Updates campus settings and regenerates the entrance QR code.
// ============================================================
async function updateSettings(req, res) {
  try {
    const { late_cutoff_time, school_lat, school_lng, gps_radius_meters } =
      req.body;

    // 1. Update the database
    await db.execute(
      `UPDATE campuses 
       SET late_cutoff_time = ?, school_lat = ?, school_lng = ?, gps_radius_meters = ? 
       WHERE id = 1`,
      [late_cutoff_time, school_lat, school_lng, gps_radius_meters],
    );

    // 2. Create payload string for the QR code
    const qrData = JSON.stringify({
      campusId: 1,
      type: "eyc_entrance_qr",
      lat: school_lat,
      lng: school_lng,
      radius: gps_radius_meters,
      cutoff: late_cutoff_time,
      timestamp: Date.now(),
    });

    // 3. Generate Data URL for the QR code image
    const qrCodeUrl = await QRCode.toDataURL(qrData);

    // 4. Render the page with the updated settings & new QR code
    const settings = {
      late_cutoff_time,
      school_lat,
      school_lng,
      gps_radius_meters,
    };
    res.render("admin/settings", { settings, qrCodeUrl });
  } catch (error) {
    console.error("Failed to update settings or generate QR:", error);
    res.status(500).send("Internal Server Error");
  }
}

module.exports = {
  getAttendanceSummary,
  getTodayAttendance,
  getSettings,
  updateSettings,
};
