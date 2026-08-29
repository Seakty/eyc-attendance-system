const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// GET /admin/settings -> Render settings form & QR code
router.get('/settings', adminController.getSettingsPage);

// POST /admin/settings -> Save settings to MySQL
router.post('/settings', adminController.updateSettings);

module.exports = router;