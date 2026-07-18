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
import { openStore } from './store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// All persistent state (lists DB, reminders) lives here. On Railway, mount a
// volume and set DATA_DIR to its mount path so data survives deploys.
const dataDir = process.env.DATA_DIR || __dirname;

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
app.use(express.json({ limit: '256kb' })); // a full 500-item list upload is ~50kb

// ------------------------------------------------------------
// Reminder store. Unlike FitLab's 30-180s rest timers, shopping reminders are
// hours-to-days away, so they must survive a restart: every mutation is
// flushed to reminders.json and re-armed on boot. (Railway's filesystem is
// ephemeral across deploys — an acceptable trade-off for a personal app.)
// ------------------------------------------------------------
const STORE_FILE = path.join(dataDir, 'reminders.json');
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

// ------------------------------------------------------------
// Shared lists API. A list id is the sharing capability: anyone with the link
// (/#list=<id>) can read and edit that list — no accounts. Writes are
// per-item (last-write-wins), so two people editing the same list at once
// don't clobber each other's changes. Every mutation bumps the list version
// and is broadcast over SSE so other open devices refetch immediately.
// ------------------------------------------------------------
const store = openStore(dataDir);

const LIST_ID_RE = /^[a-z0-9]{6,40}$/i;
const parseName = (v) =>
  typeof v === 'string' && v.trim() && v.trim().length <= 200 ? v.trim() : null;
// undefined = invalid, null = no reminder
const parseTime = (v) => (v == null ? null : Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined);

const UNITS = new Set(['kg', 'g', 'l', 'pack']);

function parseItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !LIST_ID_RE.test(raw.id)) return null;
  const name = parseName(raw.name);
  if (!name) return null;
  const qty = Number(raw.qty);
  const checkedAt = Number(raw.checkedAt);
  return {
    id: raw.id,
    name,
    // decimals allowed (1.5 kg); two-decimal precision, capped at 999
    qty: Number.isFinite(qty) && qty > 0 ? Math.min(Math.round(qty * 100) / 100, 999) : 1,
    checked: !!raw.checked,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : null,
    // manual category override; a short slug like "veg" (null = auto)
    cat: typeof raw.cat === 'string' && /^[a-z]{2,16}$/.test(raw.cat) ? raw.cat : null,
    unit: UNITS.has(raw.unit) ? raw.unit : null,
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 300) : null,
    urgent: !!raw.urgent,
    // when it was checked off (drives the "Just bought" section); clamped so
    // a bad clock can't pin an item there forever
    checkedAt: raw.checked && Number.isFinite(checkedAt) && checkedAt > 0
      ? Math.min(checkedAt, Date.now() + 60000)
      : null,
  };
}

const guard = (fn) => (req, res) => {
  try {
    fn(req, res);
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.status ? e.message : 'server error' });
  }
};

const requireListId = (req, res) => {
  if (LIST_ID_RE.test(req.params.id)) return req.params.id;
  res.status(400).json({ ok: false, error: 'bad id' });
  return null;
};

// SSE change feed: one connection subscribes to all the lists a device knows.
const sseClients = new Set(); // { ids: Set<listId>, res }
function broadcast(listId, payload) {
  const msg = `data: ${JSON.stringify({ id: listId, ...payload })}\n\n`;
  for (const c of sseClients) {
    if (c.ids.has(listId)) {
      try { c.res.write(msg); } catch {}
    }
  }
}
setInterval(() => {
  for (const c of sseClients) {
    try { c.res.write(': ping\n\n'); } catch {}
  }
}, 25000).unref();

app.get('/api/events', (req, res) => {
  const ids = String(req.query.lists || '').split(',').filter((s) => LIST_ID_RE.test(s)).slice(0, 100);
  if (!ids.length) return res.status(400).json({ ok: false, error: 'no lists' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');
  const client = { ids: new Set(ids), res };
  sseClients.add(client);
  req.on('close', () => sseClients.delete(client));
});

app.get('/api/lists/:id', guard((req, res) => {
  const id = requireListId(req, res);
  if (!id) return;
  const list = store.getList(id);
  if (!list) return res.status(404).json({ ok: false, error: 'not found' });
  const v = Number(req.query.v);
  if (Number.isFinite(v) && v === list.version) return res.json({ unchanged: true, version: list.version });
  res.json(list);
}));

// Create, or fully replace (first upload of a device-local list).
app.put('/api/lists/:id', guard((req, res) => {
  const id = requireListId(req, res);
  if (!id) return;
  const { name, createdAt, reminderAt, items } = req.body || {};
  const cleanName = parseName(name);
  const when = parseTime(reminderAt);
  const rawItems = Array.isArray(items) ? items : [];
  const cleanItems = rawItems.map(parseItem);
  if (!cleanName || when === undefined || rawItems.length > 500 || cleanItems.some((i) => !i)) {
    return res.status(400).json({ ok: false, error: 'bad payload' });
  }
  const version = store.upsertList(id, {
    name: cleanName,
    createdAt: Number.isFinite(createdAt) ? createdAt : null,
    reminderAt: when,
    items: cleanItems,
  });
  broadcast(id, { version });
  res.json({ ok: true, version });
}));

app.patch('/api/lists/:id', guard((req, res) => {
  const id = requireListId(req, res);
  if (!id) return;
  const body = req.body || {};
  const patch = {};
  if ('name' in body) {
    patch.name = parseName(body.name);
    if (!patch.name) return res.status(400).json({ ok: false, error: 'bad name' });
  }
  if ('reminderAt' in body) {
    patch.reminderAt = parseTime(body.reminderAt);
    if (patch.reminderAt === undefined) return res.status(400).json({ ok: false, error: 'bad time' });
  }
  const version = store.patchList(id, patch);
  if (version === null) return res.status(404).json({ ok: false, error: 'not found' });
  broadcast(id, { version });
  res.json({ ok: true, version });
}));

app.delete('/api/lists/:id', guard((req, res) => {
  const id = requireListId(req, res);
  if (!id) return;
  store.deleteList(id);
  broadcast(id, { deleted: true });
  res.json({ ok: true });
}));

// ---- urgent alerts ----
// A device registers its push subscription per list; when an item on that
// list turns urgent, every registered device — including the one that marked
// it, as confirmation the alert went out — gets an immediate push. `lang`
// picks the notification language per device.

const DEVICE_ID_RE = /^[a-z0-9]{4,40}$/i;

// "Milk 1.5 kg · Eggs ×2 · Bread" — shared by the arrival alert, and the
// 7 AM urgent digest.
function itemsText(items, he) {
  const UNIT_TXT = { kg: he ? 'ק"ג' : 'kg', g: he ? 'גרם' : 'g', l: he ? 'ליטר' : 'L', pack: he ? 'מארז' : 'pack' };
  return items.map((i) => {
    if (i.unit) {
      const qty = i.qty % 1 === 0 ? i.qty : Math.round(i.qty * 10) / 10;
      return `${i.name} ${qty} ${UNIT_TXT[i.unit] || i.unit}`;
    }
    return i.qty > 1 ? `${i.name} ×${i.qty}` : i.name;
  }).join(' · ');
}

// Local wall-clock date + hour for an IANA timezone (falls back to UTC when
// the stored tz is missing or invalid). DST-proof because Intl resolves the
// zone's rules at each call.
function localParts(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
  } catch {
    return localParts('UTC');
  }
}

const isValidTz = (tz) => {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
};

app.post('/api/lists/:id/subscribe', guard((req, res) => {
  if (!pushEnabled) return res.status(503).json({ ok: false, error: 'push disabled' });
  const id = requireListId(req, res);
  if (!id) return;
  const { deviceId, subscription, lang, tz } = req.body || {};
  if (typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    return res.status(400).json({ ok: false, error: 'bad device' });
  }
  if (!subscription || typeof subscription.endpoint !== 'string' ||
      !subscription.endpoint.startsWith('https://') || subscription.endpoint.length > 1000) {
    return res.status(400).json({ ok: false, error: 'bad subscription' });
  }
  const cleanTz = isValidTz(tz) ? tz : null;
  const ok = store.setSub(id, deviceId, lang === 'he' ? 'he' : 'en', subscription, cleanTz, localParts(cleanTz).date);
  if (ok === null) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true });
}));

// Fire-and-forget fan-out. A 404/410 from the push service means the
// subscription is dead — drop it so the list doesn't accumulate corpses.
async function notifyUrgent(listId, item, rebump = false) {
  const list = store.getList(listId);
  if (!list) return;
  for (const sub of store.getSubs(listId)) {
    const he = sub.lang === 'he';
    const title = he ? `🚨 דחוף: ${item.name}` : `🚨 Urgent: ${item.name}`;
    let body = rebump
      ? (he ? `עדיין מחכה ברשימה "${list.name}"` : `Still waiting on "${list.name}"`)
      : (he ? `נוסף לרשימה "${list.name}"` : `Added to "${list.name}"`);
    if (item.note) body += ` — ${item.note}`;
    try {
      await webpush.sendNotification(
        sub.subscription,
        JSON.stringify({ title, body, url: `/#list=${listId}`, tag: `cartlab-urgent-${item.id}` }),
        { TTL: 6 * 3600, urgency: 'high' },
      );
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) store.removeSub(listId, sub.deviceId);
      else console.warn('urgent push failed:', e.statusCode || e.message);
    }
  }
}

// Morning digest: every day at 7:00 (device-local time), each subscribed
// device gets one notification per list that still has unbought urgent items.
// A minute-scan checks each subscription's local clock; last_daily (a local
// date, marked before sending so a failure can't retry-spam) makes it
// once-per-day, and the window runs until noon so a server restart during
// the morning still delivers.
const DAILY_FROM_HOUR = 7;
const DAILY_UNTIL_HOUR = 12;

// Re-bump: while an urgent item stays unbought, its notification is re-sent
// every 30 minutes for 3 hours after it was marked. The per-item tag makes
// each re-send *replace* the previous notification, so it jumps back to the
// top of the lock-screen stack (the closest thing web push has to pinning)
// instead of piling up. Buying or un-marking the item stops the nagging.
// Env overrides exist for tests only.
const URGENT_SCAN_MS = parseInt(process.env.URGENT_SCAN_MS || '60000', 10);
const REBUMP_EVERY_MS = parseInt(process.env.URGENT_REBUMP_EVERY_MS || String(30 * 60000), 10);
const REBUMP_WINDOW_MS = parseInt(process.env.URGENT_REBUMP_WINDOW_MS || String(3 * 3600000), 10);

async function rebumpScan() {
  const now = Date.now();
  for (const item of store.bumpDue(now - REBUMP_WINDOW_MS, now - REBUMP_EVERY_MS)) {
    store.markBumped(item.listId, item.id, now); // mark first — a failed send shouldn't retry-spam
    await notifyUrgent(item.listId, item, true);
  }
}

async function dailyUrgentScan() {
  for (const listId of store.urgentListIds()) {
    let list = null;
    for (const sub of store.getSubs(listId)) {
      const { date, hour } = localParts(sub.tz);
      if (hour < DAILY_FROM_HOUR || hour >= DAILY_UNTIL_HOUR || sub.lastDaily === date) continue;
      list ??= store.getList(listId);
      const urgent = list?.items.filter((i) => i.urgent && !i.checked) || [];
      if (!urgent.length) break;
      store.setSubDaily(listId, sub.deviceId, date);
      const he = sub.lang === 'he';
      const title = he ? `🚨 עדיין דחוף — ${list.name}` : `🚨 Still urgent — ${list.name}`;
      try {
        await webpush.sendNotification(
          sub.subscription,
          JSON.stringify({ title, body: itemsText(urgent, he), url: `/#list=${listId}`, tag: `cartlab-daily-${listId}` }),
          { TTL: 4 * 3600 },
        );
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) store.removeSub(listId, sub.deviceId);
        else console.warn('daily urgent push failed:', e.statusCode || e.message);
      }
    }
  }
}

if (pushEnabled) {
  setInterval(() => {
    dailyUrgentScan().catch((e) => console.warn('daily scan failed:', e.message));
    rebumpScan().catch((e) => console.warn('rebump scan failed:', e.message));
  }, URGENT_SCAN_MS).unref();
}

// Per-item upsert — add and edit both land here (last write wins per item).
app.put('/api/lists/:id/items/:itemId', guard((req, res) => {
  const id = requireListId(req, res);
  if (!id) return;
  const item = parseItem({ ...(req.body || {}), id: req.params.itemId });
  if (!item) return res.status(400).json({ ok: false, error: 'bad item' });
  const result = store.upsertItem(id, item);
  if (result === null) return res.status(404).json({ ok: false, error: 'not found' });
  broadcast(id, { version: result.version });
  if (result.becameUrgent && pushEnabled) {
    notifyUrgent(id, item).catch((e) => console.warn('urgent notify failed:', e.message));
  }
  res.json({ ok: true, version: result.version });
}));

app.delete('/api/lists/:id/items/:itemId', guard((req, res) => {
  const id = requireListId(req, res);
  if (!id) return;
  if (!LIST_ID_RE.test(req.params.itemId)) return res.status(400).json({ ok: false, error: 'bad item id' });
  const version = store.deleteItems(id, [req.params.itemId]);
  if (version === null) return res.status(404).json({ ok: false, error: 'not found' });
  broadcast(id, { version });
  res.json({ ok: true, version });
}));

// ---- item photos ----
// Compressed JPEGs (~30-80 kB, client downscales before upload), stored as
// files in DATA_DIR/photos so a shared list's photos show on every device.

const rawImage = express.raw({ type: ['image/*', 'application/octet-stream'], limit: '400kb' });

app.put('/api/lists/:id/items/:itemId/photo', rawImage, guard((req, res) => {
  const id = requireListId(req, res);
  if (!id) return;
  if (!LIST_ID_RE.test(req.params.itemId)) return res.status(400).json({ ok: false, error: 'bad item id' });
  if (!Buffer.isBuffer(req.body) || req.body.length < 100) return res.status(400).json({ ok: false, error: 'bad image' });
  const result = store.setPhoto(id, req.params.itemId, req.body);
  if (result === null) return res.status(404).json({ ok: false, error: 'not found' });
  broadcast(id, { version: result.version });
  res.json({ ok: true, ...result });
}));

app.delete('/api/lists/:id/items/:itemId/photo', guard((req, res) => {
  const id = requireListId(req, res);
  if (!id) return;
  if (!LIST_ID_RE.test(req.params.itemId)) return res.status(400).json({ ok: false, error: 'bad item id' });
  const version = store.removePhoto(id, req.params.itemId);
  if (version === null) return res.status(404).json({ ok: false, error: 'not found' });
  broadcast(id, { version });
  res.json({ ok: true, version });
}));

app.get('/api/lists/:id/items/:itemId/photo', guard((req, res) => {
  const id = requireListId(req, res);
  if (!id) return;
  if (!LIST_ID_RE.test(req.params.itemId)) return res.status(400).json({ ok: false, error: 'bad item id' });
  const file = store.getPhotoFile(id, req.params.itemId);
  if (!file) return res.status(404).json({ ok: false, error: 'not found' });
  // The client includes ?rev= in the URL, so the content is immutable per URL.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('image/jpeg').sendFile(file);
}));

// Location alert for an iOS Shortcuts "When I arrive" automation: plain-text
// list summary when at least `min` items are unbought, empty body otherwise.
// The Shortcut fetches this URL on arrival and shows a notification only
// when there's text — the web app itself can't geofence in the background.
app.get('/api/lists/:id/alert', guard((req, res) => {
  const id = requireListId(req, res);
  if (!id) return;
  res.type('text/plain; charset=utf-8');
  const list = store.getList(id);
  if (!list) return res.status(404).send('');
  const left = list.items.filter((i) => !i.checked);
  const min = Math.max(1, Math.min(500, Number(req.query.min) || 1));
  if (left.length < min) return res.send('');
  const items = itemsText(left, req.query.lang === 'he');
  let text = `🛒 ${list.name} — ${items}`;
  if (text.length > 500) text = text.slice(0, 497) + '…';
  res.send(text);
}));

// Bulk delete ("clear bought items") — one round-trip, one version bump.
app.post('/api/lists/:id/items/bulk-delete', guard((req, res) => {
  const id = requireListId(req, res);
  if (!id) return;
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((s) => typeof s === 'string' && LIST_ID_RE.test(s)) : null;
  if (!ids || ids.length > 500) return res.status(400).json({ ok: false, error: 'bad ids' });
  const version = store.deleteItems(id, ids);
  if (version === null) return res.status(404).json({ ok: false, error: 'not found' });
  broadcast(id, { version });
  res.json({ ok: true, version });
}));

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
