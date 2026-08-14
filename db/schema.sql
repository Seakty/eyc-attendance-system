-- =========================================================
-- EYC Attendance System — Schema 
-- =========================================================

CREATE DATABASE IF NOT EXISTS eyc_attendance;
USE eyc_attendance;

-- ---------------------------------------------------------
-- 1. Campuses
-- Each campus has its own GPS coordinates, radius, and
-- late-cutoff time, since EYC operates more than one site.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS campuses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    late_cutoff_time TIME NOT NULL DEFAULT '08:15:00',
    school_lat DECIMAL(10, 8) NOT NULL,
    school_lng DECIMAL(11, 8) NOT NULL,
    gps_radius_meters INT NOT NULL DEFAULT 50,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------
-- 2. Teachers (Staff Profiles & Auth)
-- campus is now a foreign key instead of free text, and
-- soft-delete (is_active) replaces hard deletion so
-- attendance history is never silently lost.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS teachers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    position VARCHAR(100) NOT NULL,
    campus_id INT NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    telegram_id VARCHAR(100) UNIQUE,        -- Nullable until they link Telegram
    strike_count INT DEFAULT 0,             -- Derived/cached; source of truth is `strikes` table
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE RESTRICT,
    INDEX idx_teachers_campus (campus_id)
);

-- ---------------------------------------------------------
-- 3. Attendance Logs (the daily scans)
-- - DATETIME instead of TIME, so ordering/timezone/auto-checkout
--   logic is unambiguous.
-- - UNIQUE(teacher_id, date) prevents duplicate rows per day.
-- - Stores the actual check-in coordinates for dispute/audit.
-- - ON DELETE RESTRICT protects attendance history from
--   disappearing if a teacher row is ever removed.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    date DATE NOT NULL,
    check_in_at DATETIME,
    check_in_lat DECIMAL(10, 8),
    check_in_lng DECIMAL(11, 8),
    check_out_at DATETIME,
    status ENUM('On-Time', 'Late', 'Absent') DEFAULT 'Absent',
    gps_verified BOOLEAN DEFAULT FALSE,
    auto_checked_out BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE RESTRICT,
    UNIQUE KEY uq_teacher_date (teacher_id, date),
    INDEX idx_attendance_date (date)
);

-- ---------------------------------------------------------
-- 4. Strikes (audit trail behind teachers.strike_count)
-- Each strike references the log that triggered it (if any)
-- and records why, so strike_count is derivable/auditable
-- instead of being the only record of what happened.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS strikes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    attendance_log_id INT,
    reason VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE RESTRICT,
    FOREIGN KEY (attendance_log_id) REFERENCES attendance_logs(id) ON DELETE SET NULL,
    INDEX idx_strikes_teacher (teacher_id)
);

-- ---------------------------------------------------------
-- 5. Seed default campuses
-- Idempotent this time: name is UNIQUE, so re-running this
-- script updates the existing row instead of duplicating it.
-- Replace with real campus names/coordinates.
-- ---------------------------------------------------------
INSERT INTO campuses (name, late_cutoff_time, school_lat, school_lng, gps_radius_meters)
VALUES ('Main Campus', '08:15:00', 11.5564, 104.9282, 50)
ON DUPLICATE KEY UPDATE
    late_cutoff_time = VALUES(late_cutoff_time),
    school_lat = VALUES(school_lat),
    school_lng = VALUES(school_lng),
    gps_radius_meters = VALUES(gps_radius_meters);

-- Add one INSERT per additional campus, e.g.:
-- INSERT INTO campuses (name, late_cutoff_time, school_lat, school_lng, gps_radius_meters)
-- VALUES ('Second Campus', '08:15:00', 0.00000000, 0.00000000, 50)
-- ON DUPLICATE KEY UPDATE
--     late_cutoff_time = VALUES(late_cutoff_time),
--     school_lat = VALUES(school_lat),
--     school_lng = VALUES(school_lng),
--     gps_radius_meters = VALUES(gps_radius_meters);