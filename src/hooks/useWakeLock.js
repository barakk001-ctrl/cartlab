import { useEffect } from 'react';
function useWakeLock(active) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch { /* denied or not allowed right now */ }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      try { sentinel && sentinel.release(); } catch {}
    };
  }, [active]);
}


export { useWakeLock };
