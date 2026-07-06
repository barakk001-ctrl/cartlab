// CartLab production server: serves the built dist/ and provides the Web Push
// reminder API. The client schedules a push for an absolute time ("remind me
// tomorrow at 17:00 about the Groceries list"); when it fires, the push service
// wakes the phone and the notification shows on the lock screen even if the
// PWA has been suspended for days. Reminders are persisted to disk so a server
// restart re-arms them.
import express from 'express';
import webpush from 'web-push';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (local dev only — Railway injects real env vars).
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim();
  }
}

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
const pushEnabled = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@cartlab.local', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('VAPID keys missing — push API disabled, serving static only.');
}

const app = express();
app.use(express.json({ limit: '16kb' }));

// ------------------------------------------------------------
// Reminder store. Unlike FitLab's 30-180s rest timers, shopping reminders are
// hours-to-days away, so they must survive a restart: every mutation is
// flushed to reminders.json and re-armed on boot. (Railway's filesystem is
// ephemeral across deploys — an acceptable trade-off for a personal app.)
// ------------------------------------------------------------
const STORE_FILE = path.join(__dirname, 'reminders.json');
const MAX_PENDING = 2000;
const MAX_AHEAD_MS = 45 * 86400000;      // scheduling horizon: 45 days
const STALE_MS = 12 * 3600000;           // fire reminders missed by <12h on boot, drop older
const MAX_CHUNK_MS = 2147000000;         // setTimeout ceiling (~24.8 days) — re-arm in chunks

const reminders = new Map(); // id -> { at, subscription, title, body }
const timers = new Map();    // id -> timeout handle

function flush() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify([...reminders.entries()]));
  } catch (e) {
    console.warn('reminder flush failed:', e.message);
  }
}

async function fire(id) {
  const r = reminders.get(id);
  reminders.delete(id);
  timers.delete(id);
  flush();
  if (!r) return;
  try {
    await webpush.sendNotification(
      r.subscription,
      JSON.stringify({ title: r.title, body: r.body || '', url: r.url || '/' }),
      { TTL: 3600 },
    );
  } catch (e) {
    console.warn('push send failed:', e.statusCode || e.message);
  }
}

function arm(id) {
  const r = reminders.get(id);
  if (!r) return;
  if (timers.has(id)) clearTimeout(timers.get(id));
  const delay = r.at - Date.now();
  if (delay > MAX_CHUNK_MS) {
    // Too far out for one setTimeout — sleep a chunk, then re-arm.
    timers.set(id, setTimeout(() => arm(id), MAX_CHUNK_MS));
  } else {
    timers.set(id, setTimeout(() => fire(id), Math.max(0, delay)));
  }
}

// Re-arm persisted reminders on boot.
try {
  if (fs.existsSync(STORE_FILE)) {
    const entries = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    const now = Date.now();
    for (const [id, r] of entries) {
      if (r.at < now - STALE_MS) continue; // missed by too much — drop silently
      reminders.set(id, r);
      arm(id);
    }
    console.log(`re-armed ${reminders.size} persisted reminder(s)`);
  }
} catch (e) {
  console.warn('could not restore reminders:', e.message);
}

app.get('/api/health', (req, res) => res.json({ ok: true, push: pushEnabled, pending: reminders.size }));
app.get('/api/push/pubkey', (req, res) => res.json({ key: pushEnabled ? VAPID_PUBLIC_KEY : null }));

// Schedule (or replace) a reminder. `at` is epoch milliseconds.
app.post('/api/push/schedule', (req, res) => {
  if (!pushEnabled) return res.status(503).json({ ok: false, error: 'push disabled' });
  const { id, subscription, at, title, body, url } = req.body || {};
  const when = Number(at);
  const now = Date.now();
  if (typeof id !== 'string' || !id || id.length > 64) return res.status(400).json({ ok: false, error: 'bad id' });
  if (!Number.isFinite(when) || when < now - 60000 || when > now + MAX_AHEAD_MS) {
    return res.status(400).json({ ok: false, error: 'bad time' });
  }
  if (!subscription || typeof subscription.endpoint !== 'string' ||
      !subscription.endpoint.startsWith('https://') || subscription.endpoint.length > 1000) {
    return res.status(400).json({ ok: false, error: 'bad subscription' });
  }
  if (typeof title !== 'string' || title.length > 120 ||
      (body != null && (typeof body !== 'string' || body.length > 400)) ||
      (url != null && (typeof url !== 'string' || url.length > 200 || !url.startsWith('/')))) {
    return res.status(400).json({ ok: false, error: 'bad payload' });
  }
  if (!reminders.has(id) && reminders.size >= MAX_PENDING) return res.status(429).json({ ok: false, error: 'too many pending' });

  reminders.set(id, { at: when, subscription, title, body: body || '', url: url || '/' });
  arm(id);
  flush();
  res.json({ ok: true });
});

app.post('/api/push/cancel', (req, res) => {
  const { id } = req.body || {};
  if (typeof id !== 'string') return res.status(400).json({ ok: false });
  const existed = reminders.delete(id);
  if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id); }
  if (existed) flush();
  res.json({ ok: true, cancelled: existed });
});

// Static app: hashed assets cache forever, everything else revalidates.
const dist = path.join(__dirname, 'dist');
app.use(express.static(dist, {
  setHeaders(res, filePath) {
    if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));

const port = parseInt(process.env.PORT || '4173', 10);
app.listen(port, '0.0.0.0', () => console.log(`CartLab server on :${port} (push: ${pushEnabled ? 'on' : 'off'})`));
