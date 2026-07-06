import { t } from './i18n.js';

// Text that lands on the lock screen: the list name as title, the still-unbought
// items (with quantities) as body.
const buildReminderTitle = (list) => `🛒 ${list.name}`;

function buildReminderBody(list, lang) {
  const left = list.items.filter((i) => !i.checked);
  if (!left.length) return t('notif_body_empty', lang);
  let s = left.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(' · ');
  if (s.length > 300) s = s.slice(0, 297) + '…';
  return s;
}

export { buildReminderTitle, buildReminderBody };
