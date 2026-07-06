// ------------------------------------------------------------
// Export to Apple Reminders via a one-time "CartLab" Shortcut (same trick as
// FitLab's phone timer). The Shortcut receives the list NAME as the first
// line and the unbought items as the following lines; it files each item as
// a native reminder into the Reminders list with that name — so every CartLab
// list gets its own folder in the Reminders app (and the lock screen).
//
// In a browser tab we use x-callback to return to the tab. In the INSTALLED
// home-screen app we omit the return URL — iOS can't deep-link back into a
// standalone PWA, so the user swipes back instead of being kicked to Safari.
// ------------------------------------------------------------
import { isStandalone } from './push.js';

const SHORTCUT_NAME = 'CartLab';

function buildExportText(list) {
  return list.items
    .filter((i) => !i.checked)
    .map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name))
    .join('\n');
}

function sendToAppleReminders(list) {
  try {
    // First line: target Reminders list name. Rest: one item per line.
    const text = encodeURIComponent(`${list.name}\n${buildExportText(list)}`);
    const name = encodeURIComponent(SHORTCUT_NAME);
    if (isStandalone()) {
      window.location.href = `shortcuts://run-shortcut?name=${name}&input=text&text=${text}`;
    } else {
      const back = encodeURIComponent(window.location.href);
      window.location.href =
        `shortcuts://x-callback-url/run-shortcut?name=${name}&input=text&text=${text}` +
        `&x-success=${back}&x-cancel=${back}&x-error=${back}`;
    }
  } catch {}
}

// Non-iOS fallback: system share sheet where available, else clipboard.
// Returns 'shared' | 'copied' | null.
async function shareList(list) {
  const text = `${list.name}\n${buildExportText(list)}`;
  if (navigator.share) {
    try { await navigator.share({ title: list.name, text }); return 'shared'; } catch { return null; }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return null; }
}

export { SHORTCUT_NAME, buildExportText, sendToAppleReminders, shareList };
