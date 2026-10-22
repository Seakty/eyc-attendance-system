-- =========================================================
-- 002 — Multi-campus settings
--
-- The settings for each location already live per-row on the
-- `campuses` table (there is no single key-value `settings`
-- table), so no extra campus_settings table is required.
--
-- This migration renames the location settings columns to the
-- canonical names used by the settings page / admin API:
--
--   school_lat        -> latitude      DECIMAL(10, 8)
--   school_lng        -> longitude     DECIMAL(11, 8)
--   gps_radius_meters -> radius_meters INT DEFAULT 50
--
-- `late_cutoff_time` (TIME, default '08:15:00') already exists
-- and is untouched.
--
-- Every statement below is guarded through INFORMATION_SCHEMA so
-- the file is safe to re-run on any machine, any number of times.
-- =========================================================

-- 1. school_lat -> latitude
SET @sql := IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'campuses'
       AND COLUMN_NAME  = 'school_lat'
  ) AND NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'campuses'
       AND COLUMN_NAME  = 'latitude'
  ),
  'ALTER TABLE campuses CHANGE COLUMN school_lat latitude DECIMAL(10, 8) NOT NULL',
  'SELECT 1'
);
PREPARE rename_school_lat FROM @sql;
EXECUTE rename_school_lat;
DEALLOCATE PREPARE rename_school_lat;

-- 2. school_lng -> longitude
SET @sql := IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'campuses'
       AND COLUMN_NAME  = 'school_lng'
  ) AND NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'campuses'
       AND COLUMN_NAME  = 'longitude'
  ),
  'ALTER TABLE campuses CHANGE COLUMN school_lng longitude DECIMAL(11, 8) NOT NULL',
  'SELECT 1'
);
PREPARE rename_school_lng FROM @sql;
EXECUTE rename_school_lng;
DEALLOCATE PREPARE rename_school_lng;

-- 3. gps_radius_meters -> radius_meters
SET @sql := IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'campuses'
       AND COLUMN_NAME  = 'gps_radius_meters'
  ) AND NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'campuses'
       AND COLUMN_NAME  = 'radius_meters'
  ),
  'ALTER TABLE campuses CHANGE COLUMN gps_radius_meters radius_meters INT NOT NULL DEFAULT 50',
  'SELECT 1'
);
PREPARE rename_gps_radius FROM @sql;
EXECUTE rename_gps_radius;
DEALLOCATE PREPARE rename_gps_radius;

-- 4. Normalize defaults so every campus row carries a usable
--    late cutoff and geofence radius even if older rows predate
--    these defaults (no-ops when the values are already set).
ALTER TABLE campuses
  MODIFY COLUMN late_cutoff_time TIME NOT NULL DEFAULT '08:15:00',
  MODIFY COLUMN radius_meters INT NOT NULL DEFAULT 50;
