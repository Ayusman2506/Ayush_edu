
const rateLimit = require("express-rate-limit");

const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    message: "Too many OTP requests. Please try again later."
  }
});

module.exports = otpRateLimiter;
