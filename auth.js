const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

// ---------- OTP store (in-memory, 15-min TTL) ----------
const otpStore = new Map();

function setOTP(email) {
  const code = crypto.randomInt(100000, 999999).toString();
  otpStore.set(email.toLowerCase(), { code, expiresAt: Date.now() + 15 * 60 * 1000 });
  return code;
}

function verifyOTP(email, code) {
  const entry = otpStore.get(email.toLowerCase());
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { otpStore.delete(email.toLowerCase()); return false; }
  if (entry.code !== code.trim()) return false;
  otpStore.delete(email.toLowerCase());
  return true;
}

// ---------- Nodemailer ----------
function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendOTPEmail(email, code) {
  const transporter = createTransport();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Din innloggingskode – Skademelding',
    text: `Innloggingskoden din er: ${code}\n\nKoden er gyldig i 15 minutter.`,
    html: `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px 24px">
      <h2 style="font-size:22px;margin-bottom:8px">Innloggingskode</h2>
      <p style="color:#404040;margin-bottom:24px">Bruk koden nedenfor for å logge inn på Skademelding-appen.</p>
      <div style="background:#F5F5F3;border-radius:12px;padding:24px;text-align:center;letter-spacing:0.2em;font-size:32px;font-weight:600;font-family:monospace">${code}</div>
      <p style="color:#737373;font-size:13px;margin-top:20px">Koden er gyldig i 15 minutter. Hvis du ikke ba om denne koden, kan du ignorere denne e-posten.</p>
    </div>`,
  });
}

// ---------- Passport ----------
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: `${process.env.APP_URL || 'http://localhost:3000'}/auth/google/callback`,
}, (accessToken, refreshToken, profile, done) => {
  const email = profile.emails?.[0]?.value;
  if (!email) return done(new Error('No email from Google'));
  const user = db.upsertGoogleUser({
    googleId: profile.id,
    email,
    name: profile.displayName,
    picture: profile.photos?.[0]?.value || null,
  });
  return done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.findById(id);
  done(null, user || false);
});

// ---------- Auth middleware ----------
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// ---------- Routes ----------
function register(app) {
  app.get('/login', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  });

  app.get('/verify', (req, res) => {
    if (!req.query.email) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'public', 'verify.html'));
  });

  // Email OTP — send code
  app.post('/auth/email', async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.redirect('/login?error=invalid-email');
    }
    try {
      const code = setOTP(email);
      await sendOTPEmail(email, code);
      res.redirect(`/verify?email=${encodeURIComponent(email)}`);
    } catch (err) {
      console.error('E-post feil:', err.message);
      res.redirect('/login?error=email-failed');
    }
  });

  // Email OTP — verify code
  app.post('/auth/verify', (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const code = (req.body.code || '').trim();
    if (!verifyOTP(email, code)) {
      return res.redirect(`/verify?email=${encodeURIComponent(email)}&error=invalid`);
    }
    const user = db.upsertEmailUser(email);
    req.login(user, err => {
      if (err) return res.redirect('/login?error=session');
      res.redirect('/');
    });
  });

  // Google OAuth
  app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login?error=google' }),
    (req, res) => res.redirect('/')
  );

  // Logout
  app.get('/auth/logout', (req, res) => {
    req.logout(err => {
      if (err) console.error(err);
      res.redirect('/login');
    });
  });
}

module.exports = { passport, requireAuth, register };
