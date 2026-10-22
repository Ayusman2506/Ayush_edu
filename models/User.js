const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true
  },

  email: {
    type: String,
    required: true,
    unique: true
  },

  mobile: {
    type: String,
    required: true,
    unique: true
  },

  password: {
    type: String,
    required: true
  },

  emailOTP: {
    type: String
  },

  emailOTPExpires: {
    type: Date
  },
  emailOTPSentAt: {
  type: Date,
  default: null
},
  otpResendCount: {
  type: Number,
  default: 0
},

otpResendWindowStart: {
  type: Date,
  default: null
},
loginFailedAttempts: {
  type: Number,
  default: 0
},

loginAttemptWindowStart: {
  type: Date,
  default: null
},

  emailVerified: {
    type: Boolean,
    default: false
  },

  googleId: {
    type: String
  }

});

const User = mongoose.model("User", userSchema);

module.exports = User;