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

module.exports = { checkLocation, testGeofence };
