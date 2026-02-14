import express from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';
import { sendOtpEmail } from '../services/email.js';
import { sendOtpSms, validatePhoneNumber } from '../services/sms.js';

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

export function initPassport() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn('Google OAuth not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET). Sign in with Google disabled.');
    return;
  }
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/auth/google/callback`,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase().trim();
          const name = profile.displayName?.trim() || profile.name?.givenName || 'User';
          const photo = profile.photos?.[0]?.value;
          let user = await User.findOne({ googleId: profile.id });
          if (user) {
            return done(null, user);
          }
          user = await User.findOne({ email });
          if (user) {
            user.googleId = profile.id;
            if (photo) user.profilePhoto = photo;
            await user.save();
            return done(null, user);
          }
          const baseUsername = (email ? email.split('@')[0] : name.replace(/\s+/g, '_')).toLowerCase().replace(/[^a-z0-9_.]/g, '');
          let username = baseUsername.slice(0, 20) || 'user';
          let exists = await User.findOne({ username });
          let suffix = 0;
          while (exists) {
            suffix += 1;
            username = `${baseUsername.slice(0, 15)}${suffix}`;
            exists = await User.findOne({ username });
          }
          // For Google signup, email is required, but we'll handle it gracefully
          const googleEmail = email || `${profile.id}@google.placeholder`;
          user = await User.create({
            name,
            username,
            email: googleEmail,
            googleId: profile.id,
            emailVerified: !!email,
            profilePhoto: photo || null,
          });
          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
}

// In-memory OTP store: { email/phone: { otp, expiresAt, type: 'email'|'phone' } }
const otpStore = new Map();
const OTP_EXPIRY_MS = 10 * 60 * 1000;

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Send OTP for signup verification (email or phone)
router.post('/send-otp', async (req, res) => {
  try {
    const { email, phone } = req.body;
    
    if (!email && !phone) {
      return res.status(400).json({ error: 'Email or phone number is required' });
    }

    if (email && phone) {
      return res.status(400).json({ error: 'Please provide either email or phone, not both' });
    }

    let normalized, type, result;

    if (email) {
      normalized = email.toLowerCase().trim();
      if (!normalized || !normalized.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
      }

      // Check if email already exists
      const existingUser = await User.findOne({ email: normalized });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const otp = generateOtp();
      otpStore.set(normalized, { otp, expiresAt: Date.now() + OTP_EXPIRY_MS, type: 'email' });

      result = await sendOtpEmail({ toEmail: normalized, otp });
      if (!result.sent) {
        otpStore.delete(normalized);
        return res.status(503).json({ error: result.error || 'Failed to send OTP email' });
      }

      return res.json({ success: true, message: 'OTP sent to your email', type: 'email' });
    }

    if (phone) {
      const phoneValidation = validatePhoneNumber(phone);
      if (!phoneValidation.valid) {
        return res.status(400).json({ error: phoneValidation.error });
      }

      normalized = phoneValidation.cleaned;

      // Check if phone already exists
      const existingUser = await User.findOne({ phone: normalized });
      if (existingUser) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }

      const otp = generateOtp();
      otpStore.set(normalized, { otp, expiresAt: Date.now() + OTP_EXPIRY_MS, type: 'phone' });

      result = await sendOtpSms({ toPhone: normalized, otp });
      if (!result.sent) {
        otpStore.delete(normalized);
        return res.status(503).json({ error: result.error || 'Failed to send OTP SMS' });
      }

      return res.json({ success: true, message: 'OTP sent to your phone', type: 'phone' });
    }
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: err.message || 'Failed to send OTP' });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const { name, username, email, phone, password, otp } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }
    const usernameNorm = username.trim().toLowerCase();
    if (usernameNorm.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!/^[a-z0-9_.]+$/.test(usernameNorm)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, dots and underscores' });
    }
    if (!email && !phone) {
      return res.status(400).json({ error: 'Email or phone number is required' });
    }
    if (email && phone) {
      return res.status(400).json({ error: 'Please provide either email or phone, not both' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!otp || String(otp).length !== 6) {
      return res.status(400).json({ error: 'Valid 6-digit OTP is required' });
    }

    let normalized, stored, userData;

    if (email) {
      normalized = email.toLowerCase().trim();
      if (!normalized.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
      }
      stored = otpStore.get(normalized);
      if (!stored || stored.type !== 'email') {
        return res.status(400).json({ error: 'OTP expired or not sent. Please request a new OTP.' });
      }
      if (Date.now() > stored.expiresAt) {
        otpStore.delete(normalized);
        return res.status(400).json({ error: 'OTP expired. Please request a new OTP.' });
      }
      if (stored.otp !== String(otp).trim()) {
        return res.status(400).json({ error: 'Invalid OTP' });
      }
      otpStore.delete(normalized);

      const existingEmail = await User.findOne({ email: normalized });
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      userData = {
        name: name.trim(),
        username: usernameNorm,
        email: normalized,
        password,
        emailVerified: true,
      };
    } else {
      const phoneValidation = validatePhoneNumber(phone);
      if (!phoneValidation.valid) {
        return res.status(400).json({ error: phoneValidation.error });
      }
      normalized = phoneValidation.cleaned;

      stored = otpStore.get(normalized);
      if (!stored || stored.type !== 'phone') {
        return res.status(400).json({ error: 'OTP expired or not sent. Please request a new OTP.' });
      }
      if (Date.now() > stored.expiresAt) {
        otpStore.delete(normalized);
        return res.status(400).json({ error: 'OTP expired. Please request a new OTP.' });
      }
      if (stored.otp !== String(otp).trim()) {
        return res.status(400).json({ error: 'Invalid OTP' });
      }
      otpStore.delete(normalized);

      const existingPhone = await User.findOne({ phone: normalized });
      if (existingPhone) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }

      userData = {
        name: name.trim(),
        username: usernameNorm,
        phone: normalized,
        password,
        phoneVerified: true,
      };
    }

    const existingUsername = await User.findOne({ username: usernameNorm });
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const user = await User.create(userData);

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        profilePhoto: user.profilePhoto,
      },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: err.message || 'Signup failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { emailOrUsernameOrPhone, password } = req.body;

    if (!emailOrUsernameOrPhone || !password) {
      return res.status(400).json({ error: 'Email/phone/username and password are required' });
    }

    const input = emailOrUsernameOrPhone.trim();
    const isEmail = input.includes('@');
    const isPhone = /^\+?\d{10,15}$/.test(input.replace(/\D/g, ''));
    
    let user;
    if (isEmail) {
      user = await User.findOne({ email: input.toLowerCase() });
    } else if (isPhone) {
      const phoneValidation = validatePhoneNumber(input);
      if (phoneValidation.valid) {
        user = await User.findOne({ phone: phoneValidation.cleaned });
      }
    }
    
    if (!user) {
      user = await User.findOne({ username: input.toLowerCase() });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email/phone/username or password' });
    }

    if (!user.password) {
      return res.status(401).json({ error: 'This account uses Google sign-in. Please sign in with Google.' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email/phone/username or password' });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        username: user.username || (user.email && user.email.split('@')[0]) || '',
        email: user.email,
        phone: user.phone,
        profilePhoto: user.profilePhoto,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

// Google OAuth - redirect to Google
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google sign-in is not configured' });
  }
  passport.authenticate('google', { session: false })(req, res, next);
});

// Google OAuth callback - issue JWT and redirect to frontend
router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', { session: false }, (err, user) => {
    if (err) {
      return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(err.message || 'Google sign-in failed')}`);
    }
    if (!user) {
      return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent('Google sign-in failed')}`);
    }
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    const userPayload = encodeURIComponent(
      JSON.stringify({
        id: user._id.toString(),
        name: user.name,
        username: user.username,
        email: user.email,
        profilePhoto: user.profilePhoto,
      })
    );
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}&user=${userPayload}`);
  })(req, res, next);
});

export default router;
