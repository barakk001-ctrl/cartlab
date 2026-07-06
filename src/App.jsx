import { useEffect, useRef, useState } from 'react';
import { isRTL } from './i18n.js';
import { loadLang, loadLists, saveLang, saveLists, uid } from './storage.js';
import { deletePhotos } from './db.js';
import { cancelReminder, scheduleReminder } from './push.js';
import { buildReminderBody, buildReminderTitle } from './summary.js';
import ListsView from './views/ListsView.jsx';
import ListView from './views/ListView.jsx';

const hashListId = () => {
  const m = window.location.hash.match(/list=([A-Za-z0-9]+)/);
  return m ? m[1] : null;
};

export default function App() {
  const [lang, setLangState] = useState(loadLang);
  const [lists, setLists] = useState(() => {
    // Reminders that already fired are cleared on launch.
    const now = Date.now();
    return loadLists().map((l) =>
      l.reminderAt && l.reminderAt < now ? { ...l, reminderAt: null } : l
    );
  });
  // Notification taps deep-link to /#list=<id>.
  const [activeId, setActiveId] = useState(hashListId);

  useEffect(() => { saveLists(lists); }, [lists]);

  useEffect(() => {
    const onHash = () => setActiveId(hashListId());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const openList = (id) => {
    setActiveId(id);
    try {
      if (id) window.location.hash = `list=${id}`;
      else history.replaceState(null, '', window.location.pathname);
    } catch {}
  };

  const setLang = (l) => { setLangState(l); saveLang(l); };

  const updateList = (id, updater) =>
    setLists((ls) => ls.map((l) => (l.id === id ? updater(l) : l)));

  const createList = (name) => {
    const list = { id: uid(), name, createdAt: Date.now(), reminderAt: null, items: [] };
    setLists((ls) => [list, ...ls]);
    openList(list.id);
  };

  const deleteList = (id) => {
    const list = lists.find((l) => l.id === id);
    if (list) {
      deletePhotos(list.items.map((i) => i.id)).catch(() => {});
      if (list.reminderAt) cancelReminder(list.id);
    }
    setLists((ls) => ls.filter((l) => l.id !== id));
    if (activeId === id) openList(null);
  };

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
          list.id, list.reminderAt,
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
            onChange={(updater) => updateList(active.id, updater)}
            onDelete={() => deleteList(active.id)}
          />
        ) : (
          <ListsView
            lang={lang}
            setLang={setLang}
            lists={lists}
            onCreate={createList}
            onOpen={openList}
            onDelete={deleteList}
          />
        )}
      </div>
    </div>
  );
}
