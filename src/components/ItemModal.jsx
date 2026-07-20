import { AlertTriangle, Check, ScanBarcode, Tag, X } from 'lucide-react';
import { useState } from 'react';
import { isRTL, t } from '../i18n.js';
import { categorize, categoryLabel, categoryOptions } from '../catalog.js';
import { ensureNotifyPermission, subscribeUrgentAlerts } from '../push.js';
import BarcodeScanner from './BarcodeScanner.jsx';

// Item sheet, opened by tapping the item's name: an urgent toggle, a
// free-text note, shelf price + barcode (feeding the price tracker), and the
// store-section picker. "Automatic" follows the name-based guess; anything
// else is a synced per-item override. Text fields save on close or pick.
function ItemModal({ lang, listId, item, onClose, onPatch }) {
  const autoKey = categorize(item.name);
  const current = item.cat || null;
  const [note, setNote] = useState(item.note || '');
  const [price, setPrice] = useState(item.price != null ? String(item.price) : '');
  const [barcode, setBarcode] = useState(item.barcode || '');
  const [scanOpen, setScanOpen] = useState(false);

  const fieldsPatch = () => {
    const patch = {};
    const trimmedNote = note.trim().slice(0, 300);
    if (trimmedNote !== (item.note || '')) patch.note = trimmedNote || null;
    const parsedPrice = Number(price);
    const cleanPrice = Number.isFinite(parsedPrice) && parsedPrice > 0
      ? Math.round(parsedPrice * 100) / 100
      : null;
    if (cleanPrice !== (item.price ?? null)) patch.price = cleanPrice;
    const cleanBarcode = /^\d{6,14}$/.test(barcode.trim()) ? barcode.trim() : null;
    if (cleanBarcode !== (item.barcode || null)) patch.barcode = cleanBarcode;
    return patch;
  };

  const close = () => {
    const patch = fieldsPatch();
    if (Object.keys(patch).length) onPatch(patch);
    onClose();
  };

  const pick = (key) => {
    onPatch({ cat: key, ...fieldsPatch() });
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

        {/* price + barcode — feeds the per-product price history */}
        <div className="px-4 pt-2 pb-1 flex gap-2">
          <label className="block w-24 shrink-0">
            <span className="f-mono text-[10px] uppercase tracking-[0.2em] opacity-55">
              {t('price_label', lang)}
            </span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && close()}
              type="text"
              inputMode="decimal"
              placeholder="₪"
              dir="ltr"
              className="mt-1 w-full bg-surface/70 border border-ink/15 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-leaf"
            />
          </label>
          <label className="block flex-1 min-w-0">
            <span className="f-mono text-[10px] uppercase tracking-[0.2em] opacity-55">
              {t('barcode_label', lang)}
            </span>
            <div className="mt-1 flex gap-1.5">
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value.replace(/\D/g, '').slice(0, 14))}
                onKeyDown={(e) => e.key === 'Enter' && close()}
                type="text"
                inputMode="numeric"
                placeholder={t('barcode_ph', lang)}
                dir="ltr"
                className="w-full min-w-0 bg-surface/70 border border-ink/15 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-leaf"
              />
              <button
                onClick={() => setScanOpen(true)}
                className="shrink-0 w-11 rounded-xl border border-ink/15 flex items-center justify-center text-leaf"
                aria-label={t('barcode_scan', lang)}
              >
                <ScanBarcode size={18} strokeWidth={2} />
              </button>
            </div>
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

      {scanOpen && (
        <BarcodeScanner
          lang={lang}
          onDetect={(code) => { setBarcode(code); setScanOpen(false); }}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  );
}

export default ItemModal;
