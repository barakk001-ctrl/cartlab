import { AlertTriangle, Check, Tag, X } from 'lucide-react';
import { useState } from 'react';
import { isRTL, t } from '../i18n.js';
import { categorize, categoryLabel, categoryOptions } from '../catalog.js';
import { ensureNotifyPermission, subscribeUrgentAlerts } from '../push.js';

// Item sheet, opened by tapping the item's name: an urgent toggle, a
// free-text note, and the store-section picker. "Automatic" follows the
// name-based guess; anything else is a synced per-item override. The note
// saves on close or pick.
function ItemModal({ lang, listId, item, onClose, onPatch }) {
  const autoKey = categorize(item.name);
  const current = item.cat || null;
  const [note, setNote] = useState(item.note || '');

  const notePatch = () => {
    const trimmed = note.trim().slice(0, 300);
    return trimmed !== (item.note || '') ? { note: trimmed || null } : {};
  };

  const close = () => {
    const patch = notePatch();
    if (Object.keys(patch).length) onPatch(patch);
    onClose();
  };

  const pick = (key) => {
    onPatch({ cat: key, ...notePatch() });
    onClose();
  };

  // Marking urgent syncs the flag (the server notifies every subscribed
  // device, sender included) and is also the natural user gesture to opt
  // this device into urgent alerts.
  const toggleUrgent = () => {
    const next = !item.urgent;
    onPatch({ urgent: next });
    if (next) {
      ensureNotifyPermission().then((granted) => {
        if (granted) subscribeUrgentAlerts(listId, lang);
      });
    }
  };

  const Row = ({ selected, onClick, children }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-start text-[15px] border-b border-ink/5 last:border-b-0 ${
        selected ? 'text-leaf font-semibold' : ''
      }`}
    >
      <span className="truncate">{children}</span>
      {selected && <Check size={16} strokeWidth={3} className="text-leaf shrink-0" />}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={close}
      dir={isRTL(lang) ? 'rtl' : 'ltr'}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10">
          <div className="font-semibold text-sm truncate">{item.name}</div>
          <button onClick={close} className="p-1 opacity-60 shrink-0" aria-label={t('close', lang)}>
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="px-4 pt-3">
          <button
            onClick={toggleUrgent}
            className={`w-full flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
              item.urgent ? 'bg-rust text-cream border-rust' : 'border-rust/40 text-rust'
            }`}
          >
            <AlertTriangle size={15} strokeWidth={2.5} />
            {t(item.urgent ? 'urgent_unmark' : 'urgent_mark', lang)}
          </button>
          <p className="text-[11px] opacity-55 mt-1.5">{t('urgent_explain', lang)}</p>
        </div>

        <div className="px-4 pt-3 pb-1">
          <label className="block">
            <span className="f-mono text-[10px] uppercase tracking-[0.2em] opacity-55">
              {t('note_label', lang)}
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && close()}
              placeholder={t('note_ph', lang)}
              maxLength={300}
              className="mt-1 w-full bg-surface/70 border border-ink/15 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-leaf"
            />
          </label>
        </div>

        <div className="px-4 pt-3 pb-1 flex items-center gap-1.5 f-mono text-[10px] uppercase tracking-[0.2em] opacity-55">
          <Tag size={11} strokeWidth={2.5} />
          {t('category', lang)}
        </div>
        <div className="max-h-[45vh] overflow-y-auto">
          <Row selected={current === null} onClick={() => pick(null)}>
            {t('auto_category', lang)} · {categoryLabel(autoKey, lang)}
          </Row>
          {categoryOptions(lang).map((c) => (
            <Row key={c.key} selected={current === c.key} onClick={() => pick(c.key)}>
              {c.label}
            </Row>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ItemModal;
