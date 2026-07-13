import { Check, Tag, X } from 'lucide-react';
import { isRTL, t } from '../i18n.js';
import { categorize, categoryLabel, categoryOptions } from '../catalog.js';

// Pick which store section an item files under. "Automatic" (the default)
// follows the name-based guess; anything else is a synced per-item override.
function CategoryModal({ lang, item, onClose, onPick }) {
  const autoKey = categorize(item.name);
  const current = item.cat || null;

  const pick = (key) => {
    onPick(key);
    onClose();
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
      onClick={onClose}
      dir={isRTL(lang) ? 'rtl' : 'ltr'}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10">
          <div className="flex items-center gap-2 font-semibold text-sm min-w-0">
            <Tag size={15} strokeWidth={2.5} className="text-leaf shrink-0" />
            <span className="truncate">{item.name} — {t('category', lang)}</span>
          </div>
          <button onClick={onClose} className="p-1 opacity-60 shrink-0" aria-label={t('close', lang)}>
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
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

export default CategoryModal;
