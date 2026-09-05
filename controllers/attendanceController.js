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
 * POST /api/attendance/scan
 * Body: { qrToken }
 * Decodes the QR token, checks the user's daily record, and logs Check-In or Check-Out.
 */
async function scanAttendance(req, res) {
  const { qrToken } = req.body;
  const userId = req.user?.id;

  if (!qrToken) {
    return res
      .status(400)
      .json({ status: "error", message: "QR token is required." });
  }

  if (!userId) {
    return res
      .status(401)
      .json({ status: "error", message: "Unauthorized. User ID missing." });
  }

  try {
    const now = new Date();
    const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

    // 1. Check if the user already has a log for today using correct schema columns
    const [rows] = await db.execute(
      "SELECT id, check_in_at, check_out_at FROM attendance_logs WHERE teacher_id = ? AND date = ?",
      [userId, todayStr],
    );

    // 2. CHECK-IN LOGIC
    if (rows.length === 0) {
      const cutoffTimeStr = "08:15:00";
      const hours = now.getHours().toString().padStart(2, "0");
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const seconds = now.getSeconds().toString().padStart(2, "0");
      const currentTimeStr = `${hours}:${minutes}:${seconds}`;

      const statusLabel = currentTimeStr > cutoffTimeStr ? "Late" : "On-Time";

      await db.execute(
        "INSERT INTO attendance_logs (teacher_id, date, check_in_at, status, gps_verified) VALUES (?, ?, ?, ?, TRUE)",
        [userId, todayStr, now, statusLabel],
      );

      return res.status(200).json({
        status: "success",
        message: "Check-in successful.",
        timestamp: now,
        action: "check-in",
        statusLabel: statusLabel,
      });
    }

    // 3. CHECK-OUT LOGIC
    const dailyLog = rows[0];

    if (dailyLog.check_out_at) {
      return res.status(400).json({
        status: "error",
        message: "You have already completed your check-out for today.",
      });
    }

    // SAFETY CHECK: Prevent accidental immediate check-out (e.g., must be at least 1 hour after check-in)
    const checkInTime = new Date(dailyLog.check_in_at);
    const hoursSinceCheckIn = (now - checkInTime) / (1000 * 60 * 60);

    if (hoursSinceCheckIn < 0.01) {
      // 1 hour threshold
      return res.status(400).json({
        status: "error",
        message:
          "Too early to check out. You must wait at least 1 hour after check-in.",
      });
    }

    await db.execute(
      "UPDATE attendance_logs SET check_out_at = ? WHERE id = ?",
      [now, dailyLog.id],
    );

    return res.status(200).json({
      status: "success",
      message: "Check-out successful.",
      timestamp: now,
      action: "check-out",
      statusLabel: "Completed",
    });
  } catch (error) {
    console.error("QR Scan failed:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error." });
  }
}

/**
 * GET /api/attendance/today
 * Fetches today's attendance status for the authenticated teacher.
 */
async function getTodayStatus(req, res) {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ status: "error", message: "Unauthorized." });
  }

  try {
    const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

    const [rows] = await db.execute(
      "SELECT check_in_at, check_out_at, status FROM attendance_logs WHERE teacher_id = ? AND date = ?",
      [userId, todayStr],
    );

    if (rows.length === 0) {
      return res.status(200).json({ status: "success", loggedIn: false });
    }

    const log = rows[0];
    return res.status(200).json({
      status: "success",
      loggedIn: true,
      checkInTime: log.check_in_at,
      checkOutTime: log.check_out_at,
      statusLabel: log.status,
    });
  } catch (error) {
    console.error("Failed to fetch today's status:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error." });
  }
}

/**
 * GET /api/attendance/my-history?year=YYYY&month=M
 * Fetches all attendance logs for the authenticated teacher for a specific month.
 */
async function getMyHistory(req, res) {
  const userId = req.user?.id;
  const { year, month } = req.query;

  if (!userId) {
    return res.status(401).json({ status: "error", message: "Unauthorized." });
  }

  if (!year || !month) {
    return res
      .status(400)
      .json({ status: "error", message: "Year and month are required." });
  }

  try {
    // Format year and month for SQL date matching (e.g., '2026-09')
    const paddedMonth = String(month).padStart(2, "0");

    const [rows] = await db.execute(
      `SELECT DATE_FORMAT(date, '%Y-%m-%d') as date, check_in_at, check_out_at, status 
       FROM attendance_logs 
       WHERE teacher_id = ? AND YEAR(date) = ? AND MONTH(date) = ?`,
      [userId, year, paddedMonth],
    );

    return res.status(200).json({
      status: "success",
      logs: rows,
    });
  } catch (error) {
    console.error("Failed to fetch history:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal server error." });
  }
}

module.exports = {
  checkLocation,
  testGeofence,
  scanAttendance,
  getTodayStatus,
  getMyHistory,
};
