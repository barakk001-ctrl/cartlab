import { t } from './i18n.js';
import { itemQtyText } from './units.js';

// Text that lands on the lock screen: the list name as title, the still-unbought
// items (with quantities) as body.
const buildReminderTitle = (list) => `🛒 ${list.name}`;

function buildReminderBody(list, lang) {
  const left = list.items.filter((i) => !i.checked);
  if (!left.length) return t('notif_body_empty', lang);
  let s = left.map((i) => {
    const qty = itemQtyText(i, lang);
    return qty ? `${i.name} ${qty}` : i.name;
  }).join(' · ');
  if (s.length > 300) s = s.slice(0, 297) + '…';
  return s;
}

export { buildReminderTitle, buildReminderBody };
