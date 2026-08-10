# EYC Smart Attendance System — Project Structure & Tech Stack Recommendations

## 1. Recommended Tech Stack

| Layer | Technology | Selection Rationale |
|---|---|---|
| Backend API | Node.js + Express | Lightweight, fast runtime with native JSON handling for Telegram APIs. |
| Database | PostgreSQL | Robust relational database ensuring full data persistence (hosted on Supabase or Neon free tier). |
| Staff Interface | Telegram Mini App (HTML5 / Tailwind / JS) | Native Telegram integration using `@twa-dev/sdk` for camera and GPS access. |
| Admin Portal | Node.js + EJS Templates + Tailwind CSS | Fast server-rendered pages allowing rapid development of dashboards without build overhead. |
| Scheduled Tasks | node-cron | Background worker for automated check-out processing and strike tracking. |
| Reporting | exceljs | Utility for formatting and generating structured monthly Excel workbooks. |

## 2. Proposed Project Folder Structure

```
eyc-attendance-system/
├── package.json
├── .env.example                # Environment variables (DB URI, Telegram Bot Token, Secret Keys)
├── server.js                   # Application entry point & Express setup
│
├── config/
│   └── database.js             # PostgreSQL connection pool settings
│
├── db/
│   ├── schema.sql              # Database table definitions (users, logs, settings)
│   └── seed.sql                # Initial admin account setup script
│
├── routes/
│   ├── auth.js                 # Registration & Login endpoints
│   ├── miniapp.js              # Telegram Mini App camera & check-in endpoints
│   └── admin.js                # Web Dashboard CRUD & Excel export routes
│
├── controllers/
│   ├── authController.js       # Authentication logic & token management
│   ├── attendanceController.js # GPS validation, QR verification, status calculation
│   └── adminController.js      # Admin reporting & staff management
│
├── services/
│   ├── cronService.js          # Scheduled tasks for auto-checkout & 3-strike rules
│   └── excelService.js         # Excel report generator engine
│
├── utils/
│   ├── geofence.js             # Haversine distance calculation formula
│   └── telegramAuth.js         # Cryptographic verification for Telegram initData
│
├── views/                      # Admin Web Dashboard (EJS Templates)
│   ├── login.ejs
│   ├── dashboard.ejs
│   ├── staff.ejs
│   ├── reports.ejs
│   └── partials/
│       ├── header.ejs
│       └── footer.ejs
│
└── public/                     # Static assets served to Telegram Mini App & Admin Portal
    ├── miniapp/
    │   ├── index.html          # Main Mini App UI (Scan & Calendar Tabs)
    │   ├── app.js              # Camera handler, GPS requester, API caller
    │   └── style.css
    └── admin/
        └── custom.css
```
