import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, WifiOff } from 'lucide-react';
import { isRTL, t } from './i18n.js';
import { loadLang, saveLang } from './storage.js';
import { useSyncedLists } from './hooks/useSyncedLists.js';
import { useWakeLock } from './hooks/useWakeLock.js';
import { scheduleReminder, reminderIdFor, subscribeUrgentAlerts } from './push.js';
import { buildReminderBody, buildReminderTitle } from './summary.js';
import ListsView from './views/ListsView.jsx';
import ListView from './views/ListView.jsx';

const hashListId = () => {
  const m = window.location.hash.match(/list=([A-Za-z0-9]+)/);
  return m ? m[1] : null;
};

export default function App() {
  const [lang, setLangState] = useState(loadLang);
  const {
    lists,
    createList, deleteList, setReminder,
    addItem, patchItem, removeItem, clearChecked, dedupeItems,
    setItemPhoto, removeItemPhoto,
    joinList,
    undoInfo, undoRemoval, syncState, remoteTouched,
  } = useSyncedLists();

  // Sync pill: offline shows immediately; "Syncing…" only if it lingers
  // (>800ms), so every quick tap doesn't flash a pill.
  const [showPending, setShowPending] = useState(false);
  useEffect(() => {
    if (syncState !== 'pending') { setShowPending(false); return; }
    const handle = setTimeout(() => setShowPending(true), 800);
    return () => clearTimeout(handle);
  }, [syncState]);
  const syncPill = syncState === 'offline'
    ? t('sync_offline', lang)
    : syncState === 'pending' && showPending ? t('sync_pending', lang) : null;

  // Every item name the user has ever put on a list — feeds autocomplete.
  const knownNames = useMemo(
    () => [...new Set(lists.flatMap((l) => l.items.map((i) => i.name)))],
    [lists],
  );
  // Notification taps and share links both deep-link to /#list=<id>.
  const [activeId, setActiveId] = useState(hashListId);

  useEffect(() => {
    const onHash = () => setActiveId(hashListId());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // A hash pointing at a list we don't have is a share link — join it. The
  // list pops into view as soon as the server returns it.
  useEffect(() => {
    if (activeId && !lists.some((l) => l.id === activeId)) joinList(activeId);
  }, [activeId, lists]);

  const openList = (id) => {
    setActiveId(id);
    try {
      if (id) window.location.hash = `list=${id}`;
      else history.replaceState(null, '', window.location.pathname);
    } catch {}
  };

  const setLang = (l) => { setLangState(l); saveLang(l); };

  // Keep scheduled reminders honest: if a list with a future reminder changes
  // (items added, checked off, renamed), re-post the schedule after a debounce
  // so the lock-screen text matches what's actually left to buy.
  const syncedRef = useRef({});
  useEffect(() => {
    const handle = setTimeout(() => {
      for (const list of lists) {
        if (!list.reminderAt || list.reminderAt < Date.now() + 5000) continue;
        const snapshot = JSON.stringify([
          list.name, list.reminderAt, lang,
          list.items.map((i) => [i.name, i.qty, i.checked]),
        ]);
        if (syncedRef.current[list.id] === snapshot) continue;
        syncedRef.current[list.id] = snapshot;
        scheduleReminder(
          reminderIdFor(list.id), list.reminderAt,
          buildReminderTitle(list), buildReminderBody(list, lang),
          `/#list=${list.id}`,
        );
      }
    }, 1500);
    return () => clearTimeout(handle);
  }, [lists, lang]);

  // Keep this device registered for urgent-item alerts on every list it has.
  // A no-op (returns false) until notification permission is granted, so it
  // keeps retrying on list changes and starts sticking once permission lands.
  const urgentSubsRef = useRef(new Set());
  useEffect(() => {
    for (const list of lists) {
      const key = `${list.id}|${lang}`;
      if (urgentSubsRef.current.has(key)) continue;
      urgentSubsRef.current.add(key);
      subscribeUrgentAlerts(list.id, lang).then((ok) => {
        if (!ok) urgentSubsRef.current.delete(key);
      });
    }
  }, [lists, lang]);

  const active = lists.find((l) => l.id === activeId);

  // Same as FitLab's guided workouts: keep the screen awake while a list is
  // open, so the phone doesn't lock mid-aisle with flour on your hands.
  useWakeLock(!!active);

  return (
    <div dir={isRTL(lang) ? 'rtl' : 'ltr'} className="min-h-screen bg-cream text-ink safe-top safe-bottom">
      <div className="mx-auto max-w-lg px-4 pb-16">
        {active ? (
          <ListView
            lang={lang}
            list={active}
            knownNames={knownNames}
            remoteTouched={remoteTouched}
            onBack={() => openList(null)}
            onAddItem={(name) => addItem(active.id, name)}
            onPatchItem={(itemId, patch) => patchItem(active.id, itemId, patch)}
            onRemoveItem={(itemId) => removeItem(active.id, itemId)}
            onClearChecked={() => clearChecked(active.id)}
            onSetReminder={(at) => setReminder(active.id, at)}
            onSetPhoto={(itemId, blob) => setItemPhoto(active.id, itemId, blob)}
            onRemovePhoto={(itemId) => removeItemPhoto(active.id, itemId)}
            onDedupe={() => dedupeItems(active.id)}
            onDelete={() => { deleteList(active.id); openList(null); }}
          />
        ) : (
          <ListsView
            lang={lang}
            setLang={setLang}
            lists={lists}
            onCreate={(name) => openList(createList(name))}
            onOpen={openList}
            onDelete={deleteList}
            onJoin={joinList}
          />
        )}
      </div>

      {syncPill && (
        <div className="fixed bottom-16 inset-x-0 flex justify-center z-30 pointer-events-none px-4">
          <div className="bg-ink/85 text-cream text-xs rounded-full px-3.5 py-1.5 shadow-lg flex items-center gap-1.5">
            {syncState === 'offline' && <WifiOff size={12} strokeWidth={2.5} />}
            {syncPill}
          </div>
        </div>
      )}

      {undoInfo && (
        <div className="fixed bottom-4 inset-x-0 flex justify-center z-40 px-4">
          <button
            onClick={undoRemoval}
            className="bg-ink text-cream rounded-full ps-5 pe-4 py-3 flex items-center gap-3 shadow-xl"
          >
            <span className="text-sm">
              {undoInfo.count === 1 ? t('removed_one', lang) : t('removed_many', lang, { n: undoInfo.count })}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-bold text-cream bg-leaf rounded-full px-3 py-1">
              <RotateCcw size={13} strokeWidth={2.5} />
              {t('undo', lang)}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
