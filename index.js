const express = require("express");
const app = express();
const http = require("http");
const cors = require("cors");
const connect = require("./config/db");
const Router = require("./routes/routes"); // your main routes
const paymentsRoutes = require("./routes/payments"); // new

const bodyParser = require("body-parser"); // <-- add this

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// mount your existing routes
app.use("/", Router);

// mount payments JSON endpoints:
// these endpoints use express.json() so normal parser is fine:
app.use("/api/payments", paymentsRoutes);

// IMPORTANT: webhook must be registered with raw parser BEFORE any JSON parser for that path.
// The best approach is to register it explicitly here:
const { razorpayWebhook } = require("./controllers/paymentsController");
// raw body parser for webhooks
app.post(
  "/api/payments/webhook",
  bodyParser.raw({ type: "application/json" }),
  razorpayWebhook
);

// health route
app.get("/", (req, res) => {
  res.send("Running Orchid server");
});

require("dotenv").config();
const port = process.env.PORT || 8000;

const server = http.createServer(app);

server.listen(port, async () => {
  try {
    await connect();
    console.log("connected to db");
    console.log(`server running on port ${port}`);
  } catch (err) {
    console.log(err);
  }
});
