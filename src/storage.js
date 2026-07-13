// ------------------------------------------------------------
// Persistence: list/item metadata lives in localStorage (small, synchronous);
// item photos live in IndexedDB (see db.js) because they don't fit the ~5MB
// localStorage quota.
// ------------------------------------------------------------

const LISTS_KEY = 'cartlab:lists';
const LANG_KEY = 'cartlab:lang';
const REMLIST_KEY = 'cartlab:remlist'; // target Reminders list for Apple export
const HISTORY_KEY = 'cartlab:history'; // purchase counts per item name (this device)

// list  = { id, name, createdAt, reminderAt: number|null, items: Item[] }
// item  = { id, name, qty, checked, hasPhoto }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadLists() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LISTS_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveLists(lists) {
  try {
    window.localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
    return true;
  } catch (e) {
    console.error('list save failed:', e);
    return false;
  }
}

function loadLang() {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    if (v === 'en' || v === 'he') return v;
  } catch {}
  return (navigator.language || '').startsWith('he') ? 'he' : 'en';
}

function saveLang(lang) {
  try { window.localStorage.setItem(LANG_KEY, lang); } catch {}
}

function loadRemindersListName() {
  try { return window.localStorage.getItem(REMLIST_KEY) || ''; } catch { return ''; }
}

function saveRemindersListName(name) {
  try { window.localStorage.setItem(REMLIST_KEY, name); } catch {}
}

// ---- purchase history (feeds the "frequently bought" quick-add chips) ----
// Recorded whenever an item is checked off. Keyed by lowercased name; keeps
// the ~150 most-bought entries.

function bumpHistory(name) {
  try {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    const history = JSON.parse(window.localStorage.getItem(HISTORY_KEY)) || {};
    const key = trimmed.toLowerCase();
    const entry = history[key] || { name: trimmed, count: 0 };
    entry.count += 1;
    entry.at = Date.now();
    entry.name = trimmed;
    history[key] = entry;
    let entries = Object.entries(history);
    if (entries.length > 150) {
      entries = entries
        .sort((a, b) => b[1].count - a[1].count || b[1].at - a[1].at)
        .slice(0, 150);
    }
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {}
}

// Most frequently bought names (bought at least twice), minus `exclude`.
function topHistory(exclude = [], limit = 8) {
  try {
    const history = JSON.parse(window.localStorage.getItem(HISTORY_KEY)) || {};
    const excluded = new Set(exclude.map((s) => String(s).trim().toLowerCase()));
    return Object.values(history)
      .filter((e) => e.count >= 2 && !excluded.has(e.name.toLowerCase()))
      .sort((a, b) => b.count - a.count || b.at - a.at)
      .slice(0, limit)
      .map((e) => e.name);
  } catch {
    return [];
  }
}

export {
  uid, loadLists, saveLists, loadLang, saveLang,
  loadRemindersListName, saveRemindersListName, bumpHistory, topHistory,
};
