// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.mongoUrl;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');
};

const paymentsRoutes = require('./routes/payments');
const mainRoutes = require('./routes/routes');
const { razorpayWebhook } = require('./controllers/paymentsController');

const app = express();
app.use(cors());

// avoid favicon interfering
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// register webhook raw handler BEFORE express.json for that path
app.post('/api/payments/webhook', bodyParser.raw({ type: 'application/json' }), razorpayWebhook);

// normal JSON parsers for other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// mounts
app.use('/api/payments', paymentsRoutes);
app.use('/', mainRoutes);

// health
app.get('/', (req, res) => res.send('Running Orchid server'));

// 404
app.use((req, res) => res.status(404).json({ message: 'Not Found' }));

// error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

const port = process.env.PORT || 8000;
const server = http.createServer(app);

server.listen(port, async () => {
  try {
    await connectDB();
    console.log(`Server running on port ${port}`);
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
