import { Bell, ChevronLeft, ChevronRight, ListTodo, Plus, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatWhen, isRTL, t } from '../i18n.js';
import ItemRow from '../components/ItemRow.jsx';
import ReminderModal from '../components/ReminderModal.jsx';
import PhotoModal from '../components/PhotoModal.jsx';
import ExportModal from '../components/ExportModal.jsx';

function ListView({ lang, list, onBack, onAddItem, onPatchItem, onRemoveItem, onClearChecked, onSetReminder, onDelete }) {
  const [draft, setDraft] = useState('');
  const [reminderOpen, setReminderOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [photoItem, setPhotoItem] = useState(null); // item shown in the photo modal
  const [shareCopied, setShareCopied] = useState(false);

  const BackIcon = isRTL(lang) ? ChevronRight : ChevronLeft;
  const items = list.items;
  const toBuy = items.filter((i) => !i.checked);
  const inCart = items.filter((i) => i.checked);

  const addItem = () => {
    const name = draft.trim();
    if (!name) return;
    onAddItem(name);
    setDraft('');
  };

  // Anyone who opens the link joins the list and edits live.
  const shareList = async () => {
    const url = `${window.location.origin}/#list=${list.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: list.name, url }); } catch {}
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {}
  };

  const rowProps = (item) => ({
    item,
    lang,
    onToggle: () => onPatchItem(item.id, { checked: !item.checked }),
    onQty: (delta) => onPatchItem(item.id, { qty: Math.max(1, item.qty + delta) }),
    onRemove: () => onRemoveItem(item.id),
    onPhotoSaved: () => onPatchItem(item.id, { hasPhoto: true, photoRev: (item.photoRev || 0) + 1 }),
    onOpenPhoto: () => setPhotoItem(item),
  });

  return (
    <div>
      <header className="pt-6 pb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm opacity-60 hover:opacity-100 -ms-1.5">
          <BackIcon size={18} strokeWidth={2} />
          {t('back', lang)}
        </button>
        <div className="flex items-start justify-between gap-3 mt-3">
          <h1 className="f-display text-3xl font-bold break-words min-w-0">{list.name}</h1>
          <button
            onClick={() => {
              if (window.confirm(t('confirm_delete_list', lang))) onDelete();
            }}
            className="p-2 mt-0.5 opacity-40 hover:opacity-100 hover:text-rust shrink-0"
            aria-label={t('delete_list', lang)}
          >
            <Trash2 size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Reminder + Apple Reminders export */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setReminderOpen(true)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border ${
              list.reminderAt
                ? 'bg-leaf text-cream border-leaf'
                : 'bg-transparent text-leaf border-leaf/50'
            }`}
          >
            <Bell size={15} strokeWidth={2.5} />
            {list.reminderAt ? formatWhen(list.reminderAt, lang) : t('remind_me', lang)}
          </button>
          <button
            onClick={() => setExportOpen(true)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border border-ink/25 text-ink/70"
          >
            <ListTodo size={15} strokeWidth={2.5} />
            {t('export_btn', lang)}
          </button>
          <button
            onClick={shareList}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border border-ink/25 text-ink/70"
          >
            <Share2 size={15} strokeWidth={2.5} />
            {shareCopied ? t('share_copied', lang) : t('share_list', lang)}
          </button>
        </div>
      </header>

      {/* Add item */}
      <div className="flex gap-2 mb-6">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          placeholder={t('add_item_ph', lang)}
          className="flex-1 bg-white/70 border border-ink/15 rounded-xl px-4 py-3 text-base outline-none focus:border-leaf"
        />
        <button
          onClick={addItem}
          disabled={!draft.trim()}
          className="bg-leaf text-cream rounded-xl px-4 py-3 disabled:opacity-40"
          aria-label={t('add', lang)}
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      </div>

      {items.length === 0 && (
        <p className="text-sm opacity-60 py-8 text-center">{t('empty_list', lang)}</p>
      )}

      {toBuy.length > 0 && (
        <section className="mb-6">
          <h2 className="f-mono text-[11px] uppercase tracking-[0.25em] opacity-50 mb-2">
            {t('to_buy', lang)} — {toBuy.length}
          </h2>
          <div className="space-y-2">
            {toBuy.map((item) => <ItemRow key={item.id} {...rowProps(item)} />)}
          </div>
        </section>
      )}

      {inCart.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="f-mono text-[11px] uppercase tracking-[0.25em] opacity-50">
              {t('in_cart', lang)} — {inCart.length}
            </h2>
            <button onClick={onClearChecked} className="text-xs text-rust font-semibold">
              {t('clear_checked', lang)}
            </button>
          </div>
          <div className="space-y-2">
            {inCart.map((item) => <ItemRow key={item.id} {...rowProps(item)} />)}
          </div>
        </section>
      )}

      {reminderOpen && (
        <ReminderModal
          lang={lang}
          list={list}
          onClose={() => setReminderOpen(false)}
          onSet={onSetReminder}
        />
      )}

      {exportOpen && (
        <ExportModal lang={lang} list={list} onClose={() => setExportOpen(false)} />
      )}

      {photoItem && (
        <PhotoModal
          lang={lang}
          item={items.find((i) => i.id === photoItem.id) || photoItem}
          onClose={() => setPhotoItem(null)}
          onReplaced={() => onPatchItem(photoItem.id, { hasPhoto: true, photoRev: ((items.find((i) => i.id === photoItem.id)?.photoRev) || 0) + 1 })}
          onRemoved={() => { onPatchItem(photoItem.id, { hasPhoto: false }); setPhotoItem(null); }}
        />
      )}
    </div>
  );
}

export default ListView;
