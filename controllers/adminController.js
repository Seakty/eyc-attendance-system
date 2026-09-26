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

/**
 * GET /api/admin/reports/export
 * Download monthly attendance summary excel report
 */
async function exportAttendanceReport(req, res) {
  try {
    const [rows] = await db.execute(`
      SELECT 
        u.full_name,
        COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS days_present,
        COUNT(CASE WHEN a.status = 'late' THEN 1 END) AS days_late,
        COUNT(CASE WHEN a.status = 'absent' THEN 1 END) AS days_absent,
        COALESCE(SUM(a.strike_count), 0) AS strike_count
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id
      WHERE u.role = 'teacher' OR u.role = 'staff'
      GROUP BY u.id, u.full_name
    `);

    const workbook = await excelService.generateAttendanceReport(rows);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Attendance_Report_${Date.now()}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.status(200).end();
  } catch (error) {
    console.error("Export Excel error:", error);
    res.status(500).json({ message: "Server error exporting report" });
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

    const {
      full_name,
      position,
      campus_id,
      phone,
    } = req.body;

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

    const [staff] = await db.execute(
      "SELECT id FROM teachers WHERE id = ?",
      [staffId],
    );

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
  getAttendanceSummary,
  getTodayAttendance,
  getSettings,
  //staff management
  updateSettings,
  exportAttendanceReport,
};
  getStaffList,
  updateStaff,
  resetStaffPassword,
  deactivateStaff,
  activateStaff,  
};
