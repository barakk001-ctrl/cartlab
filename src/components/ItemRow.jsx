import { Camera, Check, Minus, Plus, X } from 'lucide-react';
import { useRef } from 'react';
import { t } from '../i18n.js';
import { compressImage } from '../db.js';
import { usePhoto } from '../hooks/usePhoto.js';

function ItemRow({ item, lang, listId, onToggle, onQty, onRemove, onPhoto, onOpenPhoto }) {
  const fileRef = useRef(null);
  const photoUrl = usePhoto(listId, item.id, item.hasPhoto, item.photoRev || 0);

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    try {
      onPhoto(await compressImage(file));
    } catch (err) {
      console.error('photo save failed:', err);
    }
  };

  return (
    <div className="bg-white/70 border border-ink/10 rounded-2xl px-3 py-2.5 flex items-center gap-3">
      {/* check circle */}
      <button
        onClick={onToggle}
        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${
          item.checked ? 'bg-leaf border-leaf text-cream' : 'border-ink/25 text-transparent'
        }`}
        aria-label={item.name}
      >
        <Check size={15} strokeWidth={3} />
      </button>

      {/* photo thumb — opens viewer if present, camera/library picker if not */}
      {item.hasPhoto && photoUrl ? (
        <button onClick={onOpenPhoto} className="shrink-0">
          <img src={photoUrl} alt="" className="w-11 h-11 rounded-lg object-cover border border-ink/10" />
        </button>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-11 h-11 rounded-lg border border-dashed border-ink/25 flex items-center justify-center shrink-0 text-ink/40"
          aria-label={t('photo_title', lang)}
        >
          <Camera size={17} strokeWidth={2} />
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} hidden />

      <span className={`flex-1 min-w-0 break-words text-[15px] ${item.checked ? 'item-done' : ''}`}>
        {item.name}
      </span>

      {/* quantity stepper */}
      <div className="flex items-center gap-1 shrink-0" dir="ltr">
        <button
          onClick={() => onQty(-1)}
          disabled={item.qty <= 1}
          className="w-7 h-7 rounded-full border border-ink/20 flex items-center justify-center disabled:opacity-25"
          aria-label="-"
        >
          <Minus size={13} strokeWidth={2.5} />
        </button>
        <span className="f-mono text-sm w-6 text-center font-semibold">{item.qty}</span>
        <button
          onClick={() => onQty(1)}
          className="w-7 h-7 rounded-full border border-ink/20 flex items-center justify-center"
          aria-label="+"
        >
          <Plus size={13} strokeWidth={2.5} />
        </button>
      </div>

      <button
        onClick={onRemove}
        className="p-1.5 opacity-30 hover:opacity-100 hover:text-rust shrink-0"
        aria-label={t('delete_item', lang)}
      >
        <X size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export default ItemRow;
