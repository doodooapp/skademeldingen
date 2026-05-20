const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function load() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return []; }
}

function save(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function findById(id) {
  return load().find(u => u.id === id) || null;
}

function findByEmail(email) {
  return load().find(u => u.email === email.toLowerCase()) || null;
}

function findByGoogleId(googleId) {
  return load().find(u => u.googleId === googleId) || null;
}

function upsertGoogleUser({ googleId, email, name, picture }) {
  const users = load();
  let user = users.find(u => u.googleId === googleId);
  if (user) {
    Object.assign(user, { email: email.toLowerCase(), name, picture });
  } else {
    user = users.find(u => u.email === email.toLowerCase());
    if (user) {
      Object.assign(user, { googleId, name, picture });
    } else {
      user = { id: `${Date.now()}`, email: email.toLowerCase(), googleId, name, picture, createdAt: new Date().toISOString() };
      users.push(user);
    }
  }
  save(users);
  return user;
}

function upsertEmailUser(email) {
  const users = load();
  let user = users.find(u => u.email === email.toLowerCase());
  if (!user) {
    user = { id: `${Date.now()}`, email: email.toLowerCase(), googleId: null, name: null, picture: null, createdAt: new Date().toISOString() };
    users.push(user);
    save(users);
  }
  return user;
}

module.exports = { findById, findByEmail, findByGoogleId, upsertGoogleUser, upsertEmailUser };
