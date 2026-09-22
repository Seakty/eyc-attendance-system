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

/**
 * GET /admin/settings
 * Renders campus settings with initial values. QR code is set to null 
 * so it will NOT display until submitted/saved.
 */
async function getSettings(req, res) {
  try {
    const [rows] = await db.execute(
      "SELECT late_cutoff_time, school_lat, school_lng, gps_radius_meters FROM campuses WHERE id = 1"
    );

    if (rows.length === 0) {
      return res.status(404).send("Campus not found in database.");
    }

    const settings = rows[0];

    // Format time for <input type="time"> (HH:mm)
    if (settings.late_cutoff_time) {
      settings.late_cutoff_time = settings.late_cutoff_time.substring(0, 5);
    }

    // Pass qrCodeUrl as null on page load
    res.render("admin/settings", { settings, qrCodeUrl: null });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    res.status(500).send("Internal Server Error");
  }
}

/**
 * POST /admin/settings
 * SAVES NEW MAP COORDINATES TO DATABASE and generates the new QR code poster.
 */
async function updateSettings(req, res) {
  try {
    const { late_cutoff_time, school_lat, school_lng, gps_radius_meters } = req.body;

    // 1. SAVE TO DATABASE (MySQL Update Query)
    await db.execute(
      `UPDATE campuses 
       SET late_cutoff_time = ?, school_lat = ?, school_lng = ?, gps_radius_meters = ? 
       WHERE id = 1`,
      [
        late_cutoff_time,
        parseFloat(school_lat),
        parseFloat(school_lng),
        parseInt(gps_radius_meters, 10),
      ]
    );

    // 2. Generate updated QR Code payload
    const qrData = JSON.stringify({
      campusId: 1,
      type: "eyc_entrance_qr",
      lat: parseFloat(school_lat),
      lng: parseFloat(school_lng),
      radius: parseInt(gps_radius_meters, 10),
      cutoff: late_cutoff_time,
      timestamp: Date.now(),
    });

    const qrCodeUrl = await QRCode.toDataURL(qrData);

    // 3. Render page with newly saved DB values and display the generated QR code
    const settings = {
      late_cutoff_time,
      school_lat: parseFloat(school_lat),
      school_lng: parseFloat(school_lng),
      gps_radius_meters: parseInt(gps_radius_meters, 10),
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