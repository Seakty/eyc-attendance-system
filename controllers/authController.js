const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// 1. Register API (POST /api/auth/register)
exports.register = async (req, res) => {
  const { fullName, position, campus_id, phone, password } = req.body;

  try {
    // ឆែកមើលលេខទូរស័ព្ទក្នុងតារាង teachers ជាមួយ MySQL syntax
    const [existingUsers] = await pool.execute('SELECT * FROM teachers WHERE phone = ?', [phone]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'លេខទូរស័ព្ទនេះត្រូវបានប្រើប្រាស់រួចហើយ' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert ចូលតារាង teachers ដោយប្រើ password_hash និង campus_id
    const [result] = await pool.execute(
      'INSERT INTO teachers (full_name, position, campus_id, phone, password_hash) VALUES (?, ?, ?, ?, ?)',
      [fullName, position, campus_id, phone, hashedPassword]
    );

    res.status(201).json({ 
      message: 'ចុះឈ្មោះជោគជ័យ', 
      userId: result.insertId 
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

// 2. Login API (POST /api/auth/login)
exports.login = async (req, res) => {
  const { phone, password } = req.body;

  try {
    const [rows] = await pool.execute('SELECT * FROM teachers WHERE phone = ?', [phone]);
    if (rows.length === 0) {
      return res.status(400).json({ message: 'លេខទូរស័ព្ទ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'លេខទូរស័ព្ទ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ' });
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.position },
      process.env.JWT_SECRET || 'your_secret_key',
      { expiresIn: '1d' }
    );

    res.json({
      message: 'ចូលប្រើប្រាស់ជោគជ័យ',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        phone: user.phone,
        position: user.position
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};
