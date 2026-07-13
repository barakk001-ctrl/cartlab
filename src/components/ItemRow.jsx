import { Camera, Check, Minus, Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { isRTL, t } from '../i18n.js';
import { compressImage } from '../db.js';
import { usePhoto } from '../hooks/usePhoto.js';

// Swipe thresholds: the drag "locks" horizontal after 12px (before that,
// vertical movement is handed to the scroller via touch-action: pan-y),
// triggers its action at 64px, and stretches no further than 96px.
const SWIPE_TRIGGER = 64;
const SWIPE_MAX = 96;

function ItemRow({ item, lang, listId, highlight, onToggle, onQty, onRemove, onPhoto, onOpenPhoto, onOpenCategory }) {
  const fileRef = useRef(null);
  const photoUrl = usePhoto(listId, item.id, item.hasPhoto, item.photoRev || 0);

  // Swipe in the reading direction = toggle check; the other way = delete
  // (the undo toast is the safety net). Mirrored under RTL.
  const rtl = isRTL(lang);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  const onPointerDown = (e) => {
    if (!e.isPrimary) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, locked: false, pointerId: e.pointerId };
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const moveX = e.clientX - drag.startX;
    const moveY = e.clientY - drag.startY;
    if (!drag.locked) {
      if (Math.abs(moveY) > 12 && Math.abs(moveY) > Math.abs(moveX)) {
        dragRef.current = null; // vertical intent — let the page scroll
        return;
      }
      if (Math.abs(moveX) > 12 && Math.abs(moveX) > Math.abs(moveY) * 1.2) {
        drag.locked = true;
        setDragging(true);
        try { e.currentTarget.setPointerCapture(drag.pointerId); } catch {}
      } else {
        return;
      }
    }
    setDx(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, moveX)));
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.locked) return;
    suppressClickRef.current = true; // the release shouldn't click a button underneath
    setDragging(false);
    const forward = rtl ? -dx : dx;
    setDx(0);
    if (forward >= SWIPE_TRIGGER) onToggle();
    else if (forward <= -SWIPE_TRIGGER) onRemove();
  };

  const forwardSwipe = (rtl ? -dx : dx) > 0;
  const ActionIcon = forwardSwipe ? Check : X;

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
    <div className="relative">
      {/* action layer revealed behind the sliding row */}
      {dx !== 0 && (
        <div
          className={`absolute inset-0 rounded-2xl flex items-center px-5 text-cream ${
            forwardSwipe ? 'bg-leaf' : 'bg-rust'
          } ${dx > 0 ? 'justify-start' : 'justify-end'}`}
        >
          <ActionIcon size={18} strokeWidth={3} />
        </div>
      )}

      <div
        className={`relative bg-cream rounded-2xl ${dragging ? '' : 'transition-transform duration-200'}`}
        style={{ transform: `translateX(${dx}px)`, touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <div className={`bg-surface/70 border border-ink/10 rounded-2xl px-3 py-2.5 flex items-center gap-3 ${highlight ? 'remote-flash' : ''}`}>
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

          {/* tapping the name opens the category picker */}
          <button
            onClick={onOpenCategory}
            className={`flex-1 min-w-0 break-words text-start text-[15px] ${item.checked ? 'item-done' : ''}`}
          >
            {item.name}
          </button>

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
      </div>
    </div>
  );
}

export default ItemRow;
