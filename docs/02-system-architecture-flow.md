# EYC Smart Attendance System — System Architecture & Step-by-Step Flow

## 1. End-to-End System Workflow

```
[Step 1: Registration] ──> [Step 2: First-Time Login] ──> [Step 3: Daily Scan]
   Staff web form             Telegram Mini App              GPS + QR Check
                                                                   │
                                                                   ▼
[Step 5: Admin Dashboard] <── [Step 4: Auto-Rules Processing] <────┘
   Live reports & Excel         Late calc / 3-strike checkout
```

## 2. Detailed Execution Steps

### Onboarding Phase
Staff open the registration web link, fill out their details (Name, Position, Campus, Phone Number, Password), and submit. Account details are encrypted and stored in the database.

### Authentication Phase
Staff launch the EYC Attendance Bot inside Telegram and tap "Open Scanner." On first launch, they log in using their credentials. The application saves a secure token locally so future launches go directly to the scanning interface.

### Check-In Phase
1. Staff tap "Check In."
2. The app requests device GPS coordinates and compares them against the school's stored GPS location using the Haversine distance formula.
3. **If inside the radius**: Camera activates → Staff scans fixed entrance QR poster → Backend records timestamp and marks status (On-Time or Late).
4. **If outside the radius**: Camera remains locked with a notification: "You must be on campus to check in."

### Check-Out Phase
Staff scan the QR code at the end of their shift to check out.

### Automated Background Rules (Cron Job)
At a scheduled time daily, the system evaluates open logs. If a staff member forgot to check out for more than 2 hours, the server performs an auto checkout and increments their strike count by 1. At 3 strikes, the record flags for admin review.

### Reporting Phase
Admins access the desktop Web Dashboard to view live tables or generate monthly attendance reports for payroll and operational records.

## 3. Value Delivered to Stakeholders

| Stakeholder | Value |
|---|---|
| **Staff** | No complex URLs or app store downloads. Check-in takes under 10 seconds inside an app they already open daily, with complete transparency into their monthly history. |
| **Admins** | Eliminates manual attendance tracking, reduces paper logs, enforces punctual reporting automatically, and generates monthly Excel sheets instantly. |
| **EYC Leadership** | Delivers a modern, location-verified operational tool with structured historical data for organizational oversight. |
