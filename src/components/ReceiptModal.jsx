import { Receipt, X } from 'lucide-react';
import { useState } from 'react';
import { isRTL, t } from '../i18n.js';
import { api } from '../api.js';

// Prices from a till receipt, without any OCR service: iOS Live Text copies
// the receipt's `barcode | name | price` lines as plain text; paste it here
// and the server parses the product lines into the price history.
function ReceiptModal({ lang, listId, onClose, onSaved }) {
  const [text, setText] = useState('');
  const [storeName, setStoreName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // The receipt's first line is usually the shop name — prefill, keep editable.
  const onTextChange = (value) => {
    setText(value);
    if (!storeName.trim()) {
      const first = value.split('\n').map((l) => l.trim()).find(Boolean);
      if (first && !/\d{5,}/.test(first) && !first.includes('ברקוד')) {
        setStoreName(first.slice(0, 60));
      }
    }
  };

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.pasteReceipt(listId, text, storeName.trim());
      if (r.saved > 0) {
        onSaved(r.saved);
        onClose();
      } else {
        setError(t('receipt_none', lang));
      }
    } catch {
      setError(t('receipt_failed', lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
      dir={isRTL(lang) ? 'rtl' : 'ltr'}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 font-semibold">
            <Receipt size={17} strokeWidth={2.5} className="text-leaf" />
            {t('receipt_title', lang)}
          </div>
          <button onClick={onClose} className="p-1 opacity-60" aria-label={t('close', lang)}>
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <p className="text-sm opacity-70 mb-3">{t('receipt_explain', lang)}</p>

        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={t('receipt_ph', lang)}
          rows={7}
          className="w-full bg-surface/70 border border-ink/15 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-leaf mb-2 resize-none"
          dir="auto"
        />

        <label className="block mb-3">
          <span className="f-mono text-[10px] uppercase tracking-[0.2em] opacity-55">
            {t('store_label', lang)}
          </span>
          <input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value.slice(0, 60))}
            placeholder={t('store_ph', lang)}
            className="mt-1 w-full bg-surface/70 border border-ink/15 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-leaf"
          />
        </label>

        {error && <p className="text-xs text-rust mb-3">{error}</p>}

        <button
          onClick={save}
          disabled={busy || !text.trim()}
          className="w-full bg-leaf text-cream rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
        >
          {t('receipt_save', lang)}
        </button>
      </div>
    </div>
  );
}

export default ReceiptModal;
