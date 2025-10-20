const mongoose = require("mongoose");

const env = require("dotenv").config();

let connect = () => {
  return mongoose.connect(process.env.mongoUrl);
};

module.exports = connect;
