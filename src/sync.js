// ------------------------------------------------------------
// Offline-first sync bookkeeping, all in localStorage:
//  - queue:    mutations not yet accepted by the server, replayed in order
//  - versions: last server version seen per list (cheap "did it change?")
//  - synced:   ids of lists the server knows about (vs. device-local only)
//  - device:   stable per-device id, used to key this device's push reminder
// ------------------------------------------------------------

const QUEUE_KEY = 'cartlab:queue';
const VERSIONS_KEY = 'cartlab:versions';
const SYNCED_KEY = 'cartlab:synced';
const DEVICE_KEY = 'cartlab:device';

function newId(len = 20) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => chars[b % chars.length]).join('');
}

function getDeviceId() {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = newId(8);
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'nodevice';
  }
}

function loadJson(key, fallback) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const loadQueue = () => {
  const q = loadJson(QUEUE_KEY, []);
  // inFlight is a runtime-only flag; a persisted one is stale from a reload.
  return Array.isArray(q) ? q.map(({ inFlight, ...op }) => op) : [];
};
const saveQueue = (q) => saveJson(QUEUE_KEY, q);
const loadVersions = () => loadJson(VERSIONS_KEY, {});
const saveVersions = (v) => saveJson(VERSIONS_KEY, v);
const loadSynced = () => { const s = loadJson(SYNCED_KEY, []); return Array.isArray(s) ? s : []; };
const saveSynced = (set) => saveJson(SYNCED_KEY, [...set]);

// Append an op, collapsing redundant ones so rapid taps (qty spam) don't
// pile up: repeated putItem for the same item replaces in place, patchList
// bodies merge, and deleting a list voids every queued op about it.
// An op the flusher is currently sending (inFlight) is never touched —
// replacing or removing it mid-request would make the flusher drop the
// wrong op when the response lands.
function enqueue(queue, op) {
  if (op.kind === 'deleteList') {
    const hadCreate = queue.some((o) => o.kind === 'putList' && o.listId === op.listId && !o.inFlight);
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].listId === op.listId && !queue[i].inFlight) queue.splice(i, 1);
    }
    if (hadCreate) return; // never made it to the server — nothing to delete
    queue.push(op);
    return;
  }
  if (op.kind === 'putItem') {
    const i = queue.findIndex((o) => o.kind === 'putItem' && o.listId === op.listId && o.body.id === op.body.id && !o.inFlight);
    if (i >= 0) { queue[i] = op; return; }
  }
  if (op.kind === 'patchList') {
    const i = queue.findIndex((o) => o.kind === 'patchList' && o.listId === op.listId && !o.inFlight);
    if (i >= 0) { queue[i] = { ...op, body: { ...queue[i].body, ...op.body } }; return; }
  }
  queue.push(op);
}

export {
  newId, getDeviceId, enqueue,
  loadQueue, saveQueue, loadVersions, saveVersions, loadSynced, saveSynced,
};
