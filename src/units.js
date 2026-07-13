// ------------------------------------------------------------
// Optional quantity units. null = plain count ("×2"); the rest step the
// quantity in sensible increments. Tapping the qty label cycles the unit.
// ------------------------------------------------------------

const UNIT_ORDER = [null, 'kg', 'g', 'l', 'pack'];
const UNIT_STEP = { kg: 0.5, g: 100, l: 0.5, pack: 1 };

const UNIT_LABELS = {
  en: { kg: 'kg', g: 'g', l: 'L', pack: 'pack' },
  he: { kg: 'ק"ג', g: 'גרם', l: 'ליטר', pack: 'מארז' },
};

const isUnit = (u) => UNIT_ORDER.includes(u || null);
const unitStep = (unit) => UNIT_STEP[unit] || 1;
const unitMin = (unit) => UNIT_STEP[unit] || 1;
const nextUnit = (unit) => UNIT_ORDER[(UNIT_ORDER.indexOf(unit || null) + 1) % UNIT_ORDER.length];
const unitLabel = (unit, lang) =>
  unit ? (UNIT_LABELS[lang === 'he' ? 'he' : 'en'][unit] || unit) : '';

const formatQtyNum = (qty) => String(qty % 1 === 0 ? qty : Math.round(qty * 10) / 10);

// The quantity suffix for an item: '' (single count), '×3', or '1.5 kg'.
function itemQtyText(item, lang) {
  if (!item.unit) return item.qty > 1 ? `×${item.qty}` : '';
  return `${formatQtyNum(item.qty)} ${unitLabel(item.unit, lang)}`;
}

export { isUnit, unitStep, unitMin, nextUnit, unitLabel, formatQtyNum, itemQtyText };
