// ------------------------------------------------------------
// Item photos in IndexedDB, keyed by item id. Photos are downscaled to a
// small JPEG before storing, so even a big list stays a few MB total.
// ------------------------------------------------------------

const DB_NAME = 'cartlab';
const STORE = 'photos';

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
  }
  return dbPromise;
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Entries are { blob, rev } — rev is the server photo revision the blob
// corresponds to (0 = not uploaded yet). Early versions stored the raw Blob;
// normalize those on read.
const savePhoto = (itemId, blob, rev = 0) => withStore('readwrite', (s) => s.put({ blob, rev }, itemId));
const getPhoto = (itemId) =>
  withStore('readonly', (s) => s.get(itemId)).then((entry) => {
    if (!entry) return null;
    if (entry instanceof Blob) return { blob: entry, rev: 0 };
    return entry.blob ? entry : null;
  });
const deletePhoto = (itemId) => withStore('readwrite', (s) => s.delete(itemId));
const deletePhotos = (itemIds) =>
  withStore('readwrite', (s) => { for (const id of itemIds) s.delete(id); });

// Downscale a camera photo to maxEdge px and re-encode as JPEG. Modern iOS
// applies EXIF orientation during decode, so no manual rotation is needed.
async function compressImage(file, maxEdge = 640, quality = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob || file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export { savePhoto, getPhoto, deletePhoto, deletePhotos, compressImage };
