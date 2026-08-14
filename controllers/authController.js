const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// 1. Register API (POST /api/auth/register)
exports.register = async (req, res) => {
  const { fullName, position, campus, phone, password } = req.body;

  try {
    const userExist = await pool.query('SELECT * FROM staff WHERE phone = $1', [phone]);
    if (userExist.rows.length > 0) {
      return res.status(400).json({ message: 'លេខទូរស័ព្ទនេះត្រូវបានប្រើប្រាស់រួចហើយ' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = await pool.query(
      'INSERT INTO staff (full_name, position, campus, phone, password) VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, phone',
      [fullName, position, campus, phone, hashedPassword]
    );

    res.status(201).json({ message: 'ចុះឈ្មោះជោគជ័យ', user: newUser.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

// 2. Login API (POST /api/auth/login)
exports.login = async (req, res) => {
  const { phone, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM staff WHERE phone = $1', [phone]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'លេខទូរស័ព្ទ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'លេខទូរស័ព្ទ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ' });
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone },
      process.env.JWT_SECRET || 'your_secret_key',
      { expiresIn: '1d' }
    );

    res.json({ message: 'ចូលប្រើប្រាស់ជោគជ័យ', token });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};
