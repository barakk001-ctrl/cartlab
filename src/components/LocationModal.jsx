import { Copy, MapPin, Minus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { isRTL, t } from '../i18n.js';

// One-time setup for a location-triggered lock-screen notification. iOS web
// apps can't geofence in the background, so a Shortcuts "When I arrive"
// automation does the location part and fetches /api/lists/:id/alert — which
// returns the unbought items only when there are at least `minItems` of them.
function LocationModal({ lang, list, onClose }) {
  const [minItems, setMinItems] = useState(3);
  const [copied, setCopied] = useState(false);

  const url = `${window.location.origin}/api/lists/${list.id}/alert?min=${minItems}&lang=${lang}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
      dir={isRTL(lang) ? 'rtl' : 'ltr'}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-sm p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 font-semibold">
            <MapPin size={17} strokeWidth={2.5} className="text-leaf" />
            {t('loc_title', lang)}
          </div>
          <button onClick={onClose} className="p-1 opacity-60" aria-label={t('close', lang)}>
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <p className="text-sm opacity-70 mb-4">{t('loc_explain', lang)}</p>

        {/* threshold */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className="text-sm">{t('loc_min_label', lang)}</span>
          <div className="flex items-center gap-1 shrink-0" dir="ltr">
            <button
              onClick={() => setMinItems((n) => Math.max(1, n - 1))}
              disabled={minItems <= 1}
              className="w-7 h-7 rounded-full border border-ink/20 flex items-center justify-center disabled:opacity-25"
              aria-label="-"
            >
              <Minus size={13} strokeWidth={2.5} />
            </button>
            <span className="f-mono text-sm w-6 text-center font-semibold">{minItems}</span>
            <button
              onClick={() => setMinItems((n) => Math.min(50, n + 1))}
              className="w-7 h-7 rounded-full border border-ink/20 flex items-center justify-center"
              aria-label="+"
            >
              <Plus size={13} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <button
          onClick={copy}
          className="w-full flex items-center justify-center gap-2 bg-leaf text-cream rounded-xl py-3 text-sm font-semibold mb-4"
        >
          <Copy size={15} strokeWidth={2.5} />
          {copied ? t('share_copied', lang) : t('loc_copy', lang)}
        </button>

        <div className="bg-surface/70 border border-ink/10 rounded-xl px-3 py-2.5">
          <div className="text-sm font-semibold mb-2">{t('loc_setup_title', lang)}</div>
          <ol className="text-xs opacity-75 space-y-1.5 list-decimal ps-4 leading-relaxed">
            {[1, 2, 3, 4, 5].map((n) => (
              <li key={n}>{t(`loc_step${n}`, lang)}</li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default LocationModal;
