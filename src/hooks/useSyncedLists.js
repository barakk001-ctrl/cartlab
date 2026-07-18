// ------------------------------------------------------------
// Shared-list state. The server is the source of truth; localStorage is the
// offline cache so the PWA still works in a basement supermarket aisle.
//
// Reads:  render from cache instantly, refetch on boot/focus, live-update via
//         the SSE change feed (one connection for all known lists).
// Writes: applied optimistically to local state, enqueued, and replayed to
//         the server in order. Network failure keeps the op queued (retried
//         on reconnect); a 4xx drops the op and resyncs that list.
// Photos sync too: blobs cache in IndexedDB, uploads/removals queue
// separately (the blob can't live in localStorage) and the server owns
// hasPhoto/photoRev — except while this device still has an upload pending,
// when its local state wins.
// ------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.js';
import { bumpHistory, loadLists, saveLists, uid } from '../storage.js';
import { deletePhoto, deletePhotos, getPhoto, savePhoto } from '../db.js';
import { cancelReminder, reminderIdFor } from '../push.js';
import * as sync from '../sync.js';

const RETRY_MS = 15000;

// A reminder that already fired shouldn't resurface from cache or server.
const normalizeReminder = (at) => (at && at > Date.now() ? at : null);

// The synced item fields, as a putItem op body (photo state is server-owned).
const sharedItemBody = (i) => ({
  id: i.id, name: i.name, qty: i.qty, checked: i.checked, createdAt: i.createdAt,
  cat: i.cat || null, unit: i.unit || null, note: i.note || null, urgent: !!i.urgent,
});

export function useSyncedLists() {
  const [lists, setListsState] = useState(() =>
    loadLists().map((l) => ({ ...l, reminderAt: normalizeReminder(l.reminderAt) })));

  const listsRef = useRef(lists);
  const queueRef = useRef(sync.loadQueue());
  const photoQueueRef = useRef(sync.loadPhotoQueue());
  const photoFlushingRef = useRef(false);
  const versionsRef = useRef(sync.loadVersions());
  const syncedRef = useRef(new Set(sync.loadSynced()));
  const staleRef = useRef(new Set());   // lists that changed remotely while ops were pending
  const joiningRef = useRef(new Map()); // listId -> in-flight join promise
  const flushingRef = useRef(false);
  const retryRef = useRef(null);
  const esRef = useRef(null);

  // 'synced' | 'pending' (ops queued/flushing) | 'offline' (flush failed)
  const [syncState, setSyncState] = useState('synced');
  const refreshSyncState = (offline = false) => {
    const busy = queueRef.current.length + photoQueueRef.current.length > 0;
    setSyncState(!busy ? 'synced' : offline ? 'offline' : 'pending');
  };

  // Ids of items recently changed by another device — the UI flashes them so
  // a partner's edits are visible instead of just teleporting in.
  const [remoteTouched, setRemoteTouched] = useState(() => new Set());
  const remoteTimersRef = useRef(new Map());
  const markRemote = (ids) => {
    if (!ids.length) return;
    setRemoteTouched((prev) => new Set([...prev, ...ids]));
    for (const id of ids) {
      const old = remoteTimersRef.current.get(id);
      if (old) clearTimeout(old);
      remoteTimersRef.current.set(id, setTimeout(() => {
        remoteTimersRef.current.delete(id);
        setRemoteTouched((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 2500));
    }
  };

  // Undo window for removals: the delete is committed immediately (state +
  // queued ops), but a snapshot — including the photo blob, read before it's
  // wiped — survives for a few seconds so Undo can recreate everything.
  const [undoInfo, setUndoInfo] = useState(null);
  const undoRef = useRef({ entries: [], timer: null });

  const stageUndo = (entries) => {
    undoRef.current.entries.push(...entries);
    if (undoRef.current.timer) clearTimeout(undoRef.current.timer);
    undoRef.current.timer = setTimeout(() => {
      undoRef.current = { entries: [], timer: null };
      setUndoInfo(null);
    }, 6000);
    setUndoInfo({ count: undoRef.current.entries.length });
  };

  const setLists = (next) => {
    listsRef.current = next;
    setListsState(next);
    saveLists(next);
  };

  const persistQueue = () => sync.saveQueue(queueRef.current);
  const persistVersions = () => sync.saveVersions(versionsRef.current);
  const persistSynced = () => sync.saveSynced(syncedRef.current);
  const pendingFor = (listId) => queueRef.current.some((op) => op.listId === listId);

  // Replace local list state with the server's. Photo state comes from the
  // server unless this device has a photo op still queued for the item — its
  // local intent (new photo / removal) wins until the op lands.
  const applyServer = (server) => {
    const local = listsRef.current.find((l) => l.id === server.id);
    const merged = {
      id: server.id,
      name: server.name,
      createdAt: server.createdAt,
      reminderAt: normalizeReminder(server.reminderAt),
      items: server.items.map((si) => {
        if (photoQueueRef.current.some((op) => op.itemId === si.id)) {
          const li = local?.items.find((i) => i.id === si.id);
          return { ...si, hasPhoto: li?.hasPhoto || false, photoRev: li?.photoRev || 0 };
        }
        return si;
      }),
    };
    versionsRef.current[server.id] = server.version;
    persistVersions();
    syncedRef.current.add(server.id);
    persistSynced();
    // Anything new or different vs. what we had is a remote edit (our own
    // optimistic edits already match the server copy by the time it arrives).
    if (local) {
      const prevById = new Map(local.items.map((i) => [i.id, i]));
      markRemote(merged.items
        .filter((si) => {
          const prev = prevById.get(si.id);
          return !prev || prev.name !== si.name || prev.qty !== si.qty
            || prev.checked !== si.checked || (prev.cat || null) !== (si.cat || null)
            || (prev.unit || null) !== (si.unit || null) || (prev.note || null) !== (si.note || null)
            || !!prev.urgent !== !!si.urgent;
        })
        .map((i) => i.id));
    }
    setLists(local
      ? listsRef.current.map((l) => (l.id === server.id ? merged : l))
      : [merged, ...listsRef.current]);
  };

  // The list is gone from the server (deleted by another device).
  const dropLocal = (listId) => {
    const list = listsRef.current.find((l) => l.id === listId);
    if (!list) return;
    deletePhotos(list.items.map((i) => i.id)).catch(() => {});
    cancelReminder(reminderIdFor(listId));
    forget(listId);
    setLists(listsRef.current.filter((l) => l.id !== listId));
  };

  const forget = (listId) => {
    delete versionsRef.current[listId];
    persistVersions();
    syncedRef.current.delete(listId);
    persistSynced();
  };

  const refetch = async (listId) => {
    if (pendingFor(listId)) {
      staleRef.current.add(listId);
      return;
    }
    try {
      const res = await api.getList(listId, versionsRef.current[listId]);
      if (!res.unchanged) applyServer(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404 && syncedRef.current.has(listId)) dropLocal(listId);
      // network errors: cache stays authoritative until the next trigger
    }
  };

  const refetchAll = () => {
    for (const l of listsRef.current) {
      if (syncedRef.current.has(l.id)) refetch(l.id);
    }
  };

  const runOp = (op) => {
    switch (op.kind) {
      case 'putList': {
        const list = listsRef.current.find((l) => l.id === op.listId);
        // Send current state, not the enqueue-time snapshot — later queued
        // item ops still replay after this and land on the same result.
        return api.putList(list || { id: op.listId, ...op.body });
      }
      case 'patchList': return api.patchList(op.listId, op.body);
      case 'deleteList': return api.deleteList(op.listId);
      case 'putItem': return api.putItem(op.listId, op.body);
      case 'deleteItem': return api.deleteItem(op.listId, op.itemId);
      case 'bulkDelete': return api.bulkDeleteItems(op.listId, op.body.ids);
      default: return Promise.resolve(null);
    }
  };

  const scheduleRetry = () => {
    if (retryRef.current) return;
    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      flush();
      flushPhotos();
    }, RETRY_MS);
  };

  // Photo uploads/removals replay like the op queue, but blobs come from
  // IndexedDB. A 4xx means the item/list is gone or rejected — drop the op.
  const flushPhotos = async () => {
    if (photoFlushingRef.current) return;
    photoFlushingRef.current = true;
    try {
      while (photoQueueRef.current.length) {
        const op = photoQueueRef.current[0];
        op.inFlight = true;
        try {
          if (op.remove) {
            await api.deletePhoto(op.listId, op.itemId);
          } else {
            const entry = await getPhoto(op.itemId);
            if (entry?.blob) {
              const res = await api.uploadPhoto(op.listId, op.itemId, entry.blob);
              await savePhoto(op.itemId, entry.blob, res.photoRev).catch(() => {});
              patchItem(op.listId, op.itemId, { hasPhoto: true, photoRev: res.photoRev });
              versionsRef.current[op.listId] = res.version;
              persistVersions();
            }
          }
          photoQueueRef.current.shift();
          sync.savePhotoQueue(photoQueueRef.current);
        } catch (e) {
          if (e instanceof ApiError) {
            photoQueueRef.current.shift();
            sync.savePhotoQueue(photoQueueRef.current);
            staleRef.current.add(op.listId);
          } else {
            op.inFlight = false;
            refreshSyncState(true);
            scheduleRetry();
            return;
          }
        }
      }
      refreshSyncState();
      const stale = [...staleRef.current];
      staleRef.current.clear();
      await Promise.all(stale.map(refetch));
    } finally {
      photoFlushingRef.current = false;
    }
  };

  const flush = async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      while (queueRef.current.length) {
        const op = queueRef.current[0];
        op.inFlight = true; // freeze it against queue collapses (see sync.js)
        try {
          const res = await runOp(op);
          queueRef.current.shift();
          persistQueue();
          if (res?.version) {
            versionsRef.current[op.listId] = res.version;
            persistVersions();
          }
          if (op.kind === 'putList') {
            syncedRef.current.add(op.listId);
            persistSynced();
          }
        } catch (e) {
          if (e instanceof ApiError) {
            // Server said no (list deleted elsewhere, bad payload) — drop the
            // op and resync so local state converges back to the server's.
            queueRef.current.shift();
            persistQueue();
            staleRef.current.add(op.listId);
          } else {
            op.inFlight = false;
            refreshSyncState(true);
            scheduleRetry(); // offline / server unreachable — keep the queue
            return;
          }
        }
      }
      refreshSyncState();
      const stale = [...staleRef.current];
      staleRef.current.clear();
      await Promise.all(stale.map(refetch));
    } finally {
      flushingRef.current = false;
    }
  };

  const commit = (nextLists, op) => {
    setLists(nextLists);
    if (op) {
      sync.enqueue(queueRef.current, op);
      persistQueue();
      refreshSyncState();
      flush();
    }
  };

  // ---- mutators (all optimistic) ----

  const createList = (name) => {
    const list = { id: sync.newId(), name, createdAt: Date.now(), reminderAt: null, items: [] };
    commit([list, ...listsRef.current], { kind: 'putList', listId: list.id, body: {} });
    return list.id;
  };

  const deleteList = (listId) => {
    const list = listsRef.current.find((l) => l.id === listId);
    if (!list) return;
    deletePhotos(list.items.map((i) => i.id)).catch(() => {});
    if (list.reminderAt) cancelReminder(reminderIdFor(listId));
    forget(listId);
    commit(listsRef.current.filter((l) => l.id !== listId), { kind: 'deleteList', listId });
  };

  const setReminder = (listId, at) => {
    commit(
      listsRef.current.map((l) => (l.id === listId ? { ...l, reminderAt: at } : l)),
      { kind: 'patchList', listId, body: { reminderAt: at } },
    );
  };

  const addItem = (listId, name) => {
    const item = { id: uid(), name, qty: 1, checked: false, hasPhoto: false, createdAt: Date.now() };
    commit(
      listsRef.current.map((l) => (l.id === listId ? { ...l, items: [...l.items, item] } : l)),
      { kind: 'putItem', listId, body: { id: item.id, name, qty: 1, checked: false, createdAt: item.createdAt } },
    );
  };

  const patchItem = (listId, itemId, patch) => {
    const list = listsRef.current.find((l) => l.id === listId);
    const item = list?.items.find((i) => i.id === itemId);
    if (!item) return;
    const next = { ...item, ...patch };
    if (patch.checked === true && !item.checked) bumpHistory(item.name); // bought → learn it
    const nextLists = listsRef.current.map((l) =>
      l.id === listId ? { ...l, items: l.items.map((i) => (i.id === itemId ? next : i)) } : l);
    // Photo-only patches are device-local — update state without a server op.
    const shared = ['name', 'qty', 'checked', 'cat', 'unit', 'note', 'urgent'].some((k) => k in patch);
    commit(nextLists, shared
      ? { kind: 'putItem', listId, body: sharedItemBody(next) }
      : null);
  };

  // Snapshot an item for undo. The photo blob is read before deletion —
  // IndexedDB runs the get before the delete because the transactions are
  // created in that order.
  const snapshotItem = (listId, list, item) => ({
    listId,
    item,
    index: list.items.indexOf(item),
    blobPromise: item.hasPhoto ? getPhoto(item.id).catch(() => null) : null,
  });

  const removeItem = (listId, itemId) => {
    const list = listsRef.current.find((l) => l.id === listId);
    const item = list?.items.find((i) => i.id === itemId);
    if (!item) return;
    const snapshot = snapshotItem(listId, list, item);
    deletePhoto(itemId).catch(() => {});
    commit(
      listsRef.current.map((l) =>
        l.id === listId ? { ...l, items: l.items.filter((i) => i.id !== itemId) } : l),
      { kind: 'deleteItem', listId, itemId },
    );
    stageUndo([snapshot]);
  };

  const clearChecked = (listId) => {
    const list = listsRef.current.find((l) => l.id === listId);
    if (!list) return;
    const removed = list.items.filter((i) => i.checked);
    if (!removed.length) return;
    const snapshots = removed.map((i) => snapshotItem(listId, list, i));
    deletePhotos(removed.map((i) => i.id)).catch(() => {});
    commit(
      listsRef.current.map((l) =>
        l.id === listId ? { ...l, items: l.items.filter((i) => !i.checked) } : l),
      { kind: 'bulkDelete', listId, body: { ids: removed.map((i) => i.id) } },
    );
    stageUndo(snapshots);
  };

  // Recreate everything the last removal(s) took: the items (same ids, so
  // they return to their original spot in the ordering) and their photos,
  // which re-upload through the normal photo queue.
  const undoRemoval = () => {
    const { entries, timer } = undoRef.current;
    if (timer) clearTimeout(timer);
    undoRef.current = { entries: [], timer: null };
    setUndoInfo(null);
    for (const { listId, item, index, blobPromise } of entries) {
      const list = listsRef.current.find((l) => l.id === listId);
      if (!list || list.items.some((i) => i.id === item.id)) continue;
      const restored = { ...item, hasPhoto: false, photoRev: 0 };
      const items = [...list.items];
      items.splice(Math.min(index, items.length), 0, restored);
      commit(
        listsRef.current.map((l) => (l.id === listId ? { ...l, items } : l)),
        { kind: 'putItem', listId, body: sharedItemBody(restored) },
      );
      if (blobPromise) {
        blobPromise.then((entry) => {
          if (entry?.blob) setItemPhoto(listId, item.id, entry.blob);
        });
      }
    }
  };

  // Merge items with the same (case-insensitive) name: one survivor per name
  // (preferring one with a photo) with the quantities summed; checked only if
  // every duplicate was checked. Returns how many duplicates were removed.
  const dedupeItems = (listId) => {
    const list = listsRef.current.find((l) => l.id === listId);
    if (!list) return 0;
    // Key on name + unit: 2 packs of pita and 500 g of pita don't sum.
    const byName = new Map();
    for (const item of list.items) {
      const key = `${item.name.trim().toLowerCase()}|${item.unit || ''}`;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(item);
    }
    const keepers = [];
    const removed = [];
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      const keeper = group.find((i) => i.hasPhoto) || group[0];
      keepers.push({
        ...keeper,
        qty: Math.min(999, Math.round(group.reduce((sum, i) => sum + i.qty, 0) * 100) / 100),
        checked: group.every((i) => i.checked),
      });
      removed.push(...group.filter((i) => i !== keeper));
    }
    if (!removed.length) return 0;
    deletePhotos(removed.map((i) => i.id)).catch(() => {});
    const removedIds = new Set(removed.map((i) => i.id));
    const keeperById = new Map(keepers.map((k) => [k.id, k]));
    setLists(listsRef.current.map((l) =>
      l.id === listId
        ? { ...l, items: l.items.filter((i) => !removedIds.has(i.id)).map((i) => keeperById.get(i.id) || i) }
        : l));
    for (const k of keepers) {
      sync.enqueue(queueRef.current, { kind: 'putItem', listId, body: sharedItemBody(k) });
    }
    sync.enqueue(queueRef.current, { kind: 'bulkDelete', listId, body: { ids: [...removedIds] } });
    persistQueue();
    flush();
    return removed.length;
  };

  // Photo taken/replaced: cache the blob locally (rev 0 = not uploaded yet),
  // show it immediately, and queue the upload.
  const setItemPhoto = async (listId, itemId, blob) => {
    try { await savePhoto(itemId, blob, 0); } catch { return; }
    patchItem(listId, itemId, { hasPhoto: true, photoRev: 0 });
    sync.enqueuePhoto(photoQueueRef.current, { listId, itemId });
    sync.savePhotoQueue(photoQueueRef.current);
    refreshSyncState();
    flushPhotos();
  };

  const removeItemPhoto = (listId, itemId) => {
    deletePhoto(itemId).catch(() => {});
    patchItem(listId, itemId, { hasPhoto: false, photoRev: 0 });
    sync.enqueuePhoto(photoQueueRef.current, { listId, itemId, remove: true });
    sync.savePhotoQueue(photoQueueRef.current);
    refreshSyncState();
    flushPhotos();
  };

  // Pull an unknown list from the server — used by share links (hash) and
  // the manual "Join a shared list" flow. Resolves to whether the list is
  // now available locally.
  const joinList = (listId) => {
    if (!listId) return Promise.resolve(false);
    if (listsRef.current.some((l) => l.id === listId)) return Promise.resolve(true);
    let pending = joiningRef.current.get(listId);
    if (!pending) {
      pending = api.getList(listId)
        .then((res) => { applyServer(res); return true; })
        .catch(() => false)
        .finally(() => joiningRef.current.delete(listId));
      joiningRef.current.set(listId, pending);
    }
    return pending;
  };

  // ---- live updates ----

  const ensureEventSource = () => {
    const ids = listsRef.current.map((l) => l.id);
    if (!ids.length) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }
    const url = `/api/events?lists=${ids.join(',')}`;
    if (esRef.current && esRef.current._url === url && esRef.current.readyState !== EventSource.CLOSED) return;
    esRef.current?.close();
    const es = new EventSource(url);
    es._url = url;
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.deleted) {
          if (!pendingFor(msg.id)) dropLocal(msg.id);
        } else if ((versionsRef.current[msg.id] || 0) < msg.version) {
          refetch(msg.id);
        }
      } catch {}
    };
    esRef.current = es;
  };

  const idsKey = lists.map((l) => l.id).sort().join(',');
  useEffect(() => {
    ensureEventSource();
  }, [idsKey]);

  useEffect(() => {
    // First upload of lists that predate sharing (or created while offline
    // before the queue existed).
    for (const l of listsRef.current) {
      if (!syncedRef.current.has(l.id) && !queueRef.current.some((op) => op.kind === 'putList' && op.listId === l.id)) {
        sync.enqueue(queueRef.current, { kind: 'putList', listId: l.id, body: {} });
      }
    }
    persistQueue();
    flush();
    flushPhotos();
    refetchAll();

    // One-time upload of photos taken before photo sync existed (or left
    // pending by an interrupted upload): a local rev-0 blob with nothing
    // queued means the server never received it.
    (async () => {
      let added = false;
      for (const l of listsRef.current) {
        for (const it of l.items) {
          if (!it.hasPhoto || photoQueueRef.current.some((op) => op.itemId === it.id)) continue;
          const entry = await getPhoto(it.id).catch(() => null);
          if (entry?.blob && !entry.rev) {
            sync.enqueuePhoto(photoQueueRef.current, { listId: l.id, itemId: it.id });
            added = true;
          }
        }
      }
      if (added) {
        sync.savePhotoQueue(photoQueueRef.current);
        flushPhotos();
      }
    })();

    const onOnline = () => { flush(); flushPhotos(); };
    const onVisible = () => {
      if (document.hidden) return;
      // iOS kills the SSE socket while the PWA is suspended — resync + reopen.
      flush();
      flushPhotos();
      refetchAll();
      ensureEventSource();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      if (retryRef.current) clearTimeout(retryRef.current);
      for (const timer of remoteTimersRef.current.values()) clearTimeout(timer);
      esRef.current?.close();
    };
  }, []);

  return {
    lists,
    createList, deleteList, setReminder,
    addItem, patchItem, removeItem, clearChecked, dedupeItems,
    setItemPhoto, removeItemPhoto,
    joinList,
    undoInfo, undoRemoval, syncState, remoteTouched,
  };
}
