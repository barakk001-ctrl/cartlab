import { useEffect, useState } from 'react';
import { getPhoto, savePhoto } from '../db.js';
import { api } from '../api.js';

// Object URL for an item's photo. Resolution order:
//  1. local blob with rev 0 — a photo this device just took, upload pending;
//  2. local blob whose rev matches the item's server photoRev — cached copy;
//  3. fetch from the server (photo taken on another device, or replaced
//     there), cache it under the new rev, display it;
//  4. fetch failed (offline) — show whatever stale local copy exists.
function usePhoto(listId, itemId, hasPhoto, rev = 0) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!hasPhoto) { setUrl(null); return; }
    let alive = true;
    let objectUrl = null;
    const show = (blob) => {
      if (!alive || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    };
    (async () => {
      const entry = await getPhoto(itemId).catch(() => null);
      if (entry && (entry.rev === 0 || entry.rev === rev)) return show(entry.blob);
      try {
        const blob = await api.fetchPhoto(listId, itemId, rev);
        savePhoto(itemId, blob, rev).catch(() => {});
        show(blob);
      } catch {
        show(entry?.blob); // offline — stale beats nothing
      }
    })();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [listId, itemId, hasPhoto, rev]);

  return url;
}

export { usePhoto };
