// ------------------------------------------------------------
// Web Push reminders (same mechanism as FitLab's timer pushes, but scheduled
// for an absolute time). The server holds the schedule and sends the push via
// the push service, which wakes the phone and shows the notification on the
// lock screen — even when the PWA has been closed for days.
//
// iOS requirements: 16.4+, app added to the Home Screen, permission granted
// from a user gesture inside the installed app.
// ------------------------------------------------------------

import { getDeviceId } from './sync.js';
import { api } from './api.js';

// Reminder ids are per-device: on a shared list, every device that has seen
// the reminder schedules its own push, so both partners' phones light up.
const reminderIdFor = (listId) => `${listId}.${getDeviceId()}`;

const IS_IOS = typeof navigator !== 'undefined' &&
  (/iP(ad|hone|od)/.test(navigator.userAgent) ||
   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const isStandalone = () =>
  (typeof navigator !== 'undefined' && navigator.standalone === true) ||
  (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

const canNotify = () =>
  typeof Notification !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

const canPush = () => canNotify() && typeof window !== 'undefined' && 'PushManager' in window;

// Must be called from a user gesture (iOS requires it, and only grants to
// Home-Screen-installed web apps).
async function ensureNotifyPermission() {
  if (!canNotify()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

let subPromise = null;
async function getPushSubscription() {
  if (!canPush() || Notification.permission !== 'granted') return null;
  if (!subPromise) {
    subPromise = (async () => {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) return existing;
      const res = await fetch('/api/push/pubkey');
      const { key } = await res.json();
      if (!key) return null;
      return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    })().catch(() => { subPromise = null; return null; });
  }
  return subPromise;
}

// Schedule (or replace) a reminder for absolute time `at` (epoch ms).
async function scheduleReminder(id, at, title, body, url) {
  try {
    const sub = await getPushSubscription();
    if (!sub) return false;
    const res = await fetch('/api/push/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, subscription: sub.toJSON(), at, title, body, url }),
    });
    return res.ok;
  } catch { return false; }
}

// Register this device for a list's urgent-item alerts. No-op until the user
// has granted notification permission (from the reminder flow or from marking
// an item urgent). Safe to call repeatedly — the server upserts per device.
async function subscribeUrgentAlerts(listId, lang) {
  try {
    const sub = await getPushSubscription();
    if (!sub) return false;
    let tz = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
    await api.subscribeUrgent(listId, sub.toJSON(), lang, tz);
    return true;
  } catch { return false; }
}

function cancelReminder(id) {
  try {
    fetch('/api/push/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export { IS_IOS, isStandalone, ensureNotifyPermission, scheduleReminder, cancelReminder, reminderIdFor, subscribeUrgentAlerts };
