const db = require("../config/database");
const { isWithinGeofence } = require("../utils/geofence");

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return value;
}

function calculateStatus(checkInAt, campus) {
  if (!checkInAt || !campus?.late_cutoff_time) return "Absent";

  const checkIn = new Date(checkInAt);
  const [hours, minutes, seconds] = String(campus.late_cutoff_time)
    .split(":")
    .map(Number);

  const cutoff = new Date(checkIn);
  cutoff.setHours(hours, minutes, seconds, 0);

  return checkIn > cutoff ? "Late" : "On-Time";
}

/**
 * POST /api/attendance/check-location
 * Body: { lat, lng, campusId? }
 * Checks the submitted GPS coords against the campus geofence.
 */
async function checkLocation(req, res) {
  const { lat, lng, campusId } = req.body;
  const resolvedCampusId = campusId ?? req.user?.campus_id ?? 1;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({
      status: "error",
      message: "lat and lng are required and must be numbers.",
    });
  }

  try {
    const [rows] = await db.execute(
      "SELECT name, school_lat, school_lng, gps_radius_meters FROM campuses WHERE id = ? AND is_active = TRUE",
      [resolvedCampusId],
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

async function checkIn(req, res) {
  const teacherId = req.user?.id;
  const { lat, lng } = req.body;

  if (!teacherId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({
      status: "error",
      message: "lat and lng are required and must be numbers.",
    });
  }

  try {
    const [teacherRows] = await db.execute(
      "SELECT campus_id, position FROM teachers WHERE id = ? AND is_active = TRUE",
      [teacherId],
    );

    if (teacherRows.length === 0) {
      return res.status(404).json({ status: "error", message: "Teacher not found." });
    }

    const teacher = teacherRows[0];
    const [campusRows] = await db.execute(
      "SELECT name, school_lat, school_lng, gps_radius_meters, late_cutoff_time FROM campuses WHERE id = ? AND is_active = TRUE",
      [teacher.campus_id],
    );

    if (campusRows.length === 0) {
      return res.status(404).json({ status: "error", message: "Campus not found." });
    }

    const campus = campusRows[0];
    const result = isWithinGeofence(
      lat,
      lng,
      parseFloat(campus.school_lat),
      parseFloat(campus.school_lng),
      campus.gps_radius_meters,
    );

    if (!result.isInside) {
      return res.status(400).json({
        status: "error",
        message: "You must be inside the campus geofence to check in.",
        distanceMeters: result.distanceMeters,
        allowedRadiusMeters: campus.gps_radius_meters,
      });
    }

    const today = getTodayDateString();
    const checkInAt = new Date();
    const [existingRows] = await db.execute(
      "SELECT id FROM attendance_logs WHERE teacher_id = ? AND date = ?",
      [teacherId, today],
    );

    if (existingRows.length > 0) {
      const [updated] = await db.execute(
        `UPDATE attendance_logs
         SET check_in_at = ?, check_in_lat = ?, check_in_lng = ?, gps_verified = TRUE, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE teacher_id = ? AND date = ?`,
        [checkInAt, lat, lng, calculateStatus(checkInAt, campus), teacherId, today],
      );

      return res.status(200).json({
        status: "success",
        message: "Check-in updated successfully.",
        updated: updated.affectedRows > 0,
      });
    }

    const [inserted] = await db.execute(
      `INSERT INTO attendance_logs (teacher_id, date, check_in_at, check_in_lat, check_in_lng, status, gps_verified)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [teacherId, today, checkInAt, lat, lng, calculateStatus(checkInAt, campus)],
    );

    return res.status(201).json({
      status: "success",
      message: "Check-in successful.",
      logId: inserted.insertId,
    });
  } catch (error) {
    console.error("checkIn failed:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to record check-in.",
    });
  }
}

async function checkOut(req, res) {
  const teacherId = req.user?.id;

  if (!teacherId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const today = getTodayDateString();
    const [rows] = await db.execute(
      "SELECT id, check_in_at FROM attendance_logs WHERE teacher_id = ? AND date = ?",
      [teacherId, today],
    );

    if (rows.length === 0) {
      return res.status(404).json({ status: "error", message: "No check-in record found for today." });
    }

    const checkOutAt = new Date();
    const [result] = await db.execute(
      `UPDATE attendance_logs
       SET check_out_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE teacher_id = ? AND date = ? AND check_out_at IS NULL`,
      [checkOutAt, teacherId, today],
    );

    return res.status(200).json({
      status: "success",
      message: result.affectedRows > 0 ? "Check-out successful." : "Check-out already recorded.",
      checkOutAt,
    });
  } catch (error) {
    console.error("checkOut failed:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to record check-out.",
    });
  }
}

async function scanAttendance(req, res) {
  const teacherId = req.user?.id;
  const { qrToken, qrCode } = req.body;
  const tokenValue = qrToken ?? qrCode;

  if (!teacherId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  if (!tokenValue || typeof tokenValue !== "string") {
    return res.status(400).json({
      status: "error",
      message: "QR token is required.",
    });
  }

  try {
    let parsedToken = null;
    try {
      parsedToken = JSON.parse(tokenValue);
    } catch (error) {
      parsedToken = null;
    }

    const desiredAction = parsedToken && typeof parsedToken === "object"
      ? (parsedToken.type || parsedToken.action || "check-in")
      : "check-in";

    const today = getTodayDateString();
    const [teacherRows] = await db.execute(
      "SELECT campus_id FROM teachers WHERE id = ? AND is_active = TRUE",
      [teacherId],
    );

    if (teacherRows.length === 0) {
      return res.status(404).json({ status: "error", message: "Teacher not found." });
    }

    const [campusRows] = await db.execute(
      "SELECT late_cutoff_time FROM campuses WHERE id = ? AND is_active = TRUE",
      [teacherRows[0].campus_id],
    );

    if (campusRows.length === 0) {
      return res.status(404).json({ status: "error", message: "Campus not found." });
    }

    const campus = campusRows[0];
    const [rows] = await db.execute(
      "SELECT id, check_in_at, check_out_at, status FROM attendance_logs WHERE teacher_id = ? AND date = ?",
      [teacherId, today],
    );

    const now = new Date();

    if (rows.length === 0) {
      const status = calculateStatus(now, campus);
      const [insertResult] = await db.execute(
        `INSERT INTO attendance_logs (teacher_id, date, check_in_at, status, gps_verified)
         VALUES (?, ?, ?, ?, TRUE)`,
        [teacherId, today, now, status],
      );

      return res.status(200).json({
        status: "success",
        action: "check-in",
        logId: insertResult.insertId,
        statusLabel: status,
        message: `Check-in recorded at ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        timestamp: now.toISOString(),
      });
    }

    const record = rows[0];
    const isCheckOutRequested = desiredAction === "check-out" || (!record.check_in_at && desiredAction === "check-in") || (record.check_in_at && record.check_out_at === null);

    if (isCheckOutRequested && record.check_in_at && !record.check_out_at) {
      const [updateResult] = await db.execute(
        `UPDATE attendance_logs
         SET check_out_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE teacher_id = ? AND date = ? AND check_out_at IS NULL`,
        [now, teacherId, today],
      );

      return res.status(200).json({
        status: "success",
        action: "check-out",
        updated: updateResult.affectedRows > 0,
        message: `Check-out recorded at ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        timestamp: now.toISOString(),
      });
    }

    if (!record.check_in_at) {
      const status = calculateStatus(now, campus);
      const [updateResult] = await db.execute(
        `UPDATE attendance_logs
         SET check_in_at = ?, status = ?, gps_verified = TRUE, updated_at = CURRENT_TIMESTAMP
         WHERE teacher_id = ? AND date = ?`,
        [now, status, teacherId, today],
      );

      return res.status(200).json({
        status: "success",
        action: "check-in",
        updated: updateResult.affectedRows > 0,
        statusLabel: status,
        message: `Check-in recorded at ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        timestamp: now.toISOString(),
      });
    }

    return res.status(400).json({
      status: "error",
      message: "Attendance already completed for today.",
    });
  } catch (error) {
    console.error("scanAttendance failed:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to process QR scan.",
    });
  }
}

async function getMyHistory(req, res) {
  const teacherId = req.user?.id;
  const year = Number(req.query.year || new Date().getFullYear());
  const month = Number(req.query.month || new Date().getMonth() + 1);

  if (!teacherId) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const [rows] = await db.execute(
      `SELECT date, status, check_in_at, check_out_at
       FROM attendance_logs
       WHERE teacher_id = ? AND YEAR(date) = ? AND MONTH(date) = ?
       ORDER BY date ASC`,
      [teacherId, year, month],
    );

    return res.status(200).json({
      status: "success",
      logs: rows.map((row) => ({
        date: normalizeDateValue(row.date),
        status: row.status,
        checkInAt: row.check_in_at || null,
        checkOutAt: row.check_out_at || null,
      })),
    });
  } catch (error) {
    console.error("getMyHistory failed:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to fetch attendance history.",
    });
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

module.exports = {
  checkLocation,
  checkIn,
  checkOut,
  scanAttendance,
  getMyHistory,
  testGeofence,
};
