import { Bell, BellOff, X } from 'lucide-react';
import { useState } from 'react';
import { isRTL, t } from '../i18n.js';
import { IS_IOS, isStandalone, ensureNotifyPermission, scheduleReminder, cancelReminder } from '../push.js';
import { buildReminderBody, buildReminderTitle } from '../summary.js';

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
const toLocalInput = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function ReminderModal({ lang, list, onClose, onSet }) {
  // Default: tomorrow at 09:00, or the existing reminder.
  const [value, setValue] = useState(() => {
    if (list.reminderAt && list.reminderAt > Date.now()) return toLocalInput(list.reminderAt);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return toLocalInput(d.getTime());
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const showIosHint = IS_IOS && !isStandalone();

  const set = async () => {
    setError(null);
    const at = new Date(value).getTime();
    if (!Number.isFinite(at) || at < Date.now() + 30000) {
      setError(t('reminder_past', lang));
      return;
    }
    setBusy(true);
    const granted = await ensureNotifyPermission();
    if (!granted) {
      setBusy(false);
      setError(t('notif_denied', lang));
      return;
    }
    const ok = await scheduleReminder(
      list.id, at,
      buildReminderTitle(list), buildReminderBody(list, lang),
      `/#list=${list.id}`,
    );
    setBusy(false);
    if (!ok) {
      setError(t('reminder_failed', lang));
      return;
    }
    onSet(at);
    onClose();
  };

  const remove = () => {
    cancelReminder(list.id);
    onSet(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-4"
      onClick={onClose}
      dir={isRTL(lang) ? 'rtl' : 'ltr'}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 font-semibold">
            <Bell size={17} strokeWidth={2.5} className="text-leaf" />
            {t(list.reminderAt ? 'edit_reminder' : 'set_reminder', lang)}
          </div>
          <button onClick={onClose} className="p-1 opacity-60" aria-label={t('close', lang)}>
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <p className="text-sm opacity-70 mb-4">{t('reminder_explain', lang)}</p>

        {showIosHint && (
          <p className="text-xs bg-rust/10 text-rust rounded-xl px-3 py-2.5 mb-4 leading-relaxed">
            {t('ios_install_hint', lang)}
          </p>
        )}

        <input
          type="datetime-local"
          value={value}
          min={toLocalInput(Date.now())}
          onChange={(e) => setValue(e.target.value)}
          className="w-full bg-white/70 border border-ink/15 rounded-xl px-4 py-3 text-base outline-none focus:border-leaf mb-3"
          dir="ltr"
        />

        {error && <p className="text-xs text-rust mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={set}
            disabled={busy}
            className="flex-1 bg-leaf text-cream rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
          >
            {t('set_reminder', lang)}
          </button>
          {list.reminderAt && (
            <button
              onClick={remove}
              className="flex items-center justify-center gap-1.5 border border-rust/60 text-rust rounded-xl px-4 py-3 text-sm font-semibold"
            >
              <BellOff size={14} strokeWidth={2.5} />
              {t('cancel_reminder', lang)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReminderModal;
