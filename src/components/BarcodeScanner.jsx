import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isRTL, t } from '../i18n.js';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

// Live camera barcode scanner (zxing decodes in JS — iOS Safari has no
// native BarcodeDetector). Limited to retail formats so random QR codes in
// the aisle don't hijack the scan.
function BarcodeScanner({ lang, onDetect, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128,
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    let controls = null;
    let done = false;
    reader
      .decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        videoRef.current,
        (result, err, c) => {
          if (result && !done) {
            done = true;
            c.stop();
            onDetect(result.getText());
          }
        },
      )
      .then((c) => {
        controls = c;
        if (done) c.stop(); // detection can beat this promise
      })
      .catch(() => setError(true));
    return () => { try { controls?.stop(); } catch {} };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black flex flex-col"
      dir={isRTL(lang) ? 'rtl' : 'ltr'}
    >
      <div className="flex items-center justify-between px-4 py-3 text-cream">
        <span className="font-semibold text-sm">{t('barcode_scan', lang)}</span>
        <button onClick={onClose} className="p-1" aria-label={t('close', lang)}>
          <X size={20} strokeWidth={2.5} />
        </button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" autoPlay muted playsInline />
        {/* aiming guide */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-4/5 h-28 border-2 border-cream/80 rounded-xl" />
        </div>
        {error && (
          <p className="absolute inset-x-0 bottom-8 text-center text-cream text-sm px-6">
            {t('barcode_cam_failed', lang)}
          </p>
        )}
      </div>
    </div>
  );
}

export default BarcodeScanner;
