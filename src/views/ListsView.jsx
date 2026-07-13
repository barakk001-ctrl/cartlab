import { Bell, Link2, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatWhen, t } from '../i18n.js';

// A shared link looks like https://…/#list=<id>; also accept a bare id.
const parseShareLink = (text) => {
  const m = text.match(/list=([a-z0-9]{6,40})/i) || text.trim().match(/^([a-z0-9]{6,40})$/i);
  return m ? m[1] : null;
};

function ListsView({ lang, setLang, lists, onCreate, onOpen, onDelete, onJoin }) {
  const [name, setName] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinValue, setJoinValue] = useState('');
  const [joinError, setJoinError] = useState(null);
  const [joining, setJoining] = useState(false);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName('');
  };

  const join = async () => {
    setJoinError(null);
    const id = parseShareLink(joinValue);
    if (!id) { setJoinError(t('join_invalid', lang)); return; }
    setJoining(true);
    const ok = await onJoin(id);
    setJoining(false);
    if (ok) {
      setJoinValue('');
      setJoinOpen(false);
      onOpen(id);
    } else {
      setJoinError(t('join_failed', lang));
    }
  };

  return (
    <div>
      <header className="pt-8 pb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart size={26} strokeWidth={2.2} className="text-leaf" />
            <h1 className="f-display text-4xl font-bold">{t('app_name', lang)}</h1>
          </div>
          <p className="f-mono text-[11px] uppercase tracking-[0.2em] mt-2 opacity-60">
            {t('tagline', lang)}
          </p>
        </div>
        <button
          onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
          className="f-mono text-[11px] uppercase tracking-[0.15em] border border-ink/30 rounded-full px-3 py-1.5 mt-1"
        >
          {t('lang_toggle', lang)}
        </button>
      </header>

      {/* Create a new list */}
      <div className="flex gap-2 mb-8">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder={t('new_list_ph', lang)}
          className="flex-1 bg-surface/70 border border-ink/15 rounded-xl px-4 py-3 text-base outline-none focus:border-leaf"
        />
        <button
          onClick={create}
          disabled={!name.trim()}
          className="bg-leaf text-cream rounded-xl px-4 py-3 flex items-center gap-1.5 disabled:opacity-40"
        >
          <Plus size={18} strokeWidth={2.5} />
          <span className="text-sm font-semibold">{t('create', lang)}</span>
        </button>
      </div>

      {/* Join a list someone shared (paste the link) */}
      <div className="-mt-4 mb-8">
        <button
          onClick={() => { setJoinOpen(!joinOpen); setJoinError(null); }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-leaf opacity-80 hover:opacity-100"
        >
          <Link2 size={13} strokeWidth={2.5} />
          {t('join_list', lang)}
        </button>
        {joinOpen && (
          <div className="mt-2">
            <div className="flex gap-2">
              <input
                value={joinValue}
                onChange={(e) => { setJoinValue(e.target.value); setJoinError(null); }}
                onKeyDown={(e) => e.key === 'Enter' && join()}
                placeholder={t('join_ph', lang)}
                dir="ltr"
                className="flex-1 min-w-0 bg-surface/70 border border-ink/15 rounded-xl px-4 py-3 text-sm outline-none focus:border-leaf"
              />
              <button
                onClick={join}
                disabled={!joinValue.trim() || joining}
                className="bg-leaf text-cream rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-40"
              >
                {t('join_btn', lang)}
              </button>
            </div>
            {joinError && <p className="text-xs text-rust mt-2">{joinError}</p>}
          </div>
        )}
      </div>

      <h2 className="f-mono text-[11px] uppercase tracking-[0.25em] opacity-50 mb-3">
        {t('my_lists', lang)}
      </h2>

      {lists.length === 0 && (
        <p className="text-sm opacity-60 py-8 text-center">{t('empty_lists', lang)}</p>
      )}

      <div className="space-y-3">
        {lists.map((list) => {
          const total = list.items.length;
          const left = list.items.filter((i) => !i.checked).length;
          const summary = total === 0
            ? t('items_zero', lang)
            : left === 0
              ? t('all_bought', lang, { total })
              : t('items_left', lang, { left, total });
          return (
            <div
              key={list.id}
              onClick={() => onOpen(list.id)}
              className="bg-surface/70 border border-ink/10 rounded-2xl px-4 py-4 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="flex-1 min-w-0">
                <div className="f-display text-xl font-bold truncate">{list.name}</div>
                <div className="text-xs opacity-60 mt-0.5">{summary}</div>
                {list.reminderAt && (
                  <div className="inline-flex items-center gap-1.5 mt-2 text-[11px] f-mono bg-leaf/10 text-leaf rounded-full px-2.5 py-1">
                    <Bell size={11} strokeWidth={2.5} />
                    {formatWhen(list.reminderAt, lang)}
                  </div>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(t('confirm_delete_list', lang))) onDelete(list.id);
                }}
                className="p-2 opacity-40 hover:opacity-100 hover:text-rust"
                aria-label={t('delete_list', lang)}
              >
                <Trash2 size={17} strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ListsView;
