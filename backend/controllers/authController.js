import userModel from "../models/userModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import transporter from "../config/nodemailer.js";

export const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.json({ success: false, message: "Missing details" });
  }

  try {
    const existingUser = await userModel.findOne({ email });

    if (existingUser) {
      return res.json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new userModel({ name, email, password: hashedPassword });
    await newUser.save();

    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { 
      expiresIn: "7d" 
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ 
      success: true,
      userData: {
        name: newUser.name
      }
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({ success: false, message: "Missing details" });
  }

  try {
    const user = await userModel.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      userData: {
        name: user.name,
      },
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    });

    res.json({ success: true, message: "Logged Out" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

export const sendResetOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, message: "Email is required" });
  }

  try {
    const user = await userModel.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));

    user.resetOtp = otp;
    user.resetOtpExpireAt = Date.now() + 15 * 60 * 1000;

    await user.save();

    const mailOption = {
      from: process.env.SENDER_EMAIL,
      to: user.email,
      subject: "Password Reset OTP",
      text: `Your otp is ${otp}. Reset your password using this otp.`,
    };
    await transporter.sendMail(mailOption);

    return res.json({ success: true, message: "Otp sent to your email." });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.json({
      success: false,
      message: "Email, OTP, and new password are required",
    });
  }

  try {
    const user = await userModel.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    if (user.resetOtp === "" || user.resetOtp !== otp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }

    if (user.resetOtpExpireAt < Date.now()) {
      return res.json({ success: false, message: "OTP Expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;

    user.resetOtp = "";
    user.resetOtpExpireAt = 0;

    await user.save();

    return res.json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

export const sendVerifyOtp = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await userModel.findById(userId);

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Save OTP to user
    user.verifyOtp = otp;
    user.verifyOtpExpireAt = otpExpiry;
    await user.save();

    // Send email
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: user.email,
      subject: "Verify Your Email",
      html: `Your verification code is: <strong>${otp}</strong>. Valid for 10 minutes.`,
    });

    res.json({ success: true, message: "Verification code sent" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

export const verifyEmail = async (req, res) => {
  const { otp } = req.body;
  const userId = req.user.id;

  try {
    const user = await userModel.findById(userId);

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    if (user.verifyOtp !== otp) {
      return res.json({ success: false, message: "Invalid OTP" });
    }

    if (Date.now() > user.verifyOtpExpireAt) {
      return res.json({ success: false, message: "OTP expired" });
    }

    user.isAccountVerified = true;
    user.verifyOtp = "";
    user.verifyOtpExpireAt = 0;
    await user.save();

    res.json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
