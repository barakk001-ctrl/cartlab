// ------------------------------------------------------------
// Thin client for the shared lists API. Network failures throw TypeError
// (retry later), HTTP failures throw ApiError (the server rejected the op —
// drop it and resync). The sync engine relies on that distinction.
// ------------------------------------------------------------

import { getDeviceId } from './sync.js';

class ApiError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new ApiError(res.status);
  return res.json();
}

// Only these item fields travel with item writes — photo state (hasPhoto/
// photoRev) is server-owned and changes only through the photo endpoints.
const stripItem = (i) => ({
  id: i.id, name: i.name, qty: i.qty, checked: !!i.checked, createdAt: i.createdAt,
  cat: i.cat || null, unit: i.unit || null, note: i.note || null, urgent: !!i.urgent,
});

const stripList = (l) => ({
  name: l.name,
  createdAt: l.createdAt,
  reminderAt: l.reminderAt,
  items: l.items.map(stripItem),
});

const photoUrl = (listId, itemId, rev) => `/api/lists/${listId}/items/${itemId}/photo?rev=${rev || 0}`;

const api = {
  getList: (id, v) => call('GET', `/api/lists/${id}${v ? `?v=${v}` : ''}`),
  putList: (list) => call('PUT', `/api/lists/${list.id}`, stripList(list)),
  patchList: (id, patch) => call('PATCH', `/api/lists/${id}`, patch),
  deleteList: (id) => call('DELETE', `/api/lists/${id}`),
  // ?device= lets the server skip the sender when fanning out urgent alerts.
  putItem: (listId, item) => call('PUT', `/api/lists/${listId}/items/${item.id}?device=${getDeviceId()}`, stripItem(item)),
  subscribeUrgent: (listId, subscription, lang) =>
    call('POST', `/api/lists/${listId}/subscribe`, { deviceId: getDeviceId(), subscription, lang }),
  deleteItem: (listId, itemId) => call('DELETE', `/api/lists/${listId}/items/${itemId}`),
  bulkDeleteItems: (listId, ids) => call('POST', `/api/lists/${listId}/items/bulk-delete`, { ids }),
  uploadPhoto: async (listId, itemId, blob) => {
    const res = await fetch(photoUrl(listId, itemId, ''), {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    });
    if (!res.ok) throw new ApiError(res.status);
    return res.json();
  },
  deletePhoto: (listId, itemId) => call('DELETE', `/api/lists/${listId}/items/${itemId}/photo`),
  fetchPhoto: async (listId, itemId, rev) => {
    const res = await fetch(photoUrl(listId, itemId, rev));
    if (!res.ok) throw new ApiError(res.status);
    return res.blob();
  },
};

export { api, ApiError, stripList };
