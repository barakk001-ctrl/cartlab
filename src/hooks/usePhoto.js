import { useEffect, useState } from 'react';
import { getPhoto } from '../db.js';

// Object URL for an item's stored photo. `rev` busts the cache after a
// replace; the URL is revoked on cleanup.
function usePhoto(itemId, hasPhoto, rev = 0) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!hasPhoto) { setUrl(null); return; }
    let alive = true;
    let objectUrl = null;
    getPhoto(itemId)
      .then((blob) => {
        if (!alive || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [itemId, hasPhoto, rev]);

  return url;
}

export { usePhoto };
