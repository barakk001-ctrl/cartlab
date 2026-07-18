// ------------------------------------------------------------
// Shared list store — SQLite via node:sqlite (Node >= 22.13, no native deps).
// The DB lives in DATA_DIR so a Railway volume makes lists survive deploys.
// Every mutation bumps the list's `version`; clients poll/subscribe with the
// version they have and only refetch when it moved.
// ------------------------------------------------------------
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const MAX_LISTS = 1000;
const MAX_ITEMS = 500;

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function openStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  // Item photos live as files next to the DB, keyed by item id (ids are
  // unguessable uids, and photo routes verify list membership anyway).
  const photosDir = path.join(dataDir, 'photos');
  fs.mkdirSync(photosDir, { recursive: true });
  const photoPath = (itemId) => path.join(photosDir, `${itemId}.jpg`);
  const unlinkPhoto = (itemId) => { try { fs.unlinkSync(photoPath(itemId)); } catch {} };

  const db = new DatabaseSync(path.join(dataDir, 'cartlab.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      reminder_at INTEGER,
      version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS items (
      list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      checked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (list_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_items_list ON items(list_id, created_at);
    CREATE TABLE IF NOT EXISTS subs (
      list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL,
      lang TEXT,
      subscription TEXT NOT NULL,
      PRIMARY KEY (list_id, device_id)
    );
  `);
  // Photo columns arrived after the first release — migrate old DBs in place.
  try { db.exec('ALTER TABLE items ADD COLUMN has_photo INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE items ADD COLUMN photo_rev INTEGER NOT NULL DEFAULT 0'); } catch {}
  // Manual category override (null = auto-categorize by name client-side).
  try { db.exec('ALTER TABLE items ADD COLUMN cat TEXT'); } catch {}
  // Quantity unit (kg/g/l/pack, null = plain count) and a free-text note.
  try { db.exec('ALTER TABLE items ADD COLUMN unit TEXT'); } catch {}
  try { db.exec('ALTER TABLE items ADD COLUMN note TEXT'); } catch {}
  // Urgent flag — flipping it on notifies every subscribed device (see subs).
  try { db.exec('ALTER TABLE items ADD COLUMN urgent INTEGER NOT NULL DEFAULT 0'); } catch {}

  const q = {
    getMeta: db.prepare('SELECT id, name, created_at, reminder_at, version FROM lists WHERE id = ?'),
    getItems: db.prepare('SELECT id, name, qty, checked, created_at, has_photo, photo_rev, cat, unit, note, urgent FROM items WHERE list_id = ? ORDER BY created_at, id'),
    itemUrgent: db.prepare('SELECT urgent FROM items WHERE list_id = ? AND id = ?'),
    getPhotoMeta: db.prepare('SELECT has_photo, photo_rev FROM items WHERE list_id = ? AND id = ?'),
    setPhotoMeta: db.prepare('UPDATE items SET has_photo = ?, photo_rev = photo_rev + 1 WHERE list_id = ? AND id = ?'),
    photoIds: db.prepare('SELECT id FROM items WHERE list_id = ? AND has_photo = 1'),
    countLists: db.prepare('SELECT COUNT(*) AS n FROM lists'),
    countItems: db.prepare('SELECT COUNT(*) AS n FROM items WHERE list_id = ?'),
    insertList: db.prepare('INSERT INTO lists (id, name, created_at, reminder_at, version) VALUES (?, ?, ?, ?, 1)'),
    updateMeta: db.prepare('UPDATE lists SET name = ?, reminder_at = ?, version = version + 1 WHERE id = ?'),
    bump: db.prepare('UPDATE lists SET version = version + 1 WHERE id = ?'),
    version: db.prepare('SELECT version FROM lists WHERE id = ?'),
    deleteList: db.prepare('DELETE FROM lists WHERE id = ?'),
    clearItems: db.prepare('DELETE FROM items WHERE list_id = ?'),
    upsertItem: db.prepare(`
      INSERT INTO items (list_id, id, name, qty, checked, created_at, cat, unit, note, urgent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(list_id, id) DO UPDATE SET
        name = excluded.name, qty = excluded.qty, checked = excluded.checked,
        cat = excluded.cat, unit = excluded.unit, note = excluded.note, urgent = excluded.urgent
    `),
    deleteItem: db.prepare('DELETE FROM items WHERE list_id = ? AND id = ?'),
    setSub: db.prepare(`
      INSERT INTO subs (list_id, device_id, lang, subscription) VALUES (?, ?, ?, ?)
      ON CONFLICT(list_id, device_id) DO UPDATE SET lang = excluded.lang, subscription = excluded.subscription
    `),
    getSubs: db.prepare('SELECT device_id, lang, subscription FROM subs WHERE list_id = ?'),
    countSubs: db.prepare('SELECT COUNT(*) AS n FROM subs WHERE list_id = ?'),
    hasSub: db.prepare('SELECT 1 AS x FROM subs WHERE list_id = ? AND device_id = ?'),
    deleteSub: db.prepare('DELETE FROM subs WHERE list_id = ? AND device_id = ?'),
  };

  function tx(fn) {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  function getList(id) {
    const row = q.getMeta.get(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      reminderAt: row.reminder_at,
      version: row.version,
      items: q.getItems.all(id).map((i) => ({
        id: i.id, name: i.name, qty: i.qty, checked: !!i.checked, createdAt: i.created_at,
        hasPhoto: !!i.has_photo, photoRev: i.photo_rev, cat: i.cat, unit: i.unit, note: i.note,
        urgent: !!i.urgent,
      })),
    };
  }

  // Create the list, or replace it wholesale (used for first upload of a
  // device-local list). `items` is the full desired item set, in order.
  // Server-side photos survive for items whose id is re-inserted; the rest
  // are unlinked.
  function upsertList(id, { name, createdAt, reminderAt, items }) {
    const kept = items.slice(0, MAX_ITEMS);
    const keptIds = new Set(kept.map((it) => it.id));
    const orphaned = tx(() => {
      const oldPhotos = q.photoIds.all(id).map((r) => r.id);
      if (q.getMeta.get(id)) {
        q.updateMeta.run(name, reminderAt ?? null, id);
      } else {
        if (q.countLists.get().n >= MAX_LISTS) throw err(429, 'too many lists');
        q.insertList.run(id, name, createdAt ?? Date.now(), reminderAt ?? null);
      }
      q.clearItems.run(id);
      const base = Date.now();
      kept.forEach((it, i) =>
        q.upsertItem.run(id, it.id, it.name, it.qty, it.checked ? 1 : 0, it.createdAt ?? base + i, it.cat ?? null, it.unit ?? null, it.note ?? null, it.urgent ? 1 : 0));
      for (const pid of oldPhotos) {
        if (keptIds.has(pid)) q.setPhotoMeta.run(1, id, pid);
      }
      return oldPhotos.filter((pid) => !keptIds.has(pid));
    });
    orphaned.forEach(unlinkPhoto);
    return q.version.get(id).version;
  }

  // Partial meta update. `undefined` = leave unchanged, `null` clears reminderAt.
  function patchList(id, patch) {
    return tx(() => {
      const row = q.getMeta.get(id);
      if (!row) return null;
      q.updateMeta.run(
        patch.name !== undefined ? patch.name : row.name,
        patch.reminderAt !== undefined ? patch.reminderAt : row.reminder_at,
        id,
      );
      return q.version.get(id).version;
    });
  }

  function deleteList(id) {
    const photos = tx(() => {
      const ids = q.photoIds.all(id).map((r) => r.id);
      q.deleteList.run(id);
      return ids;
    });
    photos.forEach(unlinkPhoto);
    return true;
  }

  // Returns { version, becameUrgent } — becameUrgent is true when this write
  // flipped the item to urgent (new urgent item, or existing item marked),
  // which is the server's cue to notify the list's subscribed devices.
  function upsertItem(listId, item) {
    return tx(() => {
      if (!q.getMeta.get(listId)) return null;
      const prev = q.itemUrgent.get(listId, item.id);
      if (!prev && q.countItems.get(listId).n >= MAX_ITEMS) {
        throw err(400, 'too many items');
      }
      q.upsertItem.run(listId, item.id, item.name, item.qty, item.checked ? 1 : 0, item.createdAt ?? Date.now(), item.cat ?? null, item.unit ?? null, item.note ?? null, item.urgent ? 1 : 0);
      q.bump.run(listId);
      return {
        version: q.version.get(listId).version,
        becameUrgent: !!item.urgent && !item.checked && !prev?.urgent,
      };
    });
  }

  function deleteItems(listId, ids) {
    const version = tx(() => {
      if (!q.getMeta.get(listId)) return null;
      for (const id of ids) q.deleteItem.run(listId, id);
      q.bump.run(listId);
      return q.version.get(listId).version;
    });
    if (version !== null) ids.forEach(unlinkPhoto);
    return version;
  }

  // ---- urgent-alert subscriptions ----
  // One push subscription per (list, device): every device that has granted
  // notification permission registers here, and an item turning urgent fans
  // out to all of them (minus the sender).

  const MAX_SUBS = 50;

  function setSub(listId, deviceId, lang, subscription) {
    return tx(() => {
      if (!q.getMeta.get(listId)) return null;
      if (!q.hasSub.get(listId, deviceId) && q.countSubs.get(listId).n >= MAX_SUBS) {
        throw err(429, 'too many subscriptions');
      }
      q.setSub.run(listId, deviceId, lang ?? null, JSON.stringify(subscription));
      return true;
    });
  }

  function getSubs(listId) {
    return q.getSubs.all(listId).map((r) => {
      try { return { deviceId: r.device_id, lang: r.lang, subscription: JSON.parse(r.subscription) }; }
      catch { return null; }
    }).filter(Boolean);
  }

  const removeSub = (listId, deviceId) => { q.deleteSub.run(listId, deviceId); };

  // ---- photos ----

  function setPhoto(listId, itemId, buffer) {
    return tx(() => {
      if (!q.getPhotoMeta.get(listId, itemId)) return null;
      fs.writeFileSync(photoPath(itemId), buffer);
      q.setPhotoMeta.run(1, listId, itemId);
      q.bump.run(listId);
      return {
        version: q.version.get(listId).version,
        photoRev: q.getPhotoMeta.get(listId, itemId).photo_rev,
      };
    });
  }

  function removePhoto(listId, itemId) {
    const version = tx(() => {
      if (!q.getPhotoMeta.get(listId, itemId)) return null;
      q.setPhotoMeta.run(0, listId, itemId);
      q.bump.run(listId);
      return q.version.get(listId).version;
    });
    if (version !== null) unlinkPhoto(itemId);
    return version;
  }

  // Returns the file path if this list's item has a photo, else null.
  function getPhotoFile(listId, itemId) {
    const meta = q.getPhotoMeta.get(listId, itemId);
    if (!meta?.has_photo) return null;
    const file = photoPath(itemId);
    return fs.existsSync(file) ? file : null;
  }

  return { getList, upsertList, patchList, deleteList, upsertItem, deleteItems, setPhoto, removePhoto, getPhotoFile, setSub, getSubs, removeSub };
}
