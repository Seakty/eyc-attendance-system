const db = require('../db/db');
const QRCode = require('qrcode');

// 1. GET: Fetch campus settings & generate static entrance QR code
exports.getSettingsPage = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM campuses LIMIT 1');
        const settings = rows[0] || {};

        let qrCodeUrl = null;
        if (settings.id) {
            const qrData = JSON.stringify({
                campus_id: settings.id,
                type: 'ENTRANCE_QR'
            });
            qrCodeUrl = await QRCode.toDataURL(qrData);
        }

        res.render('admin/settings', { settings, qrCodeUrl });
    } catch (error) {
        console.error('Error fetching settings or generating QR code:', error);
        res.render('admin/settings', { settings: {}, qrCodeUrl: null });
    }
};

// 2. POST: Upsert (Insert or Update) campus settings in MySQL
exports.updateSettings = async (req, res) => {
    const { late_cutoff_time, school_lat, school_lng, gps_radius_meters } = req.body;

    try {
        const [existing] = await db.query('SELECT id FROM campuses LIMIT 1');

        if (existing.length > 0) {
            // Row exists -> UPDATE
            await db.query(
                `UPDATE campuses 
                 SET late_cutoff_time = ?, school_lat = ?, school_lng = ?, gps_radius_meters = ? 
                 WHERE id = ?`,
                [late_cutoff_time, school_lat, school_lng, gps_radius_meters, existing[0].id]
            );
        } else {
            // Database is empty -> INSERT primary campus
            await db.query(
                `INSERT INTO campuses (name, late_cutoff_time, school_lat, school_lng, gps_radius_meters) 
                 VALUES (?, ?, ?, ?, ?)`,
                ['Main Campus', late_cutoff_time, school_lat, school_lng, gps_radius_meters]
            );
        }

        res.redirect('/admin/settings');
    } catch (error) {
        console.error('Error saving settings to MySQL:', error);
        res.status(500).send('Failed to save settings: ' + error.message);
    }
};