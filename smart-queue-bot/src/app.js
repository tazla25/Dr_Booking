// src/app.js
// Express app — exports app without calling .listen()
// root index.js calls app.listen()
require('dotenv').config();
const express = require('express');
const { getQueueStatus } = require('./services/bookingService');

const app = express();

app.use(express.json());
app.use(express.static('public'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Live queue API — used by tracker.html
// GET /api/queue/:scheduleId/:date
app.get('/api/queue/:scheduleId/:date', async (req, res) => {
  try {
    const { scheduleId, date } = req.params;
    const status = await getQueueStatus(scheduleId, date);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
