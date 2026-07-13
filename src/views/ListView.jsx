import { Bell, ChevronLeft, ChevronRight, Copy, ListTodo, Plus, Share2, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatWhen, isRTL, t } from '../i18n.js';
import { groupItems, suggest } from '../catalog.js';
import { topHistory } from '../storage.js';
import { IS_IOS, isStandalone } from '../push.js';

const APP_HINT_KEY = 'cartlab:appHintDismissed';
import ItemRow from '../components/ItemRow.jsx';
import ReminderModal from '../components/ReminderModal.jsx';
import PhotoModal from '../components/PhotoModal.jsx';
import ExportModal from '../components/ExportModal.jsx';

function ListView({
  lang, list, knownNames, onBack, onAddItem, onPatchItem, onRemoveItem,
  onClearChecked, onSetReminder, onSetPhoto, onRemovePhoto, onDedupe, onDelete,
}) {
  const [draft, setDraft] = useState('');
  const [reminderOpen, setReminderOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [photoItem, setPhotoItem] = useState(null); // item shown in the photo modal
  const [shareCopied, setShareCopied] = useState(false);
  // iOS never opens links in the installed web app, so a shared link lands in
  // Safari — nudge the recipient toward the in-app "Join a shared list" flow.
  const [appHint, setAppHint] = useState(() => {
    try { return IS_IOS && !isStandalone() && !window.localStorage.getItem(APP_HINT_KEY); }
    catch { return false; }
  });
  const [hintCopied, setHintCopied] = useState(false);

  const dismissHint = () => {
    try { window.localStorage.setItem(APP_HINT_KEY, '1'); } catch {}
    setAppHint(false);
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/#list=${list.id}`);
      setHintCopied(true);
      setTimeout(() => setHintCopied(false), 2000);
    } catch {}
  };

  const BackIcon = isRTL(lang) ? ChevronRight : ChevronLeft;
  const items = list.items;
  const toBuy = items.filter((i) => !i.checked);
  const inCart = items.filter((i) => i.checked);

  // "To buy" grouped by store section; if nothing is recognized, skip the
  // lone "Other" header and render flat.
  const groups = useMemo(() => groupItems(toBuy, lang), [toBuy, lang]);
  const showGroupHeaders = !(groups.length === 1 && groups[0].key === 'other');

  const hasDupes = useMemo(() => {
    const seen = new Set();
    for (const i of items) {
      const key = i.name.trim().toLowerCase();
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }, [items]);

  const addItem = (name = draft) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddItem(trimmed);
    setDraft('');
  };

  // Autocomplete while typing: common groceries + names the user has used
  // before, minus what's already on this list.
  const suggestions = useMemo(
    () => suggest(draft, lang, {
      history: knownNames || [],
      exclude: items.map((i) => i.name),
    }),
    [draft, lang, knownNames, items],
  );

  // One-tap re-add of the things this user buys again and again. Hidden
  // while typing (autocomplete takes over) and for items already listed.
  const frequent = useMemo(
    () => (draft.trim() ? [] : topHistory(items.map((i) => i.name), 8)),
    [draft, items],
  );

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
    listId: list.id,
    onToggle: () => onPatchItem(item.id, { checked: !item.checked }),
    onQty: (delta) => onPatchItem(item.id, { qty: Math.max(1, item.qty + delta) }),
    onRemove: () => onRemoveItem(item.id),
    onPhoto: (blob) => onSetPhoto(item.id, blob),
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

      {appHint && (
        <div className="bg-leaf/10 border border-leaf/25 rounded-2xl px-4 py-3 mb-5 text-[13px] leading-relaxed">
          <div className="flex items-start gap-2">
            <p className="flex-1">{t('open_in_app_hint', lang)}</p>
            <button onClick={dismissHint} className="p-1 opacity-50 hover:opacity-100 shrink-0" aria-label={t('dismiss', lang)}>
              <X size={15} strokeWidth={2.5} />
            </button>
          </div>
          <button
            onClick={copyShareLink}
            className="inline-flex items-center gap-1.5 mt-2 text-leaf font-semibold"
          >
            <Copy size={13} strokeWidth={2.5} />
            {hintCopied ? t('share_copied', lang) : t('copy_link', lang)}
          </button>
        </div>
      )}

      {/* Add item, with autocomplete from the catalog + past items */}
      <div className="relative mb-6">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder={t('add_item_ph', lang)}
            className="flex-1 min-w-0 bg-white/70 border border-ink/15 rounded-xl px-4 py-3 text-base outline-none focus:border-leaf"
          />
          <button
            onClick={() => addItem()}
            disabled={!draft.trim()}
            className="bg-leaf text-cream rounded-xl px-4 py-3 disabled:opacity-40"
            aria-label={t('add', lang)}
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="absolute top-full inset-x-0 mt-1 z-20 bg-cream border border-ink/15 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((name) => (
              <button
                key={name}
                onMouseDown={(e) => e.preventDefault() /* keep the input focused */}
                onClick={() => addItem(name)}
                className="w-full text-start px-4 py-2.5 text-[15px] hover:bg-leaf/10 active:bg-leaf/15 border-b border-ink/5 last:border-b-0 flex items-center gap-2"
              >
                <Plus size={14} strokeWidth={2.5} className="text-leaf shrink-0" />
                <span className="truncate">{name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {frequent.length > 0 && (
        <div className="mb-6 -mt-2">
          <h3 className="f-mono text-[10px] uppercase tracking-[0.2em] opacity-45 mb-2">
            {t('frequent', lang)}
          </h3>
          <div className="flex flex-wrap gap-2">
            {frequent.map((name) => (
              <button
                key={name}
                onClick={() => addItem(name)}
                className="inline-flex items-center gap-1.5 bg-white/70 border border-ink/15 rounded-full px-3 py-1.5 text-[13px] active:scale-95 transition-transform"
              >
                <Plus size={12} strokeWidth={2.5} className="text-leaf" />
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <p className="text-sm opacity-60 py-8 text-center">{t('empty_list', lang)}</p>
      )}

      {toBuy.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="f-mono text-[11px] uppercase tracking-[0.25em] opacity-50">
              {t('to_buy', lang)} — {toBuy.length}
            </h2>
            {hasDupes && (
              <button onClick={onDedupe} className="text-xs text-leaf font-semibold">
                {t('merge_dupes', lang)}
              </button>
            )}
          </div>
          {groups.map((group) => (
            <div key={group.key} className="mb-3 last:mb-0">
              {showGroupHeaders && (
                <h3 className="text-xs font-bold text-leaf/80 text-center mb-1.5">
                  {group.label}
                </h3>
              )}
              <div className="space-y-2">
                {group.items.map((item) => <ItemRow key={item.id} {...rowProps(item)} />)}
              </div>
            </div>
          ))}
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
          listId={list.id}
          item={items.find((i) => i.id === photoItem.id) || photoItem}
          onClose={() => setPhotoItem(null)}
          onReplaced={(blob) => onSetPhoto(photoItem.id, blob)}
          onRemoved={() => { onRemovePhoto(photoItem.id); setPhotoItem(null); }}
        />
      )}
    </div>
  );
}

export default ListView;
