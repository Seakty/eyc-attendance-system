const excelService = require("../services/excelService");
const db = require("../config/database");
const QRCode = require("qrcode");
const bcrypt = require("bcryptjs");

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
        ) AS absent_logs,

        SUM(
          CASE
            WHEN gps_verified = 0 AND check_in_at IS NOT NULL
            THEN 1
            ELSE 0
          END
        ) AS flagged_scans

      FROM attendance_logs

      WHERE date = CURDATE()
    `);

    const summary = rows[0];

    // Total active staff (used for the real percentages on the cards)
    const [staffRows] = await db.execute(
      "SELECT COUNT(*) AS total_staff FROM teachers WHERE is_active = 1 AND role = 'staff'",
    );

    const totalStaff = Number(staffRows[0].total_staff || 0);
    const totalPresent = Number(summary.total_present || 0);
    const late = Number(summary.late || 0);
    const flaggedScans = Number(summary.flagged_scans || 0);

    // Determine if today is a working day (Mon-Fri)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 Sun, 1 Mon, ..., 6 Sat
    const isWorkingDay = dayOfWeek >= 1 && dayOfWeek <= 5;

    let todayAbsent = 0;
    let absentNote = "";

    if (!isWorkingDay) {
      todayAbsent = 0;
      absentNote = "Non-working day";
    } else {
      // On a working day, absent = total active staff - total present today
      todayAbsent = Math.max(0, totalStaff - totalPresent);
      if (totalStaff > 0) {
        absentNote = `${Math.round((todayAbsent / totalStaff) * 1000) / 10}% of staff`;
      } else {
        absentNote = "0% of staff";
      }
    }

    return res.status(200).json({
      status: "success",

      data: {
        totalPresent,
        late,
        absent: todayAbsent,
        absentNote,
        isWorkingDay,
        flaggedScans,
        totalStaff,
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
// CAMPUS SETTINGS — helpers
// Settings are stored per campus on the `campuses` table
// (late_cutoff_time, latitude, longitude, radius_meters).
// ============================================================

const CAMPUS_SETTINGS_COLUMNS =
  "id, name, late_cutoff_time, latitude, longitude, radius_meters, is_active";

/** Map a raw `campuses` row into the shape the settings page/API uses. */
function toCampusSettings(row) {
  return {
    campus_id: row.id,
    name: row.name,
    is_active: Boolean(row.is_active),
    late_cutoff_time: row.late_cutoff_time
      ? String(row.late_cutoff_time).substring(0, 5)
      : "",
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radius_meters: Number(row.radius_meters),
  };
}

/** Build the entrance QR payload (carries campusId so check-ins hit the right row). */
async function generateCampusQr(settings) {
  const cutoff =
    settings.late_cutoff_time && settings.late_cutoff_time.length === 5
      ? `${settings.late_cutoff_time}:00`
      : settings.late_cutoff_time;

  const qrData = JSON.stringify({
    campusId: settings.campus_id,
    type: "eyc_entrance_qr",
    lat: settings.latitude,
    lng: settings.longitude,
    radius: settings.radius_meters,
    cutoff,
    timestamp: Date.now(),
  });

  return QRCode.toDataURL(qrData);
}

/**
 * Load every campus plus the one currently selected, ready for rendering.
 * `selectedCampusId` may be undefined -> first active campus wins.
 * `qrCodeUrl` may be passed in; otherwise a fresh QR is generated.
 */
async function buildSettingsPageData(selectedCampusId, qrCodeUrl = null) {
  const [rows] = await db.execute(
    `SELECT ${CAMPUS_SETTINGS_COLUMNS} FROM campuses ORDER BY is_active DESC, name ASC`,
  );

  if (rows.length === 0) {
    const error = new Error("No campuses found. Run `npm run db:seed` first.");
    error.status = 404;
    throw error;
  }

  const campuses = rows.map(toCampusSettings);
  const requestedId = Number(selectedCampusId);

  const settings =
    campuses.find((campus) => campus.campus_id === requestedId) ||
    campuses.find((campus) => campus.is_active) ||
    campuses[0];

  return {
    campuses,
    selectedCampusId: settings.campus_id,
    settings,
    qrCodeUrl: qrCodeUrl || (await generateCampusQr(settings)),
  };
}

/**
 * Validate the settings payload shared by the JSON API and the classic form.
 * Returns { value } on success or { errors } on failure.
 */
function parseSettingsPayload(body = {}) {
  const errors = [];

  const campusId = Number(body.campus_id);
  if (!Number.isInteger(campusId) || campusId <= 0) {
    errors.push("campus_id is required.");
  }

  const rawCutoff =
    body.late_cutoff_time == null ? "" : String(body.late_cutoff_time).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(rawCutoff)) {
    errors.push("late_cutoff_time must be in HH:mm or HH:mm:ss format.");
  }

  const latitude = Number(body.latitude);
  if (body.latitude === "" || !Number.isFinite(latitude) || Math.abs(latitude) > 90) {
    errors.push("latitude must be a number between -90 and 90.");
  }

  const longitude = Number(body.longitude);
  if (body.longitude === "" || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    errors.push("longitude must be a number between -180 and 180.");
  }

  const radiusMeters = Number(body.radius_meters);
  if (
    body.radius_meters === "" ||
    !Number.isInteger(radiusMeters) ||
    radiusMeters < 1 ||
    radiusMeters > 10000
  ) {
    errors.push("radius_meters must be an integer between 1 and 10000.");
  }

  if (errors.length > 0) return { errors };

  return {
    value: {
      campus_id: campusId,
      late_cutoff_time:
        rawCutoff.length === 5 ? `${rawCutoff}:00` : rawCutoff,
      latitude,
      longitude,
      radius_meters: radiusMeters,
    },
  };
}

// ============================================================
// GET /admin/settings
// Renders the multi-campus settings form with current DB values.
// Optional ?campus=<id> preselects a campus in the dropdown.
// ============================================================
async function getSettings(req, res) {
  try {
    const data = await buildSettingsPageData(req.query.campus);

    res.render("admin/settings", {
      ...data,
      // Shared sidebar needs both of these
      user: req.session.user,
      path: req.path,
    });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    res.status(error.status || 500).send(error.message || "Internal Server Error");
  }
}

// ============================================================
// POST /admin/settings (classic form fallback)
// Updates ONE campus's settings (campus_id in the body) and
// re-renders with a freshly generated entrance QR code.
// The settings page itself submits to /api/admin/settings.
// ============================================================
async function updateSettings(req, res) {
  try {
    const payload = parseSettingsPayload({
      ...req.body,
      // Back-compat with the old field names
      campus_id: req.body.campus_id || req.body.campusId || 1,
      latitude: req.body.latitude ?? req.body.school_lat,
      longitude: req.body.longitude ?? req.body.school_lng,
      radius_meters: req.body.radius_meters ?? req.body.gps_radius_meters,
    });

    if (payload.errors) {
      return res.status(400).send(payload.errors.join(" "));
    }

    const { campus_id, late_cutoff_time, latitude, longitude, radius_meters } =
      payload.value;

    const [campusRows] = await db.execute(
      "SELECT id FROM campuses WHERE id = ?",
      [campus_id],
    );

    if (campusRows.length === 0) {
      return res.status(404).send("Campus not found in database.");
    }

    await db.execute(
      `UPDATE campuses
       SET late_cutoff_time = ?, latitude = ?, longitude = ?, radius_meters = ?
       WHERE id = ?`,
      [late_cutoff_time, latitude, longitude, radius_meters, campus_id],
    );

    // Re-read from the DB and regenerate the QR from the saved values
    const data = await buildSettingsPageData(campus_id);

    res.render("admin/settings", {
      ...data,
      // Shared sidebar needs both of these
      user: req.session.user,
      path: req.path,
    });
  } catch (error) {
    console.error("Failed to update settings or generate QR:", error);
    res.status(error.status || 500).send(error.message || "Internal Server Error");
  }
}

// ============================================================
// GET /api/admin/settings/:campusId
// Returns one campus's saved settings as JSON (used by the
// campus selector dropdown on the settings page).
// ============================================================
async function getCampusSettings(req, res) {
  try {
    const campusId = Number(req.params.campusId);

    if (!Number.isInteger(campusId) || campusId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid campus ID.",
      });
    }

    const [rows] = await db.execute(
      `SELECT ${CAMPUS_SETTINGS_COLUMNS} FROM campuses WHERE id = ?`,
      [campusId],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Campus not found.",
      });
    }

    return res.status(200).json({
      status: "success",
      data: toCampusSettings(rows[0]),
    });
  } catch (error) {
    console.error("get-campus-settings failed:", error);

    return res.status(500).json({
      status: "error",
      message: "Could not load campus settings.",
    });
  }
}

// ============================================================
// POST /api/admin/settings
// Saves settings for ONE campus without touching any other
// campus row, and regenerates that campus's entrance QR code.
// Body: { campus_id, late_cutoff_time, latitude, longitude, radius_meters }
// ============================================================
async function saveCampusSettings(req, res) {
  try {
    const payload = parseSettingsPayload(req.body);

    if (payload.errors) {
      return res.status(400).json({
        status: "error",
        message: payload.errors.join(" "),
        errors: payload.errors,
      });
    }

    const { campus_id, late_cutoff_time, latitude, longitude, radius_meters } =
      payload.value;

    const [campusRows] = await db.execute(
      "SELECT id, name FROM campuses WHERE id = ?",
      [campus_id],
    );

    if (campusRows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Campus not found.",
      });
    }

    // Scoped to a single campus_id -> other campuses are never modified.
    await db.execute(
      `UPDATE campuses
       SET late_cutoff_time = ?, latitude = ?, longitude = ?, radius_meters = ?
       WHERE id = ?`,
      [late_cutoff_time, latitude, longitude, radius_meters, campus_id],
    );

    const settings = {
      campus_id,
      name: campusRows[0].name,
      is_active: true,
      late_cutoff_time: late_cutoff_time.substring(0, 5),
      latitude,
      longitude,
      radius_meters,
    };

    const qrCodeUrl = await generateCampusQr(settings);

    return res.status(200).json({
      status: "success",
      message: `Settings saved successfully for ${settings.name}`,
      data: settings,
      qrCodeUrl,
    });
  } catch (error) {
    console.error("save-campus-settings failed:", error);

    return res.status(500).json({
      status: "error",
      message: "Could not save campus settings.",
    });
  }
}

// ============================================================
// ADM-05 — REPORTS & ANALYTICS HELPERS
//
// The whole page is a WORKING-DAYS report (Mon-Fri):
//  - "expected working days" only contains weekdays, so present/late days are
//    restricted to weekdays as well, which keeps the attendance rate <= 100%
//    and keeps the KPI cards, the charts and the table describing the exact
//    same set of days.
//  - The monthly trend chart uses the same weekday filter for the same reason,
//    so the chart can never contradict the punctuality index on screen.
//  - The ADM-04 Excel export keeps its own original, unscoped counts.
// ============================================================

// Pads a number to two digits ("1" -> "01")
function padTwo(value) {
  return String(value).padStart(2, "0");
}

// Only a strict "YYYY-MM" value is accepted, anything else falls back to the
// current calendar month. Malformed query strings can never break the page.
function resolveMonth(rawMonth) {
  const now = new Date();

  const fallback = `${now.getFullYear()}-${padTwo(now.getMonth() + 1)}`;

  const month =
    typeof rawMonth === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth)
      ? rawMonth
      : fallback;

  const [year, monthNumber] = month.split("-").map(Number);

  return {
    month,
    year,
    monthNumber, // 1 - 12
    monthLabel: new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }),
  };
}

// First and last calendar day of the month as MySQL friendly DATE strings
function monthBounds(year, monthNumber) {
  // Day 0 of the next month === the last day of the requested month
  const lastDay = new Date(year, monthNumber, 0).getDate();

  return {
    start: `${year}-${padTwo(monthNumber)}-01`,
    end: `${year}-${padTwo(monthNumber)}-${padTwo(lastDay)}`,
  };
}

// Weekdays (Mon-Fri) the selected month should have produced.
// For the month currently in progress we only count the days that already
// happened, so a partial month is never scored against days that did not happen.
function countWorkingDays(year, monthNumber) {
  const now = new Date();

  const isCurrentMonth =
    year === now.getFullYear() && monthNumber === now.getMonth() + 1;

  const lastDayOfMonth = new Date(year, monthNumber, 0).getDate();
  const lastDayToCount = isCurrentMonth ? now.getDate() : lastDayOfMonth;

  let workingDays = 0;

  for (let day = 1; day <= lastDayToCount; day++) {
    const weekday = new Date(year, monthNumber - 1, day).getDay(); // 0 Sun - 6 Sat

    if (weekday !== 0 && weekday !== 6) {
      workingDays += 1;
    }
  }

  return workingDays;
}

// Safe percentage: pct(2, 8) -> 25 (always a number, never NaN / Infinity)
function percentage(part, whole) {
  if (!whole || whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

// mysql2 hands DATE columns back as a local-midnight Date object,
// so normalise both Date objects and raw strings to "YYYY-MM-DD".
function toDateKey(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${padTwo(value.getMonth() + 1)}-${padTwo(
      value.getDate(),
    )}`;
  }

  return String(value).slice(0, 10);
}

// ============================================================
// GET /admin/reports  (page controller, see routes/pages.js)
// Renders the monthly Reports & Analytics page for the selected month.
// ============================================================
async function getReportsAnalytics(req, res) {
  try {
    const { month, year, monthNumber, monthLabel } = resolveMonth(req.query.month);
    const { start, end } = monthBounds(year, monthNumber);

    // 1. Per-teacher breakdown for the selected month.
    //    Active staff only, so the totals always match the staff list screen.
    //    Present / late days are restricted to weekdays (Mon-Fri) because the
    //    "expected working days" denominator only contains weekdays; counting
    //    weekend scans here as well would push the attendance rate above 100%.
    const [teacherRows] = await db.execute(
      `
      SELECT
        t.id AS teacher_id,
        t.full_name,
        c.name AS campus_name,

        SUM(
          CASE
            WHEN al.status = 'On-Time' AND DAYOFWEEK(al.date) BETWEEN 2 AND 6
            THEN 1 ELSE 0
          END
        ) AS days_on_time,

        SUM(
          CASE
            WHEN al.status = 'Late' AND DAYOFWEEK(al.date) BETWEEN 2 AND 6
            THEN 1 ELSE 0
          END
        ) AS days_late,

        SUM(
          CASE WHEN al.status = 'Absent'
                AND DAYOFWEEK(al.date) BETWEEN 2 AND 6
               THEN 1 ELSE 0
          END
        ) AS days_absent

      FROM teachers t

      INNER JOIN campuses c
        ON c.id = t.campus_id

      LEFT JOIN attendance_logs al
        ON al.teacher_id = t.id
        AND al.date BETWEEN ? AND ?

      WHERE t.is_active = TRUE
        AND t.role = 'staff'

      GROUP BY t.id, t.full_name, c.name
      ORDER BY t.full_name ASC
      `,
      [start, end],
    );

    // 2. Daily on-time vs. late arrivals across the month (trend chart).
    //    Same weekday filter as the KPI cards so the chart and the punctuality
    //    index always describe the same days.
    const [dailyRows] = await db.execute(
      `
      SELECT
        al.date AS scan_date,

        SUM(CASE WHEN al.status = 'On-Time' THEN 1 ELSE 0 END) AS on_time,
        SUM(CASE WHEN al.status = 'Late'    THEN 1 ELSE 0 END) AS late,
        SUM(CASE WHEN al.status = 'Absent'  THEN 1 ELSE 0 END) AS absent

      FROM attendance_logs al

      INNER JOIN teachers t
        ON t.id = al.teacher_id

      WHERE al.date BETWEEN ? AND ?
        AND DAYOFWEEK(al.date) BETWEEN 2 AND 6
        AND t.is_active = TRUE
        AND t.role = 'staff'

      GROUP BY al.date
      ORDER BY al.date ASC
      `,
      [start, end],
    );

    // ------------------------------------------------------------
    // 3. Per-teacher rows + their punctuality score
    // ------------------------------------------------------------
    const teacherBreakdown = teacherRows.map((row) => {
      const daysOnTime = Number(row.days_on_time || 0);
      const daysLate = Number(row.days_late || 0);
      const daysAbsent = Number(row.days_absent || 0);

      // A teacher counts as present for every day they actually scanned in,
      // no matter whether that scan was on time or late.
      const daysPresent = daysOnTime + daysLate;

      return {
        teacherId: Number(row.teacher_id),
        teacherName: row.full_name,
        campusName: row.campus_name || "—",
        daysPresent,
        daysOnTime,
        daysLate,
        daysAbsent,
        // Punctuality = on-time scans / all scans made by this teacher
        punctualityScore: percentage(daysOnTime, daysPresent),
      };
    });

    // ------------------------------------------------------------
    // 4. Monthly totals, summed from the per-teacher rows so the KPI cards,
    //    the campus chart and the table can never disagree with each other.
    //    (The daily trend chart is a separate raw-arrivals view.)
    // ------------------------------------------------------------
    const totals = teacherBreakdown.reduce(
      (acc, teacher) => {
        acc.daysPresent += teacher.daysPresent;
        acc.daysOnTime += teacher.daysOnTime;
        acc.daysLate += teacher.daysLate;
        acc.daysAbsent += teacher.daysAbsent;
        return acc;
      },
      { daysPresent: 0, daysOnTime: 0, daysLate: 0, daysAbsent: 0 },
    );

    const totalScans = totals.daysOnTime + totals.daysLate;
    const workingDays = countWorkingDays(year, monthNumber);
    const totalStaff = teacherBreakdown.length;

    // "Total expected working days" = the staff-days the month should have
    // produced (weekdays x active staff).
    const expectedWorkingDays = workingDays * totalStaff;

    // Fix: total absences = expected staff-days - total days present (up to today/elapsed)
    const totalAbsencesCalculated = Math.max(0, expectedWorkingDays - totals.daysPresent);

    const analytics = {
      month,
      year,
      monthNumber,
      monthLabel,
      totalStaff,
      workingDays,
      expectedWorkingDays,
      totalPresent: totals.daysPresent,
      totalOnTime: totals.daysOnTime,
      totalLate: totals.daysLate,
      totalAbsent: totalAbsencesCalculated,
      totalScans,
      // Monthly attendance percentage
      attendanceRate: percentage(totals.daysPresent, expectedWorkingDays),
      // Punctuality percentage
      punctualityRate: percentage(totals.daysOnTime, totalScans),
    };

    // ------------------------------------------------------------
    // 5. Campus breakdown (aggregated from the teacher rows)
    // ------------------------------------------------------------
    const campusMap = new Map();

    teacherBreakdown.forEach((teacher) => {
      const entry = campusMap.get(teacher.campusName) || {
        campusName: teacher.campusName,
        staffCount: 0,
        daysPresent: 0,
        daysOnTime: 0,
        daysLate: 0,
        daysAbsent: 0,
      };

      entry.staffCount += 1;
      entry.daysPresent += teacher.daysPresent;
      entry.daysOnTime += teacher.daysOnTime;
      entry.daysLate += teacher.daysLate;
      entry.daysAbsent += teacher.daysAbsent;

      campusMap.set(teacher.campusName, entry);
    });

    const campusBreakdown = Array.from(campusMap.values())
      .map((campus) => ({
        ...campus,
        totalScans: campus.daysOnTime + campus.daysLate,
        attendanceRate: percentage(
          campus.daysPresent,
          workingDays * campus.staffCount,
        ),
        punctualityRate: percentage(campus.daysOnTime, campus.daysOnTime + campus.daysLate),
      }))
      .sort((a, b) => b.daysPresent - a.daysPresent);

    // ------------------------------------------------------------
    // 6. Daily trend, zero filled across the month's working days
    //    so the chart axis is continuous.
    // ------------------------------------------------------------
    const dailyMap = new Map(
      dailyRows.map((row) => [
        toDateKey(row.scan_date),
        {
          onTime: Number(row.on_time || 0),
          late: Number(row.late || 0),
          absent: Number(row.absent || 0),
        },
      ]),
    );

    const lastDayOfMonth = new Date(year, monthNumber, 0).getDate();
    const dailyTrend = [];

    for (let day = 1; day <= lastDayOfMonth; day++) {
      const weekday = new Date(year, monthNumber - 1, day).getDay(); // 0 Sun - 6 Sat

      // Working days only (Mon-Fri), matching the KPI cards
      if (weekday === 0 || weekday === 6) continue;

      const date = `${year}-${padTwo(monthNumber)}-${padTwo(day)}`;
      const counts = dailyMap.get(date) || { onTime: 0, late: 0, absent: 0 };

      dailyTrend.push({
        date,
        dayOfMonth: day,
        onTime: counts.onTime,
        late: counts.late,
        absent: counts.absent,
      });
    }

    return res.render("reports", {
      // Required by the shared layout: header user info + sidebar active state
      user: req.session.user,
      path: req.path,
      analytics,
      teacherBreakdown,
      campusBreakdown,
      dailyTrend,
      month,
      monthLabel,
      // ADM-04 export endpoint, scoped to the month on screen
      exportUrl: `/api/admin/reports/export?month=${month}`,
    });
  } catch (error) {
    console.error("Failed to build reports analytics:", error);

    return res.status(500).send("Internal Server Error");
  }
}

/**
 * GET /api/admin/reports/export
 * Download monthly attendance summary excel report
 *
 * ADM-05: accepts an optional ?month=YYYY-MM filter so the download matches
 * the month shown on the Reports & Analytics page. Without the parameter the
 * original ADM-04 behaviour (full report) is preserved.
 */
async function exportAttendanceReport(req, res) {
  try {
    const hasMonth =
      typeof req.query.month === "string" &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month);

    const { month, year, monthNumber } = resolveMonth(req.query.month);
    const { start, end } = monthBounds(year, monthNumber);

    const dateParams = hasMonth ? [start, end] : [];

    const [rows] = await db.execute(
      `
      SELECT
        t.full_name,
        COUNT(CASE WHEN al.status = 'On-Time' THEN 1 END) AS days_present,
        COUNT(CASE WHEN al.status = 'Late' THEN 1 END) AS days_late,
        COUNT(CASE WHEN al.status = 'Absent' THEN 1 END) AS days_absent
      FROM teachers t
      LEFT JOIN attendance_logs al
        ON t.id = al.teacher_id
        ${hasMonth ? "AND al.date BETWEEN ? AND ?" : ""}
      WHERE t.is_active = TRUE
      GROUP BY t.id, t.full_name
      ORDER BY t.full_name ASC
    `,
      dateParams,
    );

    const workbook = await excelService.generateAttendanceReport(rows);

    const fileName = hasMonth
      ? `attendance_report_${month}.xlsx`
      : "attendance_report.xlsx";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting attendance report:", error);
    res.status(500).json({
      message: "Failed to export attendance report",
      error: error.message,
    });
  }
}

// ============================================================
// STAFF MANAGEMENT
// ============================================================

/**
 * GET /api/admin/staff
 *
 * Returns all registered staff members.
 *
 * We JOIN campuses because teachers only stores campus_id.
 * The Staff page needs the actual campus name.
 */
async function getStaffList(req, res) {
  try {
    const [staff] = await db.execute(`
      SELECT
        teachers.id,
        teachers.full_name,
        teachers.position,
        teachers.campus_id,
        campuses.name AS campus_name,
        teachers.phone,
        teachers.strike_count,
        teachers.is_active,
        teachers.created_at

      FROM teachers

      INNER JOIN campuses
        ON teachers.campus_id = campuses.id

      ORDER BY teachers.full_name ASC
    `);

    const [campuses] = await db.execute(`
      SELECT
        id,
        name
      FROM campuses
      WHERE is_active = TRUE
      ORDER BY name ASC
    `);

    return res.status(200).json({
      status: "success",
      data: staff,
      campuses: campuses,
    });
  } catch (error) {
    console.error("get-staff-list failed:", error);

    return res.status(500).json({
      status: "error",
      message: "Could not load staff members.",
    });
  }
}

/**
 * PUT /api/admin/staff/:id
 *
 * Updates editable staff profile information.
 */
async function updateStaff(req, res) {
  try {
    const staffId = Number(req.params.id);

    const { full_name, position, campus_id, phone } = req.body;

    // Basic validation
    if (!staffId) {
      return res.status(400).json({
        status: "error",
        message: "Invalid staff ID.",
      });
    }

    if (!full_name || !position || !campus_id || !phone) {
      return res.status(400).json({
        status: "error",
        message: "All staff fields are required.",
      });
    }

    // Check that the staff member exists
    const [existingStaff] = await db.execute(
      "SELECT id FROM teachers WHERE id = ?",
      [staffId],
    );

    if (existingStaff.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Staff member not found.",
      });
    }

    // Check that campus exists
    const [campus] = await db.execute(
      "SELECT id FROM campuses WHERE id = ? AND is_active = TRUE",
      [campus_id],
    );

    if (campus.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Selected campus does not exist.",
      });
    }

    // Check whether phone belongs to another staff member
    const [phoneOwner] = await db.execute(
      "SELECT id FROM teachers WHERE phone = ? AND id <> ?",
      [phone, staffId],
    );

    if (phoneOwner.length > 0) {
      return res.status(409).json({
        status: "error",
        message: "This phone number is already used by another staff member.",
      });
    }

    await db.execute(
      `
      UPDATE teachers
      SET
        full_name = ?,
        position = ?,
        campus_id = ?,
        phone = ?
      WHERE id = ?
      `,
      [
        full_name.trim(),
        position.trim(),
        Number(campus_id),
        phone.trim(),
        staffId,
      ],
    );

    return res.status(200).json({
      status: "success",
      message: "Staff profile updated successfully.",
    });
  } catch (error) {
    console.error("update-staff failed:", error);

    return res.status(500).json({
      status: "error",
      message: "Could not update staff member.",
    });
  }
}

/**
 * POST /api/admin/staff/:id/reset-password
 *
 * Creates a new bcrypt password hash and stores it.
 */
async function resetStaffPassword(req, res) {
  try {
    const staffId = Number(req.params.id);
    const { new_password } = req.body;

    if (!staffId) {
      return res.status(400).json({
        status: "error",
        message: "Invalid staff ID.",
      });
    }

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({
        status: "error",
        message: "Password must be at least 6 characters.",
      });
    }

    const [staff] = await db.execute("SELECT id FROM teachers WHERE id = ?", [
      staffId,
    ]);

    if (staff.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Staff member not found.",
      });
    }

    const passwordHash = await bcrypt.hash(new_password, 12);

    await db.execute(
      `
      UPDATE teachers
      SET password_hash = ?
      WHERE id = ?
      `,
      [passwordHash, staffId],
    );

    return res.status(200).json({
      status: "success",
      message: "Password reset successfully.",
    });
  } catch (error) {
    console.error("reset-staff-password failed:", error);

    return res.status(500).json({
      status: "error",
      message: "Could not reset staff password.",
    });
  }
}

/**
 * PATCH /api/admin/staff/:id/deactivate
 *
 * Soft-deletes a staff account.
 */
async function deactivateStaff(req, res) {
  try {
    const staffId = Number(req.params.id);

    if (!staffId) {
      return res.status(400).json({
        status: "error",
        message: "Invalid staff ID.",
      });
    }

    const [result] = await db.execute(
      `
      UPDATE teachers
      SET is_active = FALSE
      WHERE id = ?
      `,
      [staffId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "error",
        message: "Staff member not found.",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Staff account deactivated successfully.",
    });
  } catch (error) {
    console.error("deactivate-staff failed:", error);

    return res.status(500).json({
      status: "error",
      message: "Could not deactivate staff member.",
    });
  }
}

/**
 * PATCH /api/admin/staff/:id/activate
 *
 * Reactivates a previously deactivated staff account.
 */
async function activateStaff(req, res) {
  try {
    const staffId = Number(req.params.id);

    if (!staffId) {
      return res.status(400).json({
        status: "error",
        message: "Invalid staff ID.",
      });
    }

    const [result] = await db.execute(
      `
      UPDATE teachers
      SET is_active = TRUE
      WHERE id = ?
      `,
      [staffId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: "error",
        message: "Staff member not found.",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Staff account activated successfully.",
    });
  } catch (error) {
    console.error("activate-staff failed:", error);

    return res.status(500).json({
      status: "error",
      message: "Could not activate staff member.",
    });
  }
}

module.exports = {
  // Admin Dashboard management
  getAttendanceSummary,
  getTodayAttendance,
  // settings management
  getSettings,
  updateSettings,
  getCampusSettings,
  saveCampusSettings,
  // Report export
  exportAttendanceReport,
  // Reports & analytics page
  getReportsAnalytics,
  // staff management
  getStaffList,
  updateStaff,
  resetStaffPassword,
  deactivateStaff,
  activateStaff,
};
