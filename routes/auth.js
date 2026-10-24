const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const db = require('../config/database');

router.get('/schools', async (req, res) => {
  try {
    const [campusRows] = await db.execute(
      "SELECT id, name, is_active FROM campuses WHERE is_active = TRUE ORDER BY name ASC"
    );
    return res.json({ status: 'success', data: campusRows });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: 'Failed to load schools' });
  }
});

router.get('/campuses', async (req, res) => {
  try {
    const [campusRows] = await db.execute(
      "SELECT id, name, is_active FROM campuses WHERE is_active = TRUE ORDER BY name ASC"
    );
    return res.json({ status: 'success', data: campusRows });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: 'Failed to load campuses' });
  }
});

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);

module.exports = router;
