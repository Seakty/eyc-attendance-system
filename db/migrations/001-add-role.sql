-- Run this ONCE on your existing database (e.g. in MySQL Workbench / phpMyAdmin).
USE eyc_attendance;

ALTER TABLE teachers
  ADD COLUMN role ENUM('staff', 'admin') NOT NULL DEFAULT 'staff' AFTER position;

-- Make yourself (or the real admin) an admin. Change the phone number!
-- UPDATE teachers SET role = 'admin' WHERE phone = '012345678';
