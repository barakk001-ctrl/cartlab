import { Camera, Trash2, X } from 'lucide-react';
import { useRef } from 'react';
import { isRTL, t } from '../i18n.js';
import { compressImage } from '../db.js';
import { usePhoto } from '../hooks/usePhoto.js';

function PhotoModal({ lang, item, listId, onClose, onReplaced, onRemoved }) {
  const fileRef = useRef(null);
  const url = usePhoto(listId, item.id, item.hasPhoto, item.photoRev || 0);

  const replace = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      onReplaced(await compressImage(file));
    } catch (err) {
      console.error('photo replace failed:', err);
    }
  };

  const remove = () => onRemoved();

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/70 flex items-center justify-center p-4"
      onClick={onClose}
      dir={isRTL(lang) ? 'rtl' : 'ltr'}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10">
          <div className="font-semibold text-sm truncate">{item.name}</div>
          <button onClick={onClose} className="p-1 opacity-60" aria-label={t('close', lang)}>
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        {url && <img src={url} alt={item.name} className="w-full max-h-[60vh] object-contain bg-ink/5" />}
        <div className="flex gap-2 p-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 border border-leaf/60 text-leaf rounded-xl py-2.5 text-sm font-semibold"
          >
            <Camera size={15} strokeWidth={2.5} />
            {t('photo_replace', lang)}
          </button>
          <button
            onClick={remove}
            className="flex-1 flex items-center justify-center gap-2 border border-rust/60 text-rust rounded-xl py-2.5 text-sm font-semibold"
          >
            <Trash2 size={15} strokeWidth={2.5} />
            {t('photo_remove', lang)}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={replace} hidden />
      </div>
    </div>
  );
}

export default PhotoModal;
