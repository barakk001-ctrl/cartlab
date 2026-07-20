import { TrendingDown, TrendingUp, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isRTL, t } from '../i18n.js';
import { api } from '../api.js';

// Price tracker, fed by scanned receipts: latest price per product with the
// change vs. the previous different price. Increases show red (bad for the
// wallet), decreases green. Items with a change sort first, biggest movers
// on top.
function PricesModal({ lang, listId, onClose }) {
  const [products, setProducts] = useState(null); // null = loading
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getPrices(listId)
      .then((r) => { if (alive) setProducts(r.products); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [listId]);

  const changePct = (p) =>
    p.prevPrice ? ((p.price - p.prevPrice) / p.prevPrice) * 100 : null;

  const sorted = (products || []).slice().sort((a, b) => {
    const ca = changePct(a);
    const cb = changePct(b);
    if ((ca !== null) !== (cb !== null)) return ca !== null ? -1 : 1;
    if (ca !== null && cb !== null) return Math.abs(cb) - Math.abs(ca);
    return b.at - a.at;
  });

  const fmtPrice = (p, currency) =>
    `${currency || ''}${p % 1 === 0 ? p : p.toFixed(2)}`;
  const fmtDate = (ts) => {
    try {
      return new Date(ts).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' });
    } catch { return ''; }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
      dir={isRTL(lang) ? 'rtl' : 'ltr'}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <TrendingUp size={16} strokeWidth={2.5} className="text-leaf" />
            {t('prices_title', lang)}
          </div>
          <button onClick={onClose} className="p-1 opacity-60 shrink-0" aria-label={t('close', lang)}>
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto">
          {failed && <p className="text-sm opacity-60 px-4 py-8 text-center">{t('prices_failed', lang)}</p>}
          {!failed && products === null && <p className="text-sm opacity-60 px-4 py-8 text-center">…</p>}
          {products !== null && products.length === 0 && (
            <p className="text-sm opacity-60 px-4 py-8 text-center">{t('prices_empty', lang)}</p>
          )}
          {sorted.map((p) => {
            const pct = changePct(p);
            const up = pct !== null && pct > 0;
            const stores = p.stores || [];
            return (
              <div key={p.name} className="px-4 py-2.5 border-b border-ink/5 last:border-b-0">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] truncate">{p.name}</div>
                    <div className="text-[11px] opacity-50">
                      {p.prevPrice
                        ? `${t('price_was', lang, { price: fmtPrice(p.prevPrice, p.currency) })} · ${fmtDate(p.at)}`
                        : fmtDate(p.at)}
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <div className="f-mono text-[15px] font-semibold" dir="ltr">{fmtPrice(p.price, p.currency)}</div>
                    {pct !== null && (
                      <div
                        className={`flex items-center justify-end gap-0.5 text-[11px] font-bold ${up ? 'text-rust' : 'text-leaf'}`}
                        dir="ltr"
                      >
                        {up ? <TrendingUp size={11} strokeWidth={3} /> : <TrendingDown size={11} strokeWidth={3} />}
                        {`${up ? '+' : ''}${pct.toFixed(Math.abs(pct) >= 10 ? 0 : 1)}%`}
                      </div>
                    )}
                  </div>
                </div>
                {/* per-shop comparison — stores sorted cheapest-first by the server */}
                {stores.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {stores.map((s, idx) => (
                      <span
                        key={s.store}
                        className={`text-[11px] rounded-full px-2 py-0.5 border ${
                          idx === 0 && stores.length > 1
                            ? 'border-leaf/50 text-leaf font-bold'
                            : 'border-ink/15 opacity-70'
                        }`}
                      >
                        {s.store} <span dir="ltr">{fmtPrice(s.price, p.currency)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default PricesModal;
