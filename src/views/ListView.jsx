import { Bell, ChevronLeft, ChevronRight, Copy, ListTodo, MapPin, Plus, Receipt, Share2, Trash2, TrendingUp, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatWhen, isRTL, t } from '../i18n.js';
import { groupItems, suggest } from '../catalog.js';
import { topHistory } from '../storage.js';
import { IS_IOS, isStandalone } from '../push.js';

const APP_HINT_KEY = 'cartlab:appHintDismissed';
import ItemRow from '../components/ItemRow.jsx';
import ReminderModal from '../components/ReminderModal.jsx';
import PhotoModal from '../components/PhotoModal.jsx';
import ExportModal from '../components/ExportModal.jsx';
import ItemModal from '../components/ItemModal.jsx';
import LocationModal from '../components/LocationModal.jsx';
import PricesModal from '../components/PricesModal.jsx';
import ReceiptModal from '../components/ReceiptModal.jsx';

function ListView({
  lang, list, knownNames, remoteTouched, onBack, onAddItem, onPatchItem, onRemoveItem,
  onClearChecked, onSetReminder, onSetPhoto, onRemovePhoto, onDedupe, onDelete,
}) {
  const [draft, setDraft] = useState('');
  const [reminderOpen, setReminderOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [pricesOpen, setPricesOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Transient confirmation after saving receipt prices.
  const [scanMsg, setScanMsg] = useState(null);
  const scanMsgTimer = useRef(null);
  const showScanMsg = (msg) => {
    setScanMsg(msg);
    if (scanMsgTimer.current) clearTimeout(scanMsgTimer.current);
    scanMsgTimer.current = setTimeout(() => setScanMsg(null), 6000);
  };
  useEffect(() => () => scanMsgTimer.current && clearTimeout(scanMsgTimer.current), []);
  const [photoItem, setPhotoItem] = useState(null); // item shown in the photo modal
  const [detailItem, setDetailItem] = useState(null); // item shown in the note/category sheet
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

  // Freshly checked items linger in a temporary "Just bought" section for 10
  // minutes — right below "To buy", above the older cart items — so what was
  // just grabbed stays in view (and is easy to un-check by mistake-tap). A
  // slow tick ages them down into "In cart".
  const TEMP_MS = 10 * 60 * 1000;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(handle);
  }, []);
  const isFresh = (i) => i.checkedAt && now - i.checkedAt < TEMP_MS;
  const justBought = inCart.filter(isFresh).sort((a, b) => b.checkedAt - a.checkedAt);
  const boughtEarlier = inCart.filter((i) => !isFresh(i));

  // Urgent items jump the queue: they render in their own section above the
  // store-section groups, so they're the first thing anyone opening the list
  // (say, from an urgent notification) sees.
  const urgentItems = toBuy.filter((i) => i.urgent);
  const regular = toBuy.filter((i) => !i.urgent);

  // "To buy" grouped by store section; if nothing is recognized, skip the
  // lone "Other" header and render flat.
  const groups = useMemo(() => groupItems(regular, lang), [items, lang]);
  const showGroupHeaders = !(groups.length === 1 && groups[0].key === 'other');

  const hasDupes = useMemo(() => {
    const seen = new Set();
    for (const i of items) {
      const key = `${i.name.trim().toLowerCase()}|${i.unit || ''}`; // matches dedupeItems
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }, [items]);

  // Small celebration when the last "to buy" item lands in the cart.
  const [celebrate, setCelebrate] = useState(false);
  const prevLeftRef = useRef(toBuy.length);
  useEffect(() => {
    const prev = prevLeftRef.current;
    prevLeftRef.current = toBuy.length;
    if (prev > 0 && toBuy.length === 0 && inCart.length > 0) {
      setCelebrate(true);
      const handle = setTimeout(() => setCelebrate(false), 1900);
      return () => clearTimeout(handle);
    }
  }, [toBuy.length, inCart.length]);

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
    highlight: remoteTouched?.has(item.id) || false,
    onToggle: () => onPatchItem(item.id, { checked: !item.checked }),
    onPatch: (patch) => onPatchItem(item.id, patch),
    onRemove: () => onRemoveItem(item.id),
    onPhoto: (blob) => onSetPhoto(item.id, blob),
    onOpenPhoto: () => setPhotoItem(item),
    onOpenCategory: () => setDetailItem(item),
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
          <button
            onClick={() => setLocOpen(true)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border border-ink/25 text-ink/70"
          >
            <MapPin size={15} strokeWidth={2.5} />
            {t('loc_btn', lang)}
          </button>
          <button
            onClick={() => setReceiptOpen(true)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border border-ink/25 text-ink/70"
          >
            <Receipt size={15} strokeWidth={2.5} />
            {t('receipt_btn', lang)}
          </button>
          <button
            onClick={() => setPricesOpen(true)}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border border-ink/25 text-ink/70"
          >
            <TrendingUp size={15} strokeWidth={2.5} />
            {t('prices_btn', lang)}
          </button>
        </div>

        {scanMsg && (
          <p className="mt-2 text-xs bg-leaf/10 text-ink/80 rounded-xl px-3 py-2">{scanMsg}</p>
        )}
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
            className="flex-1 min-w-0 bg-surface/70 border border-ink/15 rounded-xl px-4 py-3 text-base outline-none focus:border-leaf"
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
                className="inline-flex items-center gap-1.5 bg-surface/70 border border-ink/15 rounded-full px-3 py-1.5 text-[13px] active:scale-95 transition-transform"
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
          {urgentItems.length > 0 && (
            <div className="mb-3">
              <h3 className="text-xs font-bold text-rust text-center mb-1.5">
                🚨 {t('urgent', lang)}
              </h3>
              <div className="space-y-2">
                {urgentItems.map((item) => <ItemRow key={item.id} {...rowProps(item)} />)}
              </div>
            </div>
          )}
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

      {justBought.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="f-mono text-[11px] uppercase tracking-[0.25em] opacity-50">
              {t('just_bought', lang)} — {justBought.length}
            </h2>
            {boughtEarlier.length === 0 && (
              <button onClick={onClearChecked} className="text-xs text-rust font-semibold">
                {t('clear_checked', lang)}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {justBought.map((item) => <ItemRow key={item.id} {...rowProps(item)} />)}
          </div>
        </section>
      )}

      {boughtEarlier.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="f-mono text-[11px] uppercase tracking-[0.25em] opacity-50">
              {t('in_cart', lang)} — {boughtEarlier.length}
            </h2>
            <button onClick={onClearChecked} className="text-xs text-rust font-semibold">
              {t('clear_checked', lang)}
            </button>
          </div>
          <div className="space-y-2">
            {boughtEarlier.map((item) => <ItemRow key={item.id} {...rowProps(item)} />)}
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

      {locOpen && (
        <LocationModal lang={lang} list={list} onClose={() => setLocOpen(false)} />
      )}

      {pricesOpen && (
        <PricesModal lang={lang} listId={list.id} onClose={() => setPricesOpen(false)} />
      )}

      {receiptOpen && (
        <ReceiptModal
          lang={lang}
          listId={list.id}
          onClose={() => setReceiptOpen(false)}
          onSaved={(n) => {
            showScanMsg(t('receipt_saved', lang, { n }));
            setPricesOpen(true);
          }}
        />
      )}

      {celebrate && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="celebrate bg-leaf text-cream rounded-3xl px-8 py-6 text-2xl font-bold shadow-2xl f-display">
            {t('all_done', lang)} 🎉
          </div>
        </div>
      )}

      {detailItem && (
        <ItemModal
          lang={lang}
          listId={list.id}
          item={items.find((i) => i.id === detailItem.id) || detailItem}
          onClose={() => setDetailItem(null)}
          onPatch={(patch) => onPatchItem(detailItem.id, patch)}
        />
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
