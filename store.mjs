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
  `);

  const q = {
    getMeta: db.prepare('SELECT id, name, created_at, reminder_at, version FROM lists WHERE id = ?'),
    getItems: db.prepare('SELECT id, name, qty, checked, created_at FROM items WHERE list_id = ? ORDER BY created_at, id'),
    countLists: db.prepare('SELECT COUNT(*) AS n FROM lists'),
    countItems: db.prepare('SELECT COUNT(*) AS n FROM items WHERE list_id = ?'),
    hasItem: db.prepare('SELECT 1 AS x FROM items WHERE list_id = ? AND id = ?'),
    insertList: db.prepare('INSERT INTO lists (id, name, created_at, reminder_at, version) VALUES (?, ?, ?, ?, 1)'),
    updateMeta: db.prepare('UPDATE lists SET name = ?, reminder_at = ?, version = version + 1 WHERE id = ?'),
    bump: db.prepare('UPDATE lists SET version = version + 1 WHERE id = ?'),
    version: db.prepare('SELECT version FROM lists WHERE id = ?'),
    deleteList: db.prepare('DELETE FROM lists WHERE id = ?'),
    clearItems: db.prepare('DELETE FROM items WHERE list_id = ?'),
    upsertItem: db.prepare(`
      INSERT INTO items (list_id, id, name, qty, checked, created_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(list_id, id) DO UPDATE SET name = excluded.name, qty = excluded.qty, checked = excluded.checked
    `),
    deleteItem: db.prepare('DELETE FROM items WHERE list_id = ? AND id = ?'),
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
      })),
    };
  }

  // Create the list, or replace it wholesale (used for first upload of a
  // device-local list). `items` is the full desired item set, in order.
  function upsertList(id, { name, createdAt, reminderAt, items }) {
    return tx(() => {
      if (q.getMeta.get(id)) {
        q.updateMeta.run(name, reminderAt ?? null, id);
      } else {
        if (q.countLists.get().n >= MAX_LISTS) throw err(429, 'too many lists');
        q.insertList.run(id, name, createdAt ?? Date.now(), reminderAt ?? null);
      }
      q.clearItems.run(id);
      const base = Date.now();
      items.slice(0, MAX_ITEMS).forEach((it, i) =>
        q.upsertItem.run(id, it.id, it.name, it.qty, it.checked ? 1 : 0, it.createdAt ?? base + i));
      return q.version.get(id).version;
    });
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
    return tx(() => q.deleteList.run(id).changes > 0);
  }

  function upsertItem(listId, item) {
    return tx(() => {
      if (!q.getMeta.get(listId)) return null;
      if (!q.hasItem.get(listId, item.id) && q.countItems.get(listId).n >= MAX_ITEMS) {
        throw err(400, 'too many items');
      }
      q.upsertItem.run(listId, item.id, item.name, item.qty, item.checked ? 1 : 0, item.createdAt ?? Date.now());
      q.bump.run(listId);
      return q.version.get(listId).version;
    });
  }

  function deleteItems(listId, ids) {
    return tx(() => {
      if (!q.getMeta.get(listId)) return null;
      for (const id of ids) q.deleteItem.run(listId, id);
      q.bump.run(listId);
      return q.version.get(listId).version;
    });
  }

  return { getList, upsertList, patchList, deleteList, upsertItem, deleteItems };
}
