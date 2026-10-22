require("dotenv").config();
require("dotenv").config();

const dns = require("dns");
const authRateLimiter = require("./middleware/rateLimitMiddleware");

dns.setServers(["8.8.8.8"]);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const User = require("./models/User");
const authRoutes = require("./routes/auth");


const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRateLimiter, authRoutes);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected successfully");
  })
  .catch((error) => {
    console.log("MongoDB connection failed:", error);
  });

app.get("/", (req, res) => {
  res.json({
    message: "Backend is running"
  });
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});