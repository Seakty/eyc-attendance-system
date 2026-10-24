-- Seed campuses only
DELETE FROM campuses WHERE name NOT IN ('Aziza School', 'Lakeside School', 'Youth School');
INSERT IGNORE INTO campuses (name, late_cutoff_time, latitude, longitude, radius_meters, is_active)
VALUES
  ('Aziza School', '08:15:00', 11.5564, 104.9282, 50, TRUE),
  ('Lakeside School', '08:15:00', 11.56, 104.93, 50, TRUE),
  ('Youth School', '08:15:00', 11.5564, 104.9282, 50, TRUE);
UPDATE campuses SET is_active = TRUE WHERE name IN ('Aziza School', 'Lakeside School', 'Youth School');
