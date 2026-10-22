const express = require("express");
const User = require("../models/User");
const bcrypt = require("bcrypt");
const otpGenerator = require("otp-generator");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/authMiddleware");
const transporter = require("../config/email");
const otpRateLimiter = require("../middleware/otpRateLimitMiddleware");

const router = express.Router();

router.post("/signup", otpRateLimiter, async (req, res) => {
  const { name, email, mobile, password } = req.body;

const existingUser = await User.findOne({
  $or: [
    { email },
    { mobile }
  ]
});

if (existingUser) {
  if (existingUser.email === email) {
    return res.status(409).json({
      message: "Email already exists"
    });
  }

  if (existingUser.mobile === mobile) {
    return res.status(409).json({
      message: "Mobile number already exists"
    });
  }
}

const hashedPassword = await bcrypt.hash(password, 10);
  const otp = otpGenerator.generate(6, {
    digits: true,
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false
  });
  const user = new User({
  name,
  email,
  mobile,
  password: hashedPassword,
  emailOTP: otp,
  emailOTPExpires: new Date(Date.now() + 5 * 60 * 1000)
});
  await user.save();
  await transporter.sendMail({
  from: process.env.EMAIL_USER,
  to: email,
  subject: "Your OTP for Signup",
  text: `Your OTP is ${otp}. It is valid for 5 minutes.`
});

  res.json({
    message: "User registered successfully"
  });
});

router.post("/verify-otp", async (req, res) => {

  console.log("VERIFY OTP REQUEST:", req.body);

  const { email, otp } = req.body;

  console.log("EMAIL:", email);
  console.log("OTP:", otp);

  const user = await User.findOne({ email });

  console.log("USER FOUND:", user ? "YES" : "NO");

  if (user) {
    console.log("DATABASE OTP:", user.emailOTP);
    console.log("ENTERED OTP:", otp);
    console.log("OTP MATCH:", user.emailOTP === otp);
    console.log("OTP EXPIRES:", user.emailOTPExpires);
  }

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    });
  }

  if (user.emailOTP !== otp) {
    return res.status(400).json({
      message: "Invalid OTP"
    });
  }

  if (user.emailOTPExpires < new Date()) {
    return res.status(400).json({
      message: "OTP has expired"
    });
  }

  const result = await User.updateOne(
  { _id: user._id },
  {
    $set: {
      emailVerified: true
    },
    $unset: {
      emailOTP: "",
      emailOTPExpires: ""
    }
  }
);

  res.json({
    message: "OTP verified successfully"
  });
});

router.post("/resend-otp", otpRateLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required"
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        message: "Email is already verified"
      });
    }

    const now = new Date();
    const cooldownMs = 60 * 1000;
    const windowMs = 24 * 60 * 60 * 1000;

    // Check the 60-second cooldown
    if (user.emailOTPSentAt) {
      const elapsed = now.getTime() - user.emailOTPSentAt.getTime();

      if (elapsed < cooldownMs) {
        const remainingSeconds = Math.ceil(
          (cooldownMs - elapsed) / 1000
        );

        return res.status(429).json({
          message: "Please wait before requesting another OTP",
          remainingSeconds
        });
      }
    }

    // Check the 24-hour resend limit
    let resendCount = user.otpResendCount || 0;
    let windowStart = user.otpResendWindowStart;

    if (
      !windowStart ||
      now.getTime() - windowStart.getTime() >= windowMs
    ) {
      resendCount = 0;
      windowStart = now;
    }

    if (resendCount >= 5) {
      const resetTime = new Date(
        windowStart.getTime() + windowMs
      );

      return res.status(429).json({
        message: "Maximum of 5 OTP resends reached in 24 hours",
        nextAllowedAt: resetTime
      });
    }

    // Generate a new OTP
    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false
    });

    // Replace the previous OTP
    user.emailOTP = otp;
    user.emailOTPExpires = new Date(
      now.getTime() + 5 * 60 * 1000
    );

    user.emailOTPSentAt = now;
    user.otpResendCount = resendCount + 1;
    user.otpResendWindowStart = windowStart;

    await User.updateOne(
  { _id: user._id },
  {
    $set: {
      emailOTP: otp,
      emailOTPExpires: user.emailOTPExpires,
      emailOTPSentAt: now,
      otpResendCount: resendCount + 1,
      otpResendWindowStart: windowStart
    }
  }
);

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your New OTP for Signup",
      text: `Your new OTP is ${otp}. It is valid for 5 minutes.`
    });

    return res.status(200).json({
      message: "New OTP sent successfully",
      remainingResends: 5 - user.otpResendCount
    });

  } catch (error) {
    console.error("Resend OTP error:", error);

    return res.status(500).json({
      message: "Unable to resend OTP"
    });
  }
});
  

router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        message: "Please verify your email first"
      });
    }

    const now = new Date();
    const windowMs = 24 * 60 * 60 * 1000;

    let failedAttempts = user.loginFailedAttempts || 0;
    let windowStart = user.loginAttemptWindowStart;

    // Start a new 24-hour window if needed
    if (
      !windowStart ||
      now.getTime() - windowStart.getTime() >= windowMs
    ) {
      failedAttempts = 0;
      windowStart = now;
    }

    // Block login after 3 failed attempts
    if (failedAttempts >= 3) {
      const resetTime = new Date(
        windowStart.getTime() + windowMs
      );

      return res.status(429).json({
        message: "Too many incorrect password attempts. Try again after 24 hours.",
        nextAllowedAt: resetTime
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      failedAttempts += 1;

      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            loginFailedAttempts: failedAttempts,
            loginAttemptWindowStart: windowStart
          }
        }
      );

      if (failedAttempts >= 3) {
        return res.status(429).json({
          message: "Too many incorrect password attempts. Try again after 24 hours."
        });
      }

      return res.status(401).json({
        message: "Invalid email or password",
        remainingAttempts: 3 - failedAttempts
      });
    }

    // Reset failed attempts after successful login
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          loginFailedAttempts: 0,
          loginAttemptWindowStart: null
        }
      }
    );

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.json({
      message: "Signin successful",
      accessToken: token
    });

  } catch (error) {
    console.error("Signin error:", error);

    return res.status(500).json({
      message: "Unable to sign in"
    });
  }
});


router.get("/profile", authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.userId).select("-password");

  res.json({
    user
  });
});

router.get("/test-email", async (req, res) => {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: "Auth Backend Email Test",
    text: "Email sending is working successfully."
  });

  res.json({
    message: "Test email sent successfully"
  });
});

module.exports = router;