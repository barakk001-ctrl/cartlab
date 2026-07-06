// ------------------------------------------------------------
// Thin client for the shared lists API. Network failures throw TypeError
// (retry later), HTTP failures throw ApiError (the server rejected the op —
// drop it and resync). The sync engine relies on that distinction.
// ------------------------------------------------------------

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

// Only these item fields sync — photos (hasPhoto/photoRev) stay device-local.
const stripItem = (i) => ({
  id: i.id, name: i.name, qty: i.qty, checked: !!i.checked, createdAt: i.createdAt,
});

const stripList = (l) => ({
  name: l.name,
  createdAt: l.createdAt,
  reminderAt: l.reminderAt,
  items: l.items.map(stripItem),
});

const api = {
  getList: (id, v) => call('GET', `/api/lists/${id}${v ? `?v=${v}` : ''}`),
  putList: (list) => call('PUT', `/api/lists/${list.id}`, stripList(list)),
  patchList: (id, patch) => call('PATCH', `/api/lists/${id}`, patch),
  deleteList: (id) => call('DELETE', `/api/lists/${id}`),
  putItem: (listId, item) => call('PUT', `/api/lists/${listId}/items/${item.id}`, stripItem(item)),
  deleteItem: (listId, itemId) => call('DELETE', `/api/lists/${listId}/items/${itemId}`),
  bulkDeleteItems: (listId, ids) => call('POST', `/api/lists/${listId}/items/bulk-delete`, { ids }),
};

export { api, ApiError, stripList };
