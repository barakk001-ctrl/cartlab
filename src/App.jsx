import { useEffect, useRef, useState } from 'react';
import { isRTL } from './i18n.js';
import { loadLang, saveLang } from './storage.js';
import { useSyncedLists } from './hooks/useSyncedLists.js';
import { scheduleReminder, reminderIdFor } from './push.js';
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
    addItem, patchItem, removeItem, clearChecked,
    joinList,
  } = useSyncedLists();
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

  const active = lists.find((l) => l.id === activeId);

  return (
    <div dir={isRTL(lang) ? 'rtl' : 'ltr'} className="min-h-screen bg-cream text-ink safe-top safe-bottom">
      <div className="mx-auto max-w-lg px-4 pb-16">
        {active ? (
          <ListView
            lang={lang}
            list={active}
            onBack={() => openList(null)}
            onAddItem={(name) => addItem(active.id, name)}
            onPatchItem={(itemId, patch) => patchItem(active.id, itemId, patch)}
            onRemoveItem={(itemId) => removeItem(active.id, itemId)}
            onClearChecked={() => clearChecked(active.id)}
            onSetReminder={(at) => setReminder(active.id, at)}
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
          />
        )}
      </div>
    </div>
  );
}
