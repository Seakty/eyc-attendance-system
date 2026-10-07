-- 001-add-role.sql
-- Applied automatically by `npm run db:migrate` (tracked in schema_migrations).
-- The runner skips the ALTER below when teachers.role already exists, so this
-- file is safe to run more than once and on databases created from schema.sql.

USE eyc_attendance;

ALTER TABLE teachers
  ADD COLUMN role ENUM('staff', 'admin') NOT NULL DEFAULT 'staff' AFTER position;

-- Make yourself (or the real admin) an admin. Change the phone number!
-- UPDATE teachers SET role = 'admin' WHERE phone = '012345678';
-- Tip: prefer `npm run db:seed`, which creates a ready-made admin account.
