import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import connect from "./config/db.js";
import Router from "./routes/routes.js";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());
app.use("/", Router);

app.get("/", (req, res) => {
  res.send("Running Orchid server");
});

const server = http.createServer(app);
const port = process.env.PORT || 8000;

server.listen(port, async () => {
  try {
    await connect();
    console.log("Connected to DB");
    console.log(`Server running on port ${port}`);
  } catch (err) {
    console.error(err);
  }
});
