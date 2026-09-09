require('dotenv').config();

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const audioRoutes = require('./routes/audio');
const venueRoutes = require('./routes/venues');
const userRoutes = require('./routes/users');

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));

app.use(express.json());


// ROUTES

app.use('/api/auth', authRoutes);

app.use('/api/audio', audioRoutes);

app.use('/api/venues', venueRoutes);
app.use('/api/users', userRoutes);

// HEALTH CHECK

app.get('/health', (req, res) => {

  res.json({
    ok: true
  });

});


const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {

  console.log(
    `SoundScout backend running on port ${PORT}`
  );

});