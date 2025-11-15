// server.js (fixed & annotated)
// - Ensures webhook raw parser is registered BEFORE the JSON parser for that path.
// - Adds a favicon handler to avoid accidental route matching like /favicon.ico -> /users/:id
// - Adds simple request logging (safe for dev) and a catch-all 404 handler.
// - Keeps existing route mounts but mounts webhook correctly.

require('dotenv').config(); // load env early

const express = require('express');
const bodyParser = require('body-parser'); // used for raw webhook body
const cors = require('cors');
const http = require('http');

const connect = require('./config/db');
const Router = require('./routes/routes'); // your main router (keeps same mount as before)
const paymentsRoutes = require('./routes/payments'); // payments endpoints
const { razorpayWebhook } = require('./controllers/paymentsController');

const app = express();

// === Basic middleware ===
app.use(cors());

// Simple request logger (remove or reduce in production)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} -> ${req.method} ${req.originalUrl}`);
  next();
});

// === Serve or ignore favicon to prevent accidental route param matching ===
// If you have a real favicon file in ./public/favicon.ico, uncomment the static serve line below.
// Otherwise we respond with 204 No Content which avoids matching other routes (like /:id).
app.get('/favicon.ico', (req, res) => res.sendStatus(204));
// app.use('/favicon.ico', express.static(path.join(__dirname, 'public', 'favicon.ico')));

// === Important: register webhook raw parser BEFORE general JSON parser ===
// Razorpay requires raw body for signature verification. We register the raw parser specifically
// for the webhook route so other routes still get parsed by express.json() as normal.
app.post('/api/payments/webhook', bodyParser.raw({ type: 'application/json' }), razorpayWebhook);

// Now register general parsers for the rest of the app
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === Mount API routes ===
// Keep the mounts consistent with your existing code so other files don't need changes.
app.use('/api/payments', paymentsRoutes); // normal JSON-based payment endpoints (create-order, verify-payment)
app.use('/', Router); // your main existing router

// Health route (explicit)
app.get('/', (req, res) => {
  res.status(200).send('Running Orchid server');
});

// 404 for anything not handled (helps avoid accidental route matches)
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

// Global error handler (optional — keeps errors consistent)
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err && err.stack ? err.stack : err);
  // If headers already sent, delegate to default handler
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

// === Start server and connect to DB ===
const port = process.env.PORT || 8000;
const server = http.createServer(app);

server.listen(port, async () => {
  try {
    await connect();
    console.log('connected to db');
    console.log(`server running on port ${port}`);
  } catch (err) {
    console.error('Failed to connect to DB or start server:', err);
    process.exit(1);
  }
});

// Graceful shutdown (optional, recommended)
const shutdown = async () => {
  console.log('Shutting down...');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error('Forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
