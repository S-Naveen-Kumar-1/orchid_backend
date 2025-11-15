// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser'); // for webhook raw
const cors = require('cors');
const http = require('http');
const path = require('path');

const connect = require('./config/db'); // DB connect
const userRoutes = require('./routes/routes');
const paymentsRoutes = require('./routes/payments');
const { razorpayWebhook } = require('./controllers/paymentsController');

const app = express();

// Basic logger (dev)
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.originalUrl);
  next();
});

app.use(cors());

// Serve or ignore favicon to avoid accidental route param matching
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// Register raw parser + webhook route BEFORE JSON parser
app.post('/api/payments/webhook', bodyParser.raw({ type: 'application/json' }), razorpayWebhook);

// Now register standard JSON parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount routes
app.use('/api/payments', paymentsRoutes);
app.use('/', userRoutes);

// Health
app.get('/', (req, res) => res.status(200).send('Running Orchid server'));

// 404
app.use((req, res) => res.status(404).json({ message: 'Not Found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

const port = process.env.PORT || 8000;
const server = http.createServer(app);

server.listen(port, async () => {
  try {
    await connect();
    console.log('Connected to DB');
    console.log(`Server running on port ${port}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
});

// graceful shutdown
const shutdown = () => {
  console.log('Shutting down...');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forceful shutdown');
    process.exit(1);
  }, 10000);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
