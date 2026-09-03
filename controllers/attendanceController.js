const db = require("../config/database");
const { isWithinGeofence } = require("../utils/geofence");

/**
 * POST /api/attendance/check-location
 * Body: { lat, lng, campusId? }
 * Checks the submitted GPS coords against the campus geofence.
 */
async function checkLocation(req, res) {
  const { lat, lng, campusId } = req.body;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({
      status: "error",
      message: "lat and lng are required and must be numbers.",
    });
  }

  try {
    // TODO: once auth middleware is wired up, derive campusId from the
    // authenticated teacher instead of trusting the request body.
    const [rows] = await db.execute(
      "SELECT name, school_lat, school_lng, gps_radius_meters FROM campuses WHERE id = ? AND is_active = TRUE",
      [campusId || 1],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Campus not found." });
    }

    const campus = rows[0];
    const result = isWithinGeofence(
      lat,
      lng,
      parseFloat(campus.school_lat),
      parseFloat(campus.school_lng),
      campus.gps_radius_meters,
    );

    return res.status(200).json({
      status: "success",
      campus: campus.name,
      isInside: result.isInside,
      distanceMeters: result.distanceMeters,
      allowedRadiusMeters: campus.gps_radius_meters,
    });
  } catch (error) {
    console.error("check-location failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error." });
  }
}

/**
 * GET /api/attendance/test-geofence
 * Test route to verify Haversine formula logic
 */
async function testGeofence(req, res) {
  try {
    const [rows] = await db.execute(
      "SELECT name, school_lat, school_lng, gps_radius_meters FROM campuses WHERE id = 1",
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Campus not found in database." });
    }

    const campus = rows[0];
    const schoolLat = parseFloat(campus.school_lat);
    const schoolLng = parseFloat(campus.school_lng);
    const radius = campus.gps_radius_meters;

    const teacherLat = 11.5565;
    const teacherLng = 104.9283;

    const result = isWithinGeofence(
      teacherLat,
      teacherLng,
      schoolLat,
      schoolLng,
      radius,
    );

    res.json({
      status: "success",
      campusTested: campus.name,
      schoolLocation: {
        lat: schoolLat,
        lng: schoolLng,
      },
      teacherLocation: {
        lat: teacherLat,
        lng: teacherLng,
      },
      allowedRadiusMeters: radius,
      geofenceResult: result,
    });
  } catch (error) {
    console.error("Database query failed:", error);
    res.status(500).json({
      error: "Internal Server Error while querying campuses table",
    });
  }
}
/**
 * GET /api/attendance/summary
 * Returns today's attendance summary for the admin dashboard.
 */
async function getAttendanceSummary(req, res) {
  try {
    const [rows] = await db.execute(`
      SELECT
        SUM(CASE WHEN status IN ('On-Time', 'Late') THEN 1 ELSE 0 END) AS total_present,
        SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) AS late,
        SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent,
        SUM(CASE WHEN gps_verified = 0 THEN 1 ELSE 0 END) AS flagged_scans
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
 * GET /api/attendance/today
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
  checkLocation,
  testGeofence,
  getAttendanceSummary,
  getTodayAttendance,
};
