import { ListTodo, Share2, X } from 'lucide-react';
import { useState } from 'react';
import { isRTL, t } from '../i18n.js';
import { IS_IOS } from '../push.js';
import { sendToAppleReminders, shareList } from '../appleReminders.js';

function ExportModal({ lang, list, onClose }) {
  const [copied, setCopied] = useState(false);
  const hasItems = list.items.some((i) => !i.checked);

  const send = () => {
    sendToAppleReminders(list);
    onClose();
  };

  const share = async () => {
    const result = await shareList(list);
    if (result === 'copied') {
      setCopied(true);
      setTimeout(onClose, 900);
    } else if (result === 'shared') {
      onClose();
    }
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
            <ListTodo size={17} strokeWidth={2.5} className="text-leaf" />
            {t('export_title', lang)}
          </div>
          <button onClick={onClose} className="p-1 opacity-60" aria-label={t('close', lang)}>
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <p className="text-sm opacity-70 mb-3">{t('export_explain', lang)}</p>

        {!IS_IOS && (
          <p className="text-xs bg-leaf/10 text-leaf rounded-xl px-3 py-2.5 mb-3 leading-relaxed">
            {t('export_not_ios', lang)}
          </p>
        )}

        {IS_IOS && (
          <details className="mb-4 bg-white/70 border border-ink/10 rounded-xl px-3 py-2.5">
            <summary className="text-sm font-semibold cursor-pointer">
              {t('export_setup_title', lang)}
            </summary>
            <ol className="text-xs opacity-75 mt-2 space-y-1.5 list-decimal ps-4 leading-relaxed">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <li key={n}>{t(`export_step${n}`, lang)}</li>
              ))}
            </ol>
          </details>
        )}

        {!hasItems && <p className="text-xs text-rust mb-3">{t('export_empty', lang)}</p>}

        <div className="flex gap-2">
          {IS_IOS ? (
            <button
              onClick={send}
              disabled={!hasItems}
              className="flex-1 bg-leaf text-cream rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
            >
              {t('export_send', lang)}
            </button>
          ) : (
            <button
              onClick={share}
              disabled={!hasItems}
              className="flex-1 flex items-center justify-center gap-2 bg-leaf text-cream rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
            >
              <Share2 size={15} strokeWidth={2.5} />
              {copied
                ? t('export_copied', lang)
                : t(navigator.share ? 'export_share' : 'export_copy', lang)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExportModal;
