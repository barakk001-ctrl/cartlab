// ------------------------------------------------------------
// Persistence: list/item metadata lives in localStorage (small, synchronous);
// item photos live in IndexedDB (see db.js) because they don't fit the ~5MB
// localStorage quota.
// ------------------------------------------------------------

const LISTS_KEY = 'cartlab:lists';
const LANG_KEY = 'cartlab:lang';
const REMLIST_KEY = 'cartlab:remlist'; // target Reminders list for Apple export

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

export { uid, loadLists, saveLists, loadLang, saveLang, loadRemindersListName, saveRemindersListName };
