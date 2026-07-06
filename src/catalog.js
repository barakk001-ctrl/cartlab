// ------------------------------------------------------------
// Common grocery items for add-item autocomplete, EN/HE. suggest() matches
// the typed prefix against both languages (so typing "mil" finds חלב's
// English name too) but displays the active language's label. The user's
// own item names from all their lists rank above the catalog.
// ------------------------------------------------------------

const CATALOG = [
  // Dairy & eggs
  { en: 'Milk', he: 'חלב' },
  { en: 'Eggs', he: 'ביצים' },
  { en: 'Butter', he: 'חמאה' },
  { en: 'Yellow cheese', he: 'גבינה צהובה' },
  { en: 'White cheese', he: 'גבינה לבנה' },
  { en: 'Cottage cheese', he: "קוטג'" },
  { en: 'Cream cheese', he: 'גבינת שמנת' },
  { en: 'Feta cheese', he: 'גבינה בולגרית' },
  { en: 'Yogurt', he: 'יוגורט' },
  { en: 'Sour cream', he: 'שמנת חמוצה' },
  { en: 'Sweet cream', he: 'שמנת מתוקה' },
  // Vegetables
  { en: 'Tomatoes', he: 'עגבניות' },
  { en: 'Cherry tomatoes', he: 'עגבניות שרי' },
  { en: 'Cucumbers', he: 'מלפפונים' },
  { en: 'Onions', he: 'בצל' },
  { en: 'Green onions', he: 'בצל ירוק' },
  { en: 'Garlic', he: 'שום' },
  { en: 'Potatoes', he: 'תפוחי אדמה' },
  { en: 'Sweet potatoes', he: 'בטטה' },
  { en: 'Carrots', he: 'גזר' },
  { en: 'Bell peppers', he: 'פלפל' },
  { en: 'Lettuce', he: 'חסה' },
  { en: 'Cabbage', he: 'כרוב' },
  { en: 'Zucchini', he: 'קישואים' },
  { en: 'Eggplant', he: 'חציל' },
  { en: 'Broccoli', he: 'ברוקולי' },
  { en: 'Cauliflower', he: 'כרובית' },
  { en: 'Mushrooms', he: 'פטריות' },
  { en: 'Spinach', he: 'תרד' },
  { en: 'Celery', he: 'סלרי' },
  { en: 'Corn', he: 'תירס' },
  { en: 'Avocado', he: 'אבוקדו' },
  { en: 'Radishes', he: 'צנונית' },
  { en: 'Parsley', he: 'פטרוזיליה' },
  { en: 'Cilantro', he: 'כוסברה' },
  { en: 'Dill', he: 'שמיר' },
  { en: 'Mint', he: 'נענע' },
  { en: 'Basil', he: 'בזיליקום' },
  { en: 'Ginger', he: "ג'ינג'ר" },
  // Fruit
  { en: 'Apples', he: 'תפוחים' },
  { en: 'Bananas', he: 'בננות' },
  { en: 'Oranges', he: 'תפוזים' },
  { en: 'Lemons', he: 'לימונים' },
  { en: 'Grapes', he: 'ענבים' },
  { en: 'Strawberries', he: 'תותים' },
  { en: 'Watermelon', he: 'אבטיח' },
  { en: 'Melon', he: 'מלון' },
  { en: 'Peaches', he: 'אפרסקים' },
  { en: 'Pears', he: 'אגסים' },
  { en: 'Mango', he: 'מנגו' },
  { en: 'Kiwi', he: 'קיווי' },
  { en: 'Dates', he: 'תמרים' },
  // Bread & bakery
  { en: 'Bread', he: 'לחם' },
  { en: 'Pita', he: 'פיתות' },
  { en: 'Rolls', he: 'לחמניות' },
  { en: 'Challah', he: 'חלה' },
  { en: 'Tortillas', he: 'טורטיות' },
  { en: 'Crackers', he: 'קרקרים' },
  // Meat & fish
  { en: 'Chicken breast', he: 'חזה עוף' },
  { en: 'Chicken thighs', he: 'כרעיים עוף' },
  { en: 'Whole chicken', he: 'עוף שלם' },
  { en: 'Ground beef', he: 'בשר טחון' },
  { en: 'Steak', he: 'סטייק' },
  { en: 'Turkey', he: 'הודו' },
  { en: 'Schnitzel', he: 'שניצל' },
  { en: 'Sausages', he: 'נקניקיות' },
  { en: 'Salmon', he: 'סלמון' },
  { en: 'Tuna', he: 'טונה' },
  { en: 'Fish', he: 'דג' },
  // Spreads & deli
  { en: 'Hummus', he: 'חומוס' },
  { en: 'Tahini', he: 'טחינה' },
  { en: 'Pickles', he: 'חמוצים' },
  { en: 'Olives', he: 'זיתים' },
  // Pantry
  { en: 'Rice', he: 'אורז' },
  { en: 'Pasta', he: 'פסטה' },
  { en: 'Spaghetti', he: 'ספגטי' },
  { en: 'Couscous', he: 'קוסקוס' },
  { en: 'Flour', he: 'קמח' },
  { en: 'Sugar', he: 'סוכר' },
  { en: 'Salt', he: 'מלח' },
  { en: 'Black pepper', he: 'פלפל שחור' },
  { en: 'Olive oil', he: 'שמן זית' },
  { en: 'Vegetable oil', he: 'שמן' },
  { en: 'Vinegar', he: 'חומץ' },
  { en: 'Soy sauce', he: 'רוטב סויה' },
  { en: 'Ketchup', he: 'קטשופ' },
  { en: 'Mayonnaise', he: 'מיונז' },
  { en: 'Mustard', he: 'חרדל' },
  { en: 'Tomato paste', he: 'רסק עגבניות' },
  { en: 'Canned tomatoes', he: 'שימורי עגבניות' },
  { en: 'Canned corn', he: 'שימורי תירס' },
  { en: 'Beans', he: 'שעועית' },
  { en: 'Chickpeas', he: 'גרגירי חומוס' },
  { en: 'Lentils', he: 'עדשים' },
  { en: 'Oats', he: 'שיבולת שועל' },
  { en: 'Cereal', he: 'דגני בוקר' },
  { en: 'Granola', he: 'גרנולה' },
  { en: 'Honey', he: 'דבש' },
  { en: 'Jam', he: 'ריבה' },
  { en: 'Peanut butter', he: 'חמאת בוטנים' },
  { en: 'Chocolate spread', he: 'ממרח שוקולד' },
  { en: 'Nuts', he: 'אגוזים' },
  { en: 'Almonds', he: 'שקדים' },
  { en: 'Peanuts', he: 'בוטנים' },
  { en: 'Raisins', he: 'צימוקים' },
  { en: 'Baking powder', he: 'אבקת אפייה' },
  { en: 'Yeast', he: 'שמרים' },
  { en: 'Breadcrumbs', he: 'פירורי לחם' },
  { en: 'Paprika', he: 'פפריקה' },
  { en: 'Cumin', he: 'כמון' },
  { en: 'Turmeric', he: 'כורכום' },
  { en: 'Cinnamon', he: 'קינמון' },
  // Frozen
  { en: 'Frozen peas', he: 'אפונה קפואה' },
  { en: 'Frozen vegetables', he: 'ירקות קפואים' },
  { en: 'Ice cream', he: 'גלידה' },
  { en: 'Frozen pizza', he: 'פיצה קפואה' },
  { en: 'Malawach', he: 'מלווח' },
  { en: 'Bourekas', he: 'בורקס' },
  // Drinks
  { en: 'Water', he: 'מים' },
  { en: 'Sparkling water', he: 'סודה' },
  { en: 'Orange juice', he: 'מיץ תפוזים' },
  { en: 'Juice', he: 'מיץ' },
  { en: 'Coffee', he: 'קפה' },
  { en: 'Instant coffee', he: 'נס קפה' },
  { en: 'Tea', he: 'תה' },
  { en: 'Beer', he: 'בירה' },
  { en: 'Wine', he: 'יין' },
  { en: 'Cola', he: 'קולה' },
  // Snacks
  { en: 'Chocolate', he: 'שוקולד' },
  { en: 'Cookies', he: 'עוגיות' },
  { en: 'Chips', he: "צ'יפס" },
  { en: 'Bamba', he: 'במבה' },
  { en: 'Bissli', he: 'ביסלי' },
  { en: 'Pretzels', he: 'בייגלה' },
  { en: 'Popcorn', he: 'פופקורן' },
  { en: 'Candy', he: 'ממתקים' },
  { en: 'Gum', he: 'מסטיק' },
  { en: 'Wafers', he: 'ופלים' },
  { en: 'Halva', he: 'חלווה' },
  // Household
  { en: 'Toilet paper', he: 'נייר טואלט' },
  { en: 'Paper towels', he: 'מגבות נייר' },
  { en: 'Napkins', he: 'מפיות' },
  { en: 'Dish soap', he: 'סבון כלים' },
  { en: 'Laundry detergent', he: 'אבקת כביסה' },
  { en: 'Fabric softener', he: 'מרכך כביסה' },
  { en: 'Sponges', he: 'ספוגים' },
  { en: 'Trash bags', he: 'שקיות זבל' },
  { en: 'Aluminum foil', he: 'נייר אלומיניום' },
  { en: 'Plastic wrap', he: 'ניילון נצמד' },
  { en: 'Baking paper', he: 'נייר אפייה' },
  { en: 'Bleach', he: 'אקונומיקה' },
  { en: 'Floor cleaner', he: 'נוזל רצפות' },
  // Personal care & baby
  { en: 'Shampoo', he: 'שמפו' },
  { en: 'Conditioner', he: 'מרכך שיער' },
  { en: 'Soap', he: 'סבון' },
  { en: 'Shower gel', he: "ג'ל רחצה" },
  { en: 'Toothpaste', he: 'משחת שיניים' },
  { en: 'Toothbrush', he: 'מברשת שיניים' },
  { en: 'Deodorant', he: 'דאודורנט' },
  { en: 'Razors', he: 'סכיני גילוח' },
  { en: 'Tissues', he: 'טישו' },
  { en: 'Wet wipes', he: 'מגבונים' },
  { en: 'Hand soap', he: 'סבון ידיים' },
  { en: 'Diapers', he: 'חיתולים' },
  // Pets
  { en: 'Cat food', he: 'מזון לחתולים' },
  { en: 'Dog food', he: 'מזון לכלבים' },
];

const normalize = (s) => s.trim().toLowerCase();

// Suggestions for a typed prefix. `history` (the user's own item names from
// all lists) ranks first; `exclude` hides items already on the current list.
// Whole-name prefix matches rank above word-start matches.
function suggest(query, lang, { history = [], exclude = [], limit = 8 } = {}) {
  const q = normalize(query);
  if (!q) return [];
  const excluded = new Set(exclude.map(normalize));
  const seen = new Set();
  const starts = [];
  const words = [];

  const candidates = [
    ...history.map((name) => ({ label: name, names: [name] })),
    ...CATALOG.map((c) => ({ label: lang === 'he' ? c.he : c.en, names: [c.en, c.he] })),
  ];

  for (const { label, names } of candidates) {
    const key = normalize(label);
    if (seen.has(key) || excluded.has(key)) continue;
    const norm = names.map(normalize);
    if (norm.some((n) => n.startsWith(q))) {
      starts.push(label);
      seen.add(key);
    } else if (norm.some((n) => n.split(/\s+/).some((w) => w.startsWith(q)))) {
      words.push(label);
      seen.add(key);
    }
  }
  return [...starts, ...words].slice(0, limit);
}

export { suggest };
