# EYC Smart Attendance System — Requirement Analysis

## 1. Project Purpose

The EYC Smart Attendance System is designed to streamline daily attendance for school teachers and staff through a zero-friction Telegram Mini App. The system combines GPS geofencing with physical QR scanning to ensure accurate, location-verified attendance tracking, paired with an automated administrative dashboard for real-time reporting.

## 2. Functional Requirements

### Staff / Teacher Features (Telegram Mini App)

- **Self-Registration Portal**: A web-based form where staff register their details (Full Name, Position, School/Campus) and set account credentials.
- **One-Time Persistent Authentication**: Secure initial login within the Telegram Mini App. Subsequent opens automatically authenticate the user without re-entering credentials.
- **Geofenced QR Scanning**:
  - Built-in browser camera integration for scanning entrance QR codes.
  - Real-time GPS location check verifying the staff member is physically within the designated school boundary (e.g., 100-meter radius) before unlocking the scanner.
- **Attendance Status Calculation**:
  - On-Time / Late Tracking: Automatic status assignment based on customizable arrival cutoff times.
  - Automated Check-Out & 3-Strike Rule: If check-out is missed for more than 2 hours post-shift, an automated background job checks the staff out. Reaching 3 automated check-outs flags the record for admin review as a potential half-day absence.
- **Personal Attendance History**: A calendar and list view within the Mini App allowing staff to track their daily logs, check-in/out times, and monthly attendance summary.

### Admin Features (Web Dashboard)

- **Live Attendance Dashboard**: Real-time visibility into today's check-ins, check-outs, late arrivals, and unverified/flagged scans.
- **Staff Account Management (CRUD)**: Ability to review, approve, edit, or deactivate registered staff profiles.
- **System Settings Panel**: Configuration options for school GPS coordinates, geofence radius, official work shift schedules, and late cutoff thresholds.
- **Export & Reporting**: One-click monthly attendance summary reports exported directly into Excel format (.xlsx).

## 3. Non-Functional Requirements

- **Usability**: Zero installation required for staff; operates natively inside Telegram.
- **Data Integrity & Persistence**: Relational database storage ensuring logs are permanently saved across server reboots.
- **Security**: Hashed passwords (bcrypt), secure session tokens (JWT), and cryptographic verification of Telegram user payload (initData).
