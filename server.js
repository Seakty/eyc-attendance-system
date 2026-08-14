const express = require('express');
const app = express();
const authRoutes = require('./routes/auth'); // Import auth routes 

// Middleware សម្រាប់ parse JSON body
app.use(express.json());

// ភ្ជាប់ Routes សម្រាប់ Auth APIs (/api/auth/register, /api/auth/login)
app.use('/api/auth', authRoutes);

// Health check route សម្រាប់តេស្តមើលថា server ដើរឬអត់
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running normally' });
});

// កំណត់ Port សម្រាប់ Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
