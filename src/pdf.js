// ------------------------------------------------------------
// "Finish shop" PDF — a receipt-style summary of everything checked during
// the trip. No PDF library: each A4 page is drawn on a <canvas> (the browser
// shapes Hebrew/RTL text natively, which PDF text APIs get wrong without
// embedded fonts), exported as JPEG and wrapped in a hand-rolled PDF.
// ------------------------------------------------------------

import { isRTL, t } from './i18n.js';
import { itemQtyText } from './units.js';

// Canvas pixels per page (A4 at ~150dpi). PDF points are fixed A4.
const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN = 110;
const PDF_W = 595.28;
const PDF_H = 841.89;

const FONT = '-apple-system, "Segoe UI", Roboto, "Noto Sans Hebrew", Arial, sans-serif';

const money = (n) => `₪${n % 1 === 0 ? n : n.toFixed(2)}`;

function newPage(rtl) {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textBaseline = 'alphabetic';
  return { canvas, ctx };
}

// Truncate to the page width with an ellipsis (canvas has no native clamp).
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

function drawCheck(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = '#4a7c59';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.42, cy + r * 0.02);
  ctx.lineTo(cx - r * 0.1, cy + r * 0.36);
  ctx.lineTo(cx + r * 0.46, cy - r * 0.32);
  ctx.stroke();
  ctx.restore();
}

// Renders the bought items onto one or more A4 canvases.
function renderPages(list, lang) {
  const rtl = isRTL(lang);
  const bought = list.items
    .filter((i) => i.checked)
    .sort((a, b) => (a.checkedAt || 0) - (b.checkedAt || 0)); // in shop order

  const nameX = rtl ? PAGE_W - MARGIN - 64 : MARGIN + 64; // after the check mark
  const priceX = rtl ? MARGIN : PAGE_W - MARGIN;
  const nameAlign = rtl ? 'right' : 'left';
  const priceAlign = rtl ? 'left' : 'right';
  const nameMax = PAGE_W - MARGIN * 2 - 64 - 170; // keep clear of the price column

  const pages = [];
  let page = newPage(rtl);
  let y = 0;

  const header = (first) => {
    const { ctx } = page;
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = rtl ? 'right' : 'left';
    const hx = rtl ? PAGE_W - MARGIN : MARGIN;
    if (first) {
      ctx.font = `700 64px ${FONT}`;
      ctx.fillText(fitText(ctx, list.name, PAGE_W - MARGIN * 2), hx, 190);
      ctx.font = `400 34px ${FONT}`;
      ctx.fillStyle = '#777777';
      const when = new Date().toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      ctx.fillText(`${t('finish_pdf_sub', lang)} · ${when}`, hx, 248);
      ctx.strokeStyle = '#dddddd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(MARGIN, 300);
      ctx.lineTo(PAGE_W - MARGIN, 300);
      ctx.stroke();
      y = 380;
    } else {
      ctx.font = `600 36px ${FONT}`;
      ctx.fillStyle = '#999999';
      ctx.fillText(fitText(ctx, list.name, PAGE_W - MARGIN * 2), hx, 130);
      y = 220;
    }
  };

  const footer = (k, n) => {
    const { ctx } = page;
    ctx.font = `400 26px ${FONT}`;
    ctx.fillStyle = '#aaaaaa';
    ctx.textAlign = 'center';
    ctx.fillText(`CartLab · ${k}/${n}`, PAGE_W / 2, PAGE_H - 70);
  };

  header(true);

  const breakPage = () => {
    pages.push(page);
    page = newPage(rtl);
    header(false);
  };

  for (const item of bought) {
    const rowH = item.note ? 104 : 72;
    if (y + rowH > PAGE_H - 200) breakPage();
    const { ctx } = page;

    drawCheck(ctx, rtl ? PAGE_W - MARGIN - 22 : MARGIN + 22, y - 14, 22);

    ctx.font = `500 38px ${FONT}`;
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = nameAlign;
    const qty = itemQtyText(item, lang);
    ctx.fillText(fitText(ctx, qty ? `${item.name}  ${qty}` : item.name, nameMax), nameX, y);

    if (item.price != null) {
      ctx.font = `500 36px ${FONT}`;
      ctx.fillStyle = '#4a7c59';
      ctx.textAlign = priceAlign;
      ctx.fillText(money(item.price), priceX, y);
    }

    if (item.note) {
      ctx.font = `400 30px ${FONT}`;
      ctx.fillStyle = '#999999';
      ctx.textAlign = nameAlign;
      ctx.fillText(fitText(ctx, item.note, nameMax), nameX, y + 42);
    }
    y += rowH;
  }

  // Summary: item count, plus a total when at least one price is known.
  const priced = bought.filter((i) => i.price != null);
  const summaryH = priced.length ? 180 : 120;
  if (y + summaryH > PAGE_H - 160) breakPage();
  {
    const { ctx } = page;
    y += 20;
    ctx.strokeStyle = '#dddddd';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PAGE_W - MARGIN, y);
    ctx.stroke();
    y += 66;
    ctx.font = `700 40px ${FONT}`;
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.fillText(t('finish_items_count', lang, { n: bought.length }), rtl ? PAGE_W - MARGIN : MARGIN, y);
    if (priced.length) {
      const sum = priced.reduce((acc, i) => acc + i.price, 0);
      ctx.textAlign = priceAlign;
      ctx.fillStyle = '#4a7c59';
      ctx.fillText(
        `${t('finish_total', lang, { n: priced.length })} ${money(Math.round(sum * 100) / 100)}`,
        priceX, y + 62,
      );
    }
  }

  pages.push(page);
  pages.forEach((p, k) => { page = p; footer(k + 1, pages.length); });
  return pages;
}

async function jpegBytes(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('canvas.toBlob failed');
  return new Uint8Array(await blob.arrayBuffer());
}

// Minimal PDF: one full-page JPEG XObject per page (DCTDecode = raw JPEG).
function wrapJpegsInPdf(jpegs) {
  const enc = new TextEncoder();
  const parts = [];
  let offset = 0;
  const offsets = [];
  const push = (data) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    parts.push(bytes);
    offset += bytes.length;
  };
  const obj = (id, body) => {
    offsets[id] = offset;
    push(`${id} 0 obj\n${body}\nendobj\n`);
  };

  push('%PDF-1.4\n%ÿÿÿÿ\n');
  const n = jpegs.length;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${jpegs.map((_, k) => `${3 + k * 3} 0 R`).join(' ')}] >>`);
  jpegs.forEach((jpg, k) => {
    const pageId = 3 + k * 3;
    obj(pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] ` +
      `/Resources << /XObject << /Im${k} ${pageId + 2} 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    const stream = `q ${PDF_W} 0 0 ${PDF_H} 0 0 cm /Im${k} Do Q`;
    obj(pageId + 1, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    offsets[pageId + 2] = offset;
    push(`${pageId + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${PAGE_W} /Height ${PAGE_H} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
    push(jpg);
    push('\nendstream\nendobj\n');
  });

  const count = 3 + n * 3; // object ids 0..count-1
  const xrefStart = offset;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const out = new Uint8Array(offset);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return new Blob([out], { type: 'application/pdf' });
}

async function buildShopPdf(list, lang) {
  const pages = renderPages(list, lang);
  const jpegs = [];
  for (const p of pages) jpegs.push(await jpegBytes(p.canvas));
  const date = new Date().toISOString().slice(0, 10);
  const safeName = (list.name || 'cartlab').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60);
  return { blob: wrapJpegsInPdf(jpegs), filename: `${safeName} ${date}.pdf` };
}

// Share sheet where available (iOS PWA → save to Files / AirDrop / WhatsApp),
// plain download otherwise.
async function sharePdf(blob, filename, title) {
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // user closed the sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export { buildShopPdf, sharePdf };
