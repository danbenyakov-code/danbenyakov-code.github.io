// PairCart web (PWA) v2. Same Firestore model as the Android app:
// households/{h}/lists|items|categories (+ purchases, receipts, staples since 0.2.0).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch,
  collection, query, where, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { CATALOG, ICONS } from './catalog.js?v=3';

const firebaseConfig = { // public by design; access is enforced by Firestore rules
  apiKey: 'AIzaSyCSTRBb1Huclgqh-GO6W3QUoBGE5aTXOc0', authDomain: 'paircart-7179e.firebaseapp.com', projectId: 'paircart-7179e',
  storageBucket: 'paircart-7179e.firebasestorage.app', messagingSenderId: '172916625582', appId: '1:172916625582:web:9cecf1b3873e1ae46b5d3f',
};
const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

// ---------- i18n, theme, currency ----------
const HE = localStorage.lang ? localStorage.lang === 'he' : /^(he|iw)/i.test(navigator.language || '');
document.documentElement.lang = HE ? 'he' : 'en'; document.documentElement.dir = HE ? 'rtl' : 'ltr';
const applyTheme = () => { const m = localStorage.theme || 'system'; const dark = m === 'dark' || (m === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark); document.querySelector('meta[name=theme-color]').content = dark ? '#0E1426' : '#ffffff'; };
applyTheme(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
const CUR = { USD: '$', ILS: '₪', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$' };
const cur = () => localStorage.cur || (HE ? 'ILS' : 'USD');
const money = (v, c = cur()) => v == null || v === '' ? '' : `${CUR[c] || ''}${Number(v).toLocaleString(HE ? 'he-IL' : 'en-US', { maximumFractionDigits: 2 })}`;
const T = HE ? {
  signin: 'התחברות עם Google', hint: 'התחברו עם אותו חשבון Google כמו באפליקציה, והרשימות יסתנכרנו ביניהן.',
  search: 'חיפוש או הוספה', addX: n => `הוסף "${n}" לרשימה`, addN: n => `הוסף ${n} פריטים לרשימה`, multi: 'אפשר כמה פריטים מופרדים בפסיק',
  empty: 'הרשימה ריקה', emptyHint: 'כתבו פריט בשורת החיפוש למעלה', end: 'זהו, הגעתם לסוף', inCart: 'בעגלה', newB: 'חדש',
  tabs: ['רשימה', 'מוצרים', 'היסטוריה', 'דשבורד'], lists: 'רשימות', newList: 'רשימה חדשה', listName: 'שם הרשימה', theme: 'תצוגה', lang: 'English', currency: 'מטבע',
  out: 'התנתקות', android: 'PairCart ל־Android', privacy: 'מדיניות פרטיות', deleted: 'נמחק', undo: 'ביטול', added: n => `נוסף: ${n}`, addedN: n => `נוספו ${n} פריטים`,
  finish: 'סיימתי', clear: 'ניקוי מסומנים', catOrder: 'סדר קטגוריות', listSet: 'הגדרות רשימה', share: 'שיתוף', copy: 'העתקה', copied: 'הועתק', cart: 'מצב עגלה',
  qty: 'כמות', unit: 'יחידה', cat: 'קטגוריה', note: 'הערה', name: 'שם', del: 'מחיקה', save: 'שמירה', close: 'סגירה', staple: 'ברשימה הקבועה', toStaple: 'הוסף לרשימה הקבועה',
  finTitle: 'סיום קנייה', finSub: n => `${n} פריטים שסימנתם יעברו להיסטוריה`, cost: 'עלות', store: 'חנות', scan: 'צילום קבלה', reading: 'קורא את הקבלה…', found: v => `זוהה סכום ${v}`, notFound: 'לא זוהה סכום, אפשר להקליד',
  finDone: 'הקנייה נשמרה 🎉', noneChecked: 'סמנו קודם את הפריטים שקניתם', history: 'היסטוריה', histEmpty: 'כל הקניות שסיימתם יופיעו כאן. לסיום קנייה לוחצים על "סיימתי"',
  bought: n => `${n} נקנו`, addAll: 'הוסף הכל לרשימה', receipt: 'קבלה', addReceipt: 'הוסף קבלה', showCost: 'הצג עלויות', hideCost: 'הסתר עלויות', delPurchase: 'למחוק את הקנייה מההיסטוריה?',
  products: 'מוצרים', staples: 'רשימה קבועה', staplesHint: 'פריטים שאתם קונים תמיד. הוספה בלחיצה אחת', addStaples: 'הוסף את הקבועים לרשימה', stapleAdd: 'פריט קבוע חדש',
  recs: 'המלצות בשבילך', recsHint: 'לפי הקצב שבו אתם קונים', every: d => `בדרך כלל כל ${d} ימים`, ago: d => d === 0 ? 'נקנה היום' : `נקנה לפני ${d} ימים`, top: 'הכי נקנים', times: n => `${n} פעמים`,
  dash: 'דשבורד', month: 'החודש', vsLast: p => `${p > 0 ? '▲' : '▼'} ${Math.abs(p)}% מהחודש שעבר`, avg: 'ממוצע לקנייה', trips: 'קניות החודש', items: 'פריטים החודש', six: 'הוצאות ב־6 חודשים',
  byCat: 'פריטים לפי קטגוריה', byStore: 'לפי חנות', dashEmpty: 'אחרי כמה קניות עם עלות יופיע כאן הדשבורד', dragHint: 'גררו את הסימן כדי לשנות את הסדר', invite: 'הזמנת שותף לרשימה מתבצעת מהאפליקציה ב־Android',
  delList: 'מחיקת הרשימה', delListQ: 'למחוק את הרשימה?', none: 'ללא', defList: 'קניות', more: n => `ועוד ${n}`, less: 'פחות',
  cats: { produce: 'ירקות ופירות', dairy: 'חלב וביצים', meat_fish: 'בשר ודגים', bakery: 'מאפים', pantry: 'מזווה', drinks: 'משקאות', frozen: 'קפואים', cleaning: 'ניקיון', pharm: 'פארם', home: 'לבית', other: 'אחר' },
} : {
  signin: 'Sign in with Google', hint: 'Use the same Google account as in the app and your lists stay in sync.',
  search: 'Search or add', addX: n => `Add "${n}" to the list`, addN: n => `Add ${n} items to the list`, multi: 'Add several items separated by commas',
  empty: 'The list is empty', emptyHint: 'Type an item in the search bar above', end: "That's it, you reached the end", inCart: 'In the cart', newB: 'New',
  tabs: ['List', 'Products', 'History', 'Dashboard'], lists: 'Lists', newList: 'New list', listName: 'List name', theme: 'Theme', lang: 'עברית', currency: 'Currency',
  out: 'Sign out', android: 'PairCart for Android', privacy: 'Privacy policy', deleted: 'Deleted', undo: 'Undo', added: n => `Added: ${n}`, addedN: n => `Added ${n} items`,
  finish: 'Done shopping', clear: 'Clear checked', catOrder: 'Category order', listSet: 'List settings', share: 'Share', copy: 'Copy', copied: 'Copied', cart: 'Cart mode',
  qty: 'Quantity', unit: 'Unit', cat: 'Category', note: 'Note', name: 'Name', del: 'Delete', save: 'Save', close: 'Close', staple: 'In your staples', toStaple: 'Add to staples',
  finTitle: 'Finish shopping', finSub: n => `${n} checked items move to history`, cost: 'Cost', store: 'Store', scan: 'Scan receipt', reading: 'Reading the receipt…', found: v => `Found total ${v}`, notFound: 'No total found, type it in',
  finDone: 'Purchase saved 🎉', noneChecked: 'Check the items you bought first', history: 'History', histEmpty: 'Every finished shopping trip shows up here. Tap "Done shopping" to finish one',
  bought: n => `${n} bought`, addAll: 'Add all to list', receipt: 'Receipt', addReceipt: 'Add receipt', showCost: 'Show costs', hideCost: 'Hide costs', delPurchase: 'Delete this purchase from history?',
  products: 'Products', staples: 'Staples', staplesHint: 'Things you always buy. One tap to add', addStaples: 'Add staples to the list', stapleAdd: 'New staple',
  recs: 'Suggested for you', recsHint: 'Based on how often you buy', every: d => `Usually every ${d} days`, ago: d => d === 0 ? 'Bought today' : `Bought ${d} days ago`, top: 'Most bought', times: n => `${n} times`,
  dash: 'Dashboard', month: 'This month', vsLast: p => `${p > 0 ? '▲' : '▼'} ${Math.abs(p)}% vs last month`, avg: 'Avg per trip', trips: 'Trips this month', items: 'Items this month', six: 'Spending, last 6 months',
  byCat: 'Items by category', byStore: 'By store', dashEmpty: 'After a few trips with a cost, your dashboard appears here', dragHint: 'Drag the handle to reorder', invite: 'Invite a partner from the Android app',
  delList: 'Delete list', delListQ: 'Delete this list?', none: 'None', defList: 'Groceries', more: n => `${n} more`, less: 'Less',
  cats: { produce: 'Fruit & vegetables', dairy: 'Dairy & eggs', meat_fish: 'Meat & fish', bakery: 'Bakery', pantry: 'Pantry', drinks: 'Drinks', frozen: 'Frozen', cleaning: 'Cleaning', pharm: 'Pharmacy', home: 'Home', other: 'Other' },
};
const PALETTE = ['#22C55E', '#FF9F43', '#FF5A5F', '#E8A800', '#55BBF9', '#A142FF', '#14B8A6', '#FF5AC4', '#3B37E6', '#6BBF3B', '#9C6B4E', '#98A3BE']; // same order as Android CategoryPalette
const BUILTIN = [['produce', '🥕', 0], ['dairy', '🥛', 4], ['meat_fish', '🥩', 2], ['bakery', '🥖', 1], ['pantry', '🥫', 3], ['drinks', '🥤', 8], ['frozen', '🧊', 6], ['cleaning', '🧽', 5], ['pharm', '💊', 7], ['home', '🏠', 10], ['other', '🛒', 11]];

// ---------- icons (stroke SVG) ----------
const P = {
  menu: 'M4 7h16M4 12h16M4 17h10', dots: 'M12 5h.01M12 12h.01M12 19h.01', chev: 'M15 18l-6-6 6-6', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14', check: 'M5 12l5 5 9-10', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z', x: 'M6 6l12 12M18 6L6 18',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3', cart: 'M3 4h2l2.4 11h10.8L21 7H6.2M9 20h.01M18 20h.01', list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8', clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1', grip: 'M5 9h14M5 15h14', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4', moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
  phone: 'M7 2h10v20H7zM11 18h2', globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18', out: 'M15 4h4v16h-4M10 17l5-5-5-5M15 12H3',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v12', camera: 'M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  party: 'M4 20l4-12 8 8zM14 4l1 2M19 9l2-1M17 3l-1 3M20 14l-2-1', tag: 'M3 12V3h9l9 9-9 9zM8 8h.01',
};
const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24"><path d="${P[n]}"/></svg>`;

// ---------- helpers ----------
const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => String(s).replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const DAY = 864e5;
const rid = () => crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
const UNIT_ALIASES = { kg: ['kg', 'kgs', 'kilo', 'kilos', 'ק"ג', 'ק״ג', 'קג', 'קילו', 'קילוגרם'], g: ['g', 'gr', 'gram', 'grams', 'גרם', "ג'", 'ג׳', "גר'"],
  L: ['l', 'lt', 'liter', 'liters', 'litre', 'litres', 'ליטר', 'ליטרים', "ל'", 'ל׳'], pack: ['pack', 'packs', 'pkg', 'מארז', 'מארזים', 'חבילה', 'חבילות'], pcs: ['pcs', 'pc', "יח'", 'יח׳', 'יחידה', 'יחידות'] };
const unitCode = t => { if (!t) return null; t = String(t).trim().toLowerCase(); for (const [c, a] of Object.entries(UNIT_ALIASES)) if (c.toLowerCase() === t || a.includes(t)) return c; return null; };
const UNIT_CODES = ['pcs', 'kg', 'g', 'L', 'pack'];
const unitLabel = c => { const u = unitCode(c); if (!u) return c || ''; return HE ? { pcs: 'יח׳', kg: 'ק״ג', g: 'גרם', L: 'ליטר', pack: 'מארז' }[u] : u; };
const unitStep = c => ({ kg: .5, L: .5, g: 100 })[unitCode(c)] || 1;
const fmtQ = q => String(Math.round(q * 100) / 100);
const qtyText = i => (i.unit || (i.quantity || 1) !== 1) ? `${fmtQ(i.quantity || 1)}${i.unit ? ' ' + unitLabel(i.unit) : ''}` : '';
function parse(raw) { // same rules as Android QuickAddParser
  const t = raw.trim().replace(/\s+/g, ' '); if (!t) return null;
  const q = s => { const n = parseFloat(s.replace(',', '.')); return n > 0 && n <= 9999 ? n : null; };
  let m = t.match(/^(\d+(?:[.,]\d+)?)\s*(\S+)\s+(.+)$/); if (m && q(m[1]) && unitCode(m[2])) return { name: m[3].trim(), qty: q(m[1]), unit: unitCode(m[2]) };
  m = t.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(\S+)$/); if (m && q(m[2]) && unitCode(m[3])) return { name: m[1].trim(), qty: q(m[2]), unit: unitCode(m[3]) };
  m = t.match(/^(\d+(?:[.,]\d+)?)\s*[xX×]?\s+(.+)$/); if (m && q(m[1])) return { name: m[2].trim(), qty: q(m[1]) };
  m = t.match(/^(.+?)\s+[xX×]?\s*(\d+(?:[.,]\d+)?)$/); if (m && q(m[2])) return { name: m[1].trim(), qty: q(m[2]) };
  return { name: t, qty: 1 };
}
const splitMulti = v => v.split(/[,،\n]+/).map(s => s.trim()).filter(Boolean);
const iconFor = n => (ICONS.find(([k]) => n.includes(norm(k))) || [])[1];
const fmtDate = ms => new Date(ms).toLocaleDateString(HE ? 'he-IL' : 'en-US', { day: '2-digit', month: '2-digit' });
const monthName = ms => new Date(ms).toLocaleDateString(HE ? 'he-IL' : 'en-US', { month: 'long', year: 'numeric' });
const monthKey = ms => { const d = new Date(ms); return d.getFullYear() * 12 + d.getMonth(); };

// ---------- state & data ----------
const S = { hid: null, uid: null, user: null, lists: [], items: [], cats: {}, purchases: [], staples: [], sel: localStorage.sel || null, unsub: [], itemUnsub: null, subscribed: null,
  tab: 'list', q: '', cart: false, showCost: localStorage.showCost !== '0', expanded: {} };
const H = (...p) => doc(db, 'households', S.hid, ...p);
const C = name => collection(db, 'households', S.hid, name);

onAuthStateChanged(auth, async user => {
  S.unsub.forEach(u => u()); S.unsub = []; S.itemUnsub?.(); S.itemUnsub = null; S.subscribed = null;
  if (!user) return renderSignIn();
  S.user = user; S.uid = user.uid;
  $app.innerHTML = '<div class="center">…</div>';
  S.hid = await ensureHousehold(user.uid);
  S.unsub.push(onSnapshot(C('lists'), s => {
    S.lists = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => !l.archived).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    if (!S.lists.length) return createList(T.defList);
    const want = S.lists.some(l => l.id === S.sel) ? S.sel : S.lists[0].id;
    if (S.subscribed !== want) selectList(want); else render();
  }));
  S.unsub.push(onSnapshot(C('categories'), s => { S.cats = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); render(); }));
  S.unsub.push(onSnapshot(C('purchases'), s => { S.purchases = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.date - a.date); render(); }, () => {}));
  S.unsub.push(onSnapshot(C('staples'), s => { S.staples = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)); render(); }, () => {}));
});
async function ensureHousehold(uid) { // mirrors CloudSync.ensureHousehold
  const u = await getDoc(doc(db, 'users', uid));
  if (u.exists() && u.data().householdId) return u.data().householdId;
  const h = doc(collection(db, 'households')); const b = writeBatch(db);
  b.set(h, { ownerUid: uid, memberUids: [uid], roles: { [uid]: 'owner' }, isPro: false, type: 'personal', createdAt: serverTimestamp() });
  b.set(doc(db, 'users', uid), { householdId: h.id }, { merge: true });
  await b.commit(); return h.id;
}
function selectList(id) {
  S.sel = id; S.subscribed = id; localStorage.sel = id; S.itemUnsub?.(); S.items = [];
  S.itemUnsub = onSnapshot(query(C('items'), where('listId', '==', id)), s => { S.items = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => !i.deleted); render(); });
  render();
}
async function createList(name) {
  const id = rid(), now = Date.now();
  const pos = S.lists.reduce((m, l) => Math.max(m, l.position ?? 0), -1) + 1;
  await setDoc(H('lists', id), { name, colorIndex: S.lists.length % 6, position: pos, archived: false, createdAt: now, updatedAt: now });
  selectList(id);
}
function guessCategory(n) {
  const prev = S.items.find(i => i.normalizedName === n) || S.staples.find(i => i.normalizedName === n); if (prev) return prev.categoryKey;
  for (const p of S.purchases) { const it = (p.items || []).find(i => norm(i.n) === n); if (it?.c) return it.c; }
  const icx = ICONS.find(([k]) => n.includes(norm(k))); if (icx) return icx[2];
  const hit = CATALOG.find(([he, en]) => norm(he) === n || norm(en) === n) || CATALOG.find(([he, en]) => n.includes(norm(he)) || n.includes(norm(en)));
  return hit ? hit[2] : 'other';
}
const patch = (id, data) => updateDoc(H('items', id), { ...data, updatedAt: Date.now(), updatedBy: S.uid });
async function addOne({ name, qty = 1, unit = null, cat = null }) {
  const n = norm(name), now = Date.now();
  const dup = S.items.find(i => i.normalizedName === n && !i.checked);
  if (dup) return updateDoc(H('items', dup.id), (!unit || unitCode(dup.unit) === unit) ? { quantity: (dup.quantity || 1) + qty, updatedAt: now, updatedBy: S.uid } : { quantity: qty, unit, updatedAt: now, updatedBy: S.uid });
  const done = S.items.find(i => i.normalizedName === n && i.checked);
  if (done) return patch(done.id, { checked: false, quantity: qty, unit: unit || done.unit || null });
  await setDoc(H('items', rid()), { listId: S.sel, name, normalizedName: n, quantity: qty, unit: unit || null, note: null,
    categoryKey: cat || guessCategory(n), checked: false, deleted: false, createdAt: now, updatedAt: now, updatedBy: S.uid });
}
async function addText(v) {
  const parts = splitMulti(v).map(parse).filter(Boolean); if (!parts.length) return;
  for (const p of parts) await addOne({ name: p.name, qty: p.qty, unit: p.unit });
  toast(parts.length > 1 ? T.addedN(parts.length) : T.added(parts[0].name));
}
async function addMany(arr) { for (const a of arr) await addOne(a); toast(arr.length > 1 ? T.addedN(arr.length) : T.added(arr[0]?.name || '')); }

// ---------- toast & sheets ----------
let toastTimer;
function toast(msg, undo) {
  clearTimeout(toastTimer); document.querySelector('.toast')?.remove();
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button>${T.undo}</button>` : ''}`;
  if (undo) t.querySelector('button').onclick = () => { undo(); t.remove(); };
  document.body.append(t); toastTimer = setTimeout(() => t.remove(), 4500);
}
function sheet(html, onclick) {
  closeSheets(); const d = document.createElement('div'); d.className = 'sheet'; d.innerHTML = `<div class="panel">${html}</div>`;
  d.onclick = e => { if (e.target === d) return d.remove(); onclick?.(e, d); }; document.body.append(d); return d;
}
const closeSheets = () => document.querySelectorAll('.sheet,.drawer,.menu').forEach(e => e.remove());
function removeItem(id) { patch(id, { deleted: true }); toast(T.deleted, () => patch(id, { deleted: false })); }
async function clearChecked() {
  const b = writeBatch(db), now = Date.now();
  S.items.filter(i => i.checked).forEach(i => b.update(H('items', i.id), { deleted: true, updatedAt: now, updatedBy: S.uid })); await b.commit();
}

// ---------- categories ----------
function catInfo(key) {
  const c = S.cats[key], b = BUILTIN.find(x => x[0] === key);
  return { key, name: c?.name || T.cats[key] || key, emoji: c?.emoji || b?.[1] || '🛒', pos: c?.position ?? (b ? BUILTIN.indexOf(b) : 99), color: PALETTE[c?.colorIndex ?? b?.[2] ?? 11] || PALETTE[11] };
}
const allCats = () => [...new Set([...BUILTIN.map(b => b[0]), ...Object.keys(S.cats)])].map(catInfo).sort((a, b) => a.pos - b.pos);

// ---------- render ----------
function renderSignIn() {
  $app.innerHTML = `<div class="center"><img src="icon-192.png" width="96" height="96" style="border-radius:24px;box-shadow:var(--sh)" alt=""><h1>PairCart</h1>
    <p>${T.hint}</p><button class="gbtn" id="si">${T.signin}</button></div>`;
  document.getElementById('si').onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(e => alert(e.message));
}
function render() {
  if (!S.hid || !S.sel) return;
  const cl0 = cl(), open = S.items.filter(i => !i.checked), done = S.items.filter(i => i.checked), total = S.items.length;
  const pct = total ? Math.round(done.length * 100 / total) : 0;
  const key = [S.tab, cl0?.name, HE].join('|');
  let hdr = $app.querySelector('.hdr');
  if (!hdr || hdr.dataset.k !== key) {
    $app.innerHTML = `<div class="hdr" data-k="${esc(key)}"><div class="top"><button class="ib" id="dr" aria-label="menu">${ic('menu')}</button>
    <button class="ttl" id="lsw"><span>${esc(S.tab === 'list' ? cl0?.name : T.tabs[['list', 'products', 'history', 'dash'].indexOf(S.tab)])}</span>${S.tab === 'list' ? ic('chev') : ''}</button>
    ${S.tab === 'list' ? `<button class="ib" id="mn" aria-label="more">${ic('dots')}</button>` : ''}</div>
    ${S.tab === 'list' ? `<div class="prog"><i></i></div>
    <div class="srch"><label class="sbox">${ic('search')}<input id="in" placeholder="${T.search}" autocomplete="off" enterkeyhint="done"></label>
    <button class="ib" id="qx" hidden>${ic('x')}</button></div>` : ''}</div><main></main><div id="fabw"></div>
    <nav class="nav">${[['list', 'list'], ['products', 'box'], ['history', 'clock'], ['dash', 'chart']].map(([k, i], n) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${ic(i)}${T.tabs[n]}</button>`).join('')}</nav>`;
    hdr = $app.querySelector('.hdr'); wireHead();
  }
  const bar = hdr.querySelector('.prog i'); if (bar) bar.style.width = pct + '%';
  const inp = document.getElementById('in');
  if (inp) { if (inp.value !== S.q) inp.value = S.q; hdr.querySelector('.sbox').classList.toggle('on', !!S.q); document.getElementById('qx').hidden = !S.q; }
  const main = $app.querySelector('main'); main.className = S.cart ? 'cartmode' : '';
  main.innerHTML = { list: viewList, products: viewProducts, history: viewHistory, dash: viewDash }[S.tab](open, done);
  document.getElementById('fabw').innerHTML = S.tab === 'list' ? `<div class="fab"><button id="fin" aria-label="${T.finish}">${ic('party')}</button><button id="stp" aria-label="${T.addStaples}">${ic('star')}</button>
    <button class="plus" id="fp" aria-label="+">${ic('plus')}</button><button id="rc" aria-label="${T.scan}">${ic('receipt')}</button><button id="cm" class="${S.cart ? 'on' : ''}" aria-label="${T.cart}">${ic('cart')}</button></div>` : '';
  wire();
}
function itemRow(i) {
  const c = catInfo(i.categoryKey || 'other'), q = qtyText(i), isNew = !i.checked && i.updatedBy && i.updatedBy !== S.uid && Date.now() - (i.createdAt || 0) < 6 * 36e5;
  return `<div class="row ${i.checked ? 'done' : ''}" data-id="${i.id}" style="--c:${c.color}"><span class="cb" data-chk="${i.id}">${ic('check')}</span>
    <span class="nm">${esc(i.name)}${i.note ? `<small>${esc(i.note)}</small>` : ''}</span>${q ? `<span class="q">${esc(q)}</span>` : ''}${isNew ? `<span class="new">${T.newB}</span>` : ''}
    <span class="ico">${iconFor(i.normalizedName || norm(i.name)) || c.emoji}</span>${S.cart ? '' : ic('chev', 'chev')}</div>`;
}
function viewList(open, done) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  if (S.q) {
    const parts = splitMulti(S.q), n = norm(S.q), hits = S.items.filter(i => norm(i.name).includes(n));
    const have = new Set(open.map(i => i.normalizedName));
    const sugs = parts.length === 1 ? suggestions(S.q).filter(w => !have.has(norm(w))) : [];
    const exact = parts.length === 1 && hits.some(i => i.normalizedName === norm(parse(S.q)?.name || ''));
    return `${exact ? '' : `<button class="big" id="addq">${ic('plus')}${parts.length > 1 ? T.addN(parts.length) : esc(T.addX(parts[0].length > 22 ? parts[0].slice(0, 20) + '…' : parts[0]))}</button><div class="hint">${T.multi}</div>`}
      ${sugs.length ? `<div class="sugs">${sugs.map(w => `<button data-sug="${esc(w)}">${iconFor(norm(w)) || ''} ${esc(w)}</button>`).join('')}</div>` : ''}${hits.sort(byName).map(itemRow).join('')}`;
  }
  if (!S.items.length) return `<div class="empty"><b>🧺</b>${T.empty}<br><small>${T.emptyHint}</small></div>`;
  const groups = {}; open.forEach(i => (groups[i.categoryKey || 'other'] ??= []).push(i));
  const keys = Object.keys(groups).map(catInfo).sort((a, b) => a.pos - b.pos);
  const chips = keys.length > 2 && !S.cart ? `<div class="cchips">${keys.map(c => `<button class="cchip" data-jump="${c.key}">${c.emoji} ${esc(c.name)}</button>`).join('')}</div>` : '';
  return chips + keys.map(c => `<div class="cat" id="c-${c.key}" style="--c:${c.color}"><span class="dot">${c.emoji}</span>${esc(c.name)} <span class="n">${groups[c.key].length}</span></div>${groups[c.key].sort(byName).map(itemRow).join('')}`).join('')
    + (done.length ? `<div class="cat" style="--c:var(--m)"><span class="dot">🛒</span>${T.inCart} <span class="n">${done.length}</span></div>${done.sort(byName).map(itemRow).join('')}` : '')
    + `<div class="ends">${T.end}</div>`;
}
function suggestions(q) {
  const n = norm(q); if (!n) return []; const out = [];
  const pool = [...S.staples.map(s => s.name), ...S.purchases.flatMap(p => (p.items || []).map(i => i.n)), ...CATALOG.map(([he, en]) => HE ? he : en)];
  for (const w of pool) { const wn = norm(w); if (wn.startsWith(n) && wn !== n && !out.some(o => norm(o) === wn)) out.push(w); if (out.length >= 8) break; }
  return out;
}

// ----- products: staples + recommendations -----
function stats() {
  const m = {};
  [...S.purchases].sort((a, b) => a.date - b.date).forEach(p => (p.items || []).forEach(i => {
    const k = norm(i.n); const e = (m[k] ??= { name: i.n, c: i.c, u: i.u, q: i.q, dates: [] });
    if (e.dates.at(-1) !== p.date) e.dates.push(p.date); e.name = i.n; e.q = i.q; e.u = i.u;
  }));
  return Object.values(m);
}
function recommendations() {
  const onList = new Set(S.items.filter(i => !i.checked).map(i => i.normalizedName)), now = Date.now();
  return stats().filter(e => e.dates.length >= 2 && !onList.has(norm(e.name))).map(e => {
    const gap = Math.max(1, Math.round((e.dates.at(-1) - e.dates[0]) / DAY / (e.dates.length - 1))), since = Math.floor((now - e.dates.at(-1)) / DAY);
    return { ...e, gap, since, score: since / gap };
  }).filter(e => e.score >= .8).sort((a, b) => b.score - a.score).slice(0, 12);
}
function viewProducts() {
  const onList = new Set(S.items.filter(i => !i.checked).map(i => i.normalizedName));
  const stapleRow = s => { const c = catInfo(s.categoryKey || 'other'), on = onList.has(s.normalizedName);
    return `<div class="tl" style="--c:${c.color}"><span class="ico">${iconFor(s.normalizedName) || c.emoji}</span><span class="nm">${esc(s.name)}${qtyText({ quantity: s.quantity, unit: s.unit }) ? ` <em>${esc(qtyText({ quantity: s.quantity, unit: s.unit }))}</em>` : ''}</span>
    <button class="ib star on" data-unstar="${s.id}">${ic('star')}</button><button class="addb ${on ? 'ok' : ''}" data-padd="${esc(s.name)}" data-pc="${s.categoryKey}" data-pq="${s.quantity || 1}" data-pu="${s.unit || ''}">${ic(on ? 'check' : 'plus')}</button></div>`; };
  const recs = recommendations(), top = stats().sort((a, b) => b.dates.length - a.dates.length).slice(0, 10);
  const recRow = e => { const c = catInfo(e.c || 'other');
    return `<div class="tl" style="--c:${c.color}"><span class="ico">${iconFor(norm(e.name)) || c.emoji}</span><span class="nm">${esc(e.name)}<small>${T.every(e.gap)} · ${T.ago(e.since)}</small></span>
    <button class="addb" data-padd="${esc(e.name)}" data-pc="${e.c || ''}" data-pq="${e.q || 1}" data-pu="${e.u || ''}">${ic('plus')}</button></div>`; };
  return `<div class="h2"><h2>⭐ ${T.staples}</h2>${S.staples.length ? `<button class="lnk" id="stpall">${ic('plus')}${T.addStaples}</button>` : ''}</div>
    <div class="hint" style="text-align:start">${T.staplesHint}</div>
    <form id="stf" class="srch"><label class="sbox">${ic('star')}<input id="stin" placeholder="${T.stapleAdd}" autocomplete="off" enterkeyhint="done"></label></form>
    ${S.staples.map(stapleRow).join('')}
    ${recs.length ? `<div class="h2"><h2>✨ ${T.recs}</h2></div><div class="hint" style="text-align:start">${T.recsHint}</div>${recs.map(recRow).join('')}` : ''}
    ${top.length ? `<div class="h2"><h2>🔥 ${T.top}</h2></div>${top.map(e => { const c = catInfo(e.c || 'other'); return `<div class="tl" style="--c:${c.color}"><span class="ico">${iconFor(norm(e.name)) || c.emoji}</span><span class="nm">${esc(e.name)}<small>${T.times(e.dates.length)}</small></span>
      <button class="ib star ${S.staples.some(s => s.normalizedName === norm(e.name)) ? 'on' : ''}" data-star="${esc(e.name)}" data-pc="${e.c || ''}">${ic('star')}</button><button class="addb" data-padd="${esc(e.name)}" data-pc="${e.c || ''}" data-pq="${e.q || 1}" data-pu="${e.u || ''}">${ic('plus')}</button></div>`; }).join('')}` : ''}`;
}
async function toggleStaple(name, cat, qty = 1, unit = null) {
  const n = norm(name), ex = S.staples.find(s => s.normalizedName === n);
  if (ex) return deleteDoc(H('staples', ex.id));
  await setDoc(H('staples', rid()), { name, normalizedName: n, categoryKey: cat || guessCategory(n), quantity: qty, unit: unit || null, createdAt: Date.now(), updatedBy: S.uid });
}

// ----- history -----
function viewHistory() {
  if (!S.purchases.length) return `<div class="h2"><h2>${T.history}</h2></div><div class="empty"><b>🧾</b>${T.histEmpty}</div>`;
  const months = {}; S.purchases.forEach(p => (months[monthKey(p.date)] ??= []).push(p));
  return `<div class="h2" style="justify-content:flex-end"><button class="lnk" id="tgc">${ic('coin')}${S.showCost ? T.hideCost : T.showCost}</button></div>`
    + Object.keys(months).sort((a, b) => b - a).map(k => months[k]).map(ps => { const sum = ps.reduce((s, p) => s + (Number(p.cost) || 0), 0);
      return `<div class="month">${esc(monthName(ps[0].date))}${S.showCost && sum ? `<span>${money(sum, ps[0].currency)}</span>` : ''}</div>` + ps.map(p => {
        const its = p.items || [], ex = S.expanded[p.id], shown = ex ? its : its.slice(0, 6);
        return `<div class="card" data-pid="${p.id}"><div class="ch"><b>${fmtDate(p.date)}</b><span class="sep">|</span><b>${T.bought(its.length)}</b>
          <button class="ib" style="margin-inline-start:auto" data-pdel="${p.id}">${ic('trash')}</button></div>
          <div class="ch" style="margin-top:4px">${p.store ? `<span style="color:var(--m)">🏪 ${esc(p.store)}</span>` : ''}
          ${S.showCost ? `<label class="cost">${T.cost}: <input inputmode="decimal" data-cost="${p.id}" value="${p.cost ?? ''}"> ${CUR[p.currency || cur()] || ''}</label>` : ''}</div>
          <div class="acts"><button class="lnk" data-hall="${p.id}">${ic('plus')}${T.addAll}</button><button class="lnk" data-hcopy="${p.id}">${ic('copy')}${T.copy}</button>
          <button class="lnk" data-hshare="${p.id}">${ic('share')}${T.share}</button><button class="lnk" data-hrc="${p.id}">${ic('receipt')}${p.hasReceipt ? T.receipt : T.addReceipt}</button></div>
          <ol class="ol">${shown.map(i => `<li>${esc(i.n)}${qtyText({ quantity: i.q, unit: i.u }) ? ` <span style="color:var(--m)">· ${esc(qtyText({ quantity: i.q, unit: i.u }))}</span>` : ''}</li>`).join('')}</ol>
          ${its.length > 6 ? `<button class="more lnk" data-hexp="${p.id}">${ex ? T.less : T.more(its.length - 6)}</button>` : ''}</div>`; }).join(''); }).join('');
}
const purchaseText = p => `${cl()?.name || 'PairCart'} · ${fmtDate(p.date)}\n` + (p.items || []).map((i, n) => `${n + 1}. ${i.n}${qtyText({ quantity: i.q, unit: i.u }) ? ' · ' + qtyText({ quantity: i.q, unit: i.u }) : ''}`).join('\n');
const cl = () => S.lists.find(l => l.id === S.sel);

// ----- dashboard -----
function viewDash() {
  const ps = S.purchases, withCost = ps.filter(p => Number(p.cost) > 0);
  if (!ps.length) return `<div class="empty"><b>📊</b>${T.dashEmpty}</div>`;
  const nowK = monthKey(Date.now()), sumM = k => withCost.filter(p => monthKey(p.date) === k).reduce((s, p) => s + Number(p.cost), 0);
  const thisM = sumM(nowK), lastM = sumM(nowK - 1), pct = lastM ? Math.round((thisM - lastM) * 100 / lastM) : null;
  const tripsM = ps.filter(p => monthKey(p.date) === nowK), itemsM = tripsM.reduce((s, p) => s + (p.items || []).length, 0);
  const avg = withCost.length ? withCost.reduce((s, p) => s + Number(p.cost), 0) / withCost.length : 0;
  const six = [...Array(6)].map((_, n) => nowK - 5 + n), mx = Math.max(1, ...six.map(sumM));
  const mLabel = k => new Date(Math.floor(k / 12), k % 12, 1).toLocaleDateString(HE ? 'he-IL' : 'en-US', { month: 'short' });
  const cc = {}; ps.forEach(p => (p.items || []).forEach(i => cc[i.c || 'other'] = (cc[i.c || 'other'] || 0) + 1));
  const tot = Object.values(cc).reduce((a, b) => a + b, 0) || 1, cl2 = Object.entries(cc).sort((a, b) => b[1] - a[1]).map(([k, v]) => [catInfo(k), v]);
  const st = {}; withCost.forEach(p => { const k = p.store || '—'; st[k] = (st[k] || 0) + Number(p.cost); });
  const stores = Object.entries(st).sort((a, b) => b[1] - a[1]).slice(0, 5), smx = Math.max(1, ...stores.map(s => s[1]));
  return `<div class="kpis"><div class="kpi hero"><small>${T.month}</small><b>${money(Math.round(thisM))}</b>${pct != null ? `<i>${T.vsLast(pct)}</i>` : ''}</div>
    <div class="kpi"><small>${T.avg}</small><b>${money(Math.round(avg))}</b></div><div class="kpi"><small>${T.trips}</small><b>${tripsM.length}</b></div>
    <div class="kpi"><small>${T.items}</small><b>${itemsM}</b></div><div class="kpi"><small>${T.staples}</small><b>${S.staples.length}</b></div></div>
    <div class="h2"><h2 style="font-size:19px">${T.six}</h2></div><div class="bars">${six.map(k => `<div class="${k === nowK ? 'cur' : ''}"><span>${sumM(k) ? money(Math.round(sumM(k))) : ''}</span><i style="height:${Math.round(sumM(k) / mx * 100)}%"></i>${mLabel(k)}</div>`).join('')}</div>
    <div class="h2"><h2 style="font-size:19px">${T.byCat}</h2></div><div class="stack">${cl2.map(([c, v]) => `<i style="flex:${v};background:${c.color}"></i>`).join('')}</div>
    <div class="leg">${cl2.slice(0, 8).map(([c, v]) => `<span style="--c:${c.color}">${c.emoji} ${esc(c.name)} ${Math.round(v * 100 / tot)}%</span>`).join('')}</div>
    ${stores.length ? `<div class="h2"><h2 style="font-size:19px">${T.byStore}</h2></div>${stores.map(([s, v]) => `<div class="tl"><span class="nm">🏪 ${esc(s)}<div class="prog"><i style="width:${Math.round(v / smx * 100)}%"></i></div></span><b>${money(Math.round(v))}</b></div>`).join('')}` : ''}`;
}

// ---------- receipt: compress + OCR ----------
async function compress(file, maxW = 1100) {
  const img = await createImageBitmap(file); const s = Math.min(1, maxW / img.width);
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
  const x = cv.getContext('2d'); x.filter = 'grayscale(1) contrast(1.25)'; x.drawImage(img, 0, 0, cv.width, cv.height);
  let q = .62, url = cv.toDataURL('image/jpeg', q); while (url.length > 700000 && q > .25) url = cv.toDataURL('image/jpeg', q -= .1);
  return url;
}
let tess;
async function ocrTotal(dataUrl) {
  if (!tess) tess = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; s.onload = ok; s.onerror = no; document.head.append(s); });
  await tess;
  const { data } = await window.Tesseract.recognize(dataUrl, 'heb+eng');
  const lines = data.text.split('\n'), num = l => (l.match(/\d{1,5}(?:[.,]\d{2})/g) || []).map(v => parseFloat(v.replace(',', '.')));
  const key = /(סה"?כ|סה״כ|סך הכל|לתשלום|total|amount due|balance)/i;
  let best = null; lines.forEach((l, i) => { if (key.test(l)) { const v = num(l).length ? num(l) : num(lines[i + 1] || ''); if (v.length) best = Math.max(best || 0, ...v); } });
  if (!best) { const all = lines.slice(Math.floor(lines.length / 2)).flatMap(num); if (all.length) best = Math.max(...all); }
  return best && best < 100000 ? best : null;
}
function pickPhoto() {
  return new Promise(ok => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment'; i.onchange = () => ok(i.files[0] || null); i.click(); });
}

// ---------- sheets ----------
function openFinish(scanFirst) {
  const done = S.items.filter(i => i.checked), stores = [...new Set(S.purchases.map(p => p.store).filter(Boolean))];
  let img = null;
  const d = sheet(`<h3>${T.finTitle}</h3><div class="hint" style="text-align:start">${done.length ? T.finSub(done.length) : T.noneChecked}</div>
    <label class="fld"><span>${T.cost} (${CUR[cur()]})</span><input class="inp" id="fc" inputmode="decimal" placeholder="0"></label>
    <label class="fld"><span>${T.store}</span><input class="inp" id="fs" list="stl" value="${esc(stores[0] || '')}"><datalist id="stl">${stores.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
    <button class="btn gh" id="fph" style="width:100%">${ic('camera')}${T.scan}</button><div class="ocr" id="fo"></div><img id="fim" class="rimg" hidden alt="">
    <div class="btns"><button class="btn gh" data-x>${T.close}</button><button class="btn pr" id="fok">${ic('party')}${T.finish}</button></div>`, (e, el) => { if (e.target.closest('[data-x]')) el.remove(); });
  const shoot = async () => {
    const f = await pickPhoto(); if (!f) return; img = await compress(f);
    const im = d.querySelector('#fim'); im.src = img; im.hidden = false; const o = d.querySelector('#fo'); o.textContent = T.reading;
    try { const v = await ocrTotal(img); if (v) { d.querySelector('#fc').value = v; o.textContent = T.found(money(v)); } else o.textContent = T.notFound; } catch { o.textContent = T.notFound; }
  };
  d.querySelector('#fph').onclick = shoot; if (scanFirst) shoot();
  d.querySelector('#fok').onclick = async () => {
    const cost = parseFloat((d.querySelector('#fc').value || '').replace(',', '.')); if (!done.length && !(cost > 0)) return toast(T.noneChecked);
    const id = rid(), now = Date.now(), b = writeBatch(db);
    b.set(H('purchases', id), { listId: S.sel, listName: cl()?.name || '', date: now, items: done.map(i => ({ n: i.name, q: i.quantity || 1, u: i.unit || null, c: i.categoryKey || 'other' })),
      cost: cost > 0 ? cost : null, currency: cur(), store: d.querySelector('#fs').value.trim() || null, hasReceipt: !!img, createdBy: S.uid });
    if (img) b.set(H('receipts', id), { img, createdAt: now });
    done.forEach(i => b.update(H('items', i.id), { deleted: true, updatedAt: now, updatedBy: S.uid }));
    await b.commit(); d.remove(); toast(T.finDone);
  };
}
function openItem(it) {
  const c = catInfo(it.categoryKey || 'other'), isStaple = S.staples.some(s => s.normalizedName === it.normalizedName);
  const d = sheet(`<label class="fld"><span>${T.name}</span><input class="inp" id="en" value="${esc(it.name)}"></label>
    <div class="fld"><span>${T.qty}</span><div class="stepper"><button data-d="-1">−</button><b id="eq">${esc(qtyText(it) || '1')}</b><button data-d="1">+</button></div></div>
    <div class="fld"><span>${T.unit}</span><div class="chips2">${UNIT_CODES.map(u => `<button data-u="${u}" class="${unitCode(it.unit) === u ? 'on' : ''}">${unitLabel(u)}</button>`).join('')}<button data-u="" class="${it.unit ? '' : 'on'}">${T.none}</button></div></div>
    <div class="fld"><span>${T.cat}</span><div class="chips2">${allCats().map(k => `<button data-c="${k.key}" class="${k.key === c.key ? 'on' : ''}">${k.emoji} ${esc(k.name)}</button>`).join('')}</div></div>
    <label class="fld"><span>${T.note}</span><input class="inp" id="eno" value="${esc(it.note || '')}"></label>
    <div class="btns"><button class="btn gh" data-st>${ic('star', isStaple ? 'star on' : 'star')}${isStaple ? T.staple : T.toStaple}</button></div>
    <div class="btns"><button class="btn dn" data-del>${ic('trash')}${T.del}</button><button class="btn pr" data-x>${T.save}</button></div>`, async (e, el) => {
    const cur2 = S.items.find(i => i.id === it.id) || it;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.d) { const st = unitStep(cur2.unit), q0 = cur2.quantity || 1; const q = b.dataset.d > 0 ? Math.floor(q0 / st + 1e-9) * st + st : Math.max(st, q0 - st);
      await patch(it.id, { quantity: q }); el.querySelector('#eq').textContent = qtyText({ quantity: q, unit: cur2.unit }) || '1'; }
    if (b.dataset.u !== undefined) { const u = b.dataset.u || null, q = cur2.quantity || 1; await patch(it.id, { unit: u, quantity: u === 'g' && q < 50 ? 100 : q });
      el.querySelectorAll('[data-u]').forEach(x => x.classList.toggle('on', x === b)); el.querySelector('#eq').textContent = qtyText({ quantity: u === 'g' && q < 50 ? 100 : q, unit: u }) || '1'; }
    if (b.dataset.c) { await patch(it.id, { categoryKey: b.dataset.c }); el.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); }
    if (b.hasAttribute('data-st')) { await toggleStaple(cur2.name, cur2.categoryKey, cur2.quantity, cur2.unit); el.remove(); }
    if (b.hasAttribute('data-del')) { el.remove(); removeItem(it.id); }
    if (b.hasAttribute('data-x')) { const nn = el.querySelector('#en').value.trim(), no = el.querySelector('#eno').value.trim() || null;
      if (nn && (nn !== cur2.name || no !== (cur2.note || null))) await patch(it.id, { name: nn, normalizedName: norm(nn), note: no }); el.remove(); }
  });
}
function openDrawer() {
  closeSheets(); const u = S.user, th = localStorage.theme || 'system', d = document.createElement('div'); d.className = 'drawer';
  d.innerHTML = `<div class="dpan"><div class="me"><span class="av">${u.photoURL ? `<img src="${esc(u.photoURL)}" alt="">` : esc((u.displayName || u.email || '?')[0])}</span>
    <div><b>${esc(u.displayName || '')}</b><div class="hint" style="text-align:start;margin:2px 0 0">${esc(u.email || '')}</div></div></div>
    <div class="sec">${T.lists}</div>${S.lists.map(l => `<button class="li ${l.id === S.sel ? 'on' : ''}" data-l="${l.id}">${ic('list')}${esc(l.name)}<span class="s">${l.id === S.sel ? S.items.filter(i => !i.checked).length : ''}</span></button>`).join('')}
    <button class="li" data-new style="color:var(--p)">${ic('plus')}${T.newList}</button>
    <div class="sec">${T.theme}</div><div class="seg">${[['light', 'sun'], ['dark', 'moon'], ['system', 'phone']].map(([k, i]) => `<button data-th="${k}" class="${th === k ? 'on' : ''}">${ic(i)}</button>`).join('')}</div>
    <div class="sec">${T.currency}</div><div class="chips2">${Object.keys(CUR).map(k => `<button data-cur="${k}" class="${cur() === k ? 'on' : ''}">${CUR[k]} ${k}</button>`).join('')}</div>
    <button class="li" data-lang style="margin-top:10px">${ic('globe')}${T.lang}</button><button class="li" data-out>${ic('out')}${T.out}</button>
    <div style="margin-top:auto;padding-top:18px;border-top:1px solid var(--line);display:flex;gap:16px;flex-wrap:wrap;font-size:14px">
    <a href="https://play.google.com/store/apps/details?id=app.paircart" style="color:var(--p)">${T.android}</a><a href="../privacy.html" style="color:var(--m)">${T.privacy}</a></div></div>`;
  d.onclick = e => {
    if (e.target === d) return d.remove(); const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.l) { d.remove(); S.tab = 'list'; selectList(b.dataset.l); }
    if (b.hasAttribute('data-new')) { d.remove(); const n = prompt(T.listName); if (n?.trim()) createList(n.trim()); }
    if (b.dataset.th) { localStorage.theme = b.dataset.th; applyTheme(); d.querySelectorAll('[data-th]').forEach(x => x.classList.toggle('on', x === b)); }
    if (b.dataset.cur) { localStorage.cur = b.dataset.cur; d.querySelectorAll('[data-cur]').forEach(x => x.classList.toggle('on', x === b)); render(); }
    if (b.hasAttribute('data-lang')) { localStorage.lang = HE ? 'en' : 'he'; location.reload(); }
    if (b.hasAttribute('data-out')) { d.remove(); signOut(auth); }
  };
  document.body.append(d);
}
function openMenu() {
  closeSheets(); const m = document.createElement('div'); m.className = 'menu';
  m.innerHTML = [['fin', 'party', T.finish], ['clr', 'check', T.clear], ['cat', 'tag', T.catOrder], ['set', 'gear', T.listSet], ['shr', 'share', T.share], ['cpy', 'copy', T.copy]]
    .map(([k, i, t]) => `<button class="li" data-m="${k}">${ic(i)}${t}</button>`).join('');
  const bg = document.createElement('div'); bg.className = 'drawer'; bg.style.background = 'transparent'; bg.onclick = () => { bg.remove(); m.remove(); };
  m.onclick = e => { const k = e.target.closest('[data-m]')?.dataset.m; if (!k) return; bg.remove(); m.remove();
    const txt = () => `${cl()?.name}\n` + S.items.filter(i => !i.checked).map(i => `• ${i.name}${qtyText(i) ? ' · ' + qtyText(i) : ''}`).join('\n');
    ({ fin: () => openFinish(), clr: clearChecked, cat: openCatOrder, set: openListSettings, shr: () => navigator.share ? navigator.share({ text: txt() }).catch(() => {}) : copy(txt()), cpy: () => copy(txt()) })[k](); };
  document.body.append(bg, m);
}
const copy = t => navigator.clipboard?.writeText(t).then(() => toast(T.copied));
function openListSettings() {
  const l = cl(); const d = sheet(`<h3>${T.listSet}</h3><label class="fld"><span>${T.listName}</span><input class="inp" id="ln" value="${esc(l.name)}"></label>
    <div class="hint" style="text-align:start">👥 ${T.invite}</div>
    <div class="btns"><button class="btn dn" data-del>${ic('trash')}${T.delList}</button><button class="btn pr" data-x>${T.save}</button></div>`, async (e, el) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-x')) { const n = el.querySelector('#ln').value.trim(); if (n && n !== l.name) await updateDoc(H('lists', l.id), { name: n, updatedAt: Date.now() }); el.remove(); }
    if (b.hasAttribute('data-del') && confirm(T.delListQ)) { el.remove(); await updateDoc(H('lists', l.id), { archived: true, updatedAt: Date.now() }); }
  });
}
function openCatOrder() {
  let order = allCats();
  const d = sheet(`<h3>${T.catOrder}</h3><div class="hint" style="text-align:start">${T.dragHint}</div><div id="co"></div>
    <div class="btns"><button class="btn gh" data-x>${T.close}</button><button class="btn pr" data-ok>${T.save}</button></div>`, async (e, el) => {
    const b = e.target.closest('button'); if (!b) return; if (b.hasAttribute('data-x')) return el.remove();
    if (b.hasAttribute('data-ok')) { const bt = writeBatch(db), now = Date.now();
      order.forEach((c, n) => { const ex = S.cats[c.key], bi = BUILTIN.find(x => x[0] === c.key);
        bt.set(H('categories', c.key), { name: ex?.name ?? null, emoji: c.emoji, colorIndex: ex?.colorIndex ?? bi?.[2] ?? 11, position: n, builtIn: ex ? ex.builtIn === true : !!bi, updatedAt: now }); });
      await bt.commit(); el.remove(); }
  });
  const box = d.querySelector('#co');
  const draw = () => { box.innerHTML = order.map((c, n) => `<div class="tl" data-n="${n}" style="--c:${c.color}"><span class="grip">${ic('grip')}</span><span class="ico">${c.emoji}</span><span class="nm">${esc(c.name)}</span></div>`).join(''); };
  draw();
  box.onpointerdown = e => {
    const g = e.target.closest('.grip'); if (!g) return; e.preventDefault();
    const row = g.closest('.tl'); let from = +row.dataset.n; const h = row.offsetHeight, y0 = e.clientY; row.classList.add('drag');
    const mv = ev => { const dy = ev.clientY - y0; row.style.transform = `translateY(${dy}px)`; const to = Math.max(0, Math.min(order.length - 1, from + Math.round(dy / h))); row.dataset.to = to; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); const to = +(row.dataset.to ?? from);
      const [x] = order.splice(from, 1); order.splice(to, 0, x); draw(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
}
async function openReceipt(p) {
  if (!p.hasReceipt) { const f = await pickPhoto(); if (!f) return; const img = await compress(f); await setDoc(H('receipts', p.id), { img, createdAt: Date.now() });
    const patchP = { hasReceipt: true }; if (!p.cost) { try { const v = await ocrTotal(img); if (v) patchP.cost = v; } catch {} } await updateDoc(H('purchases', p.id), patchP); return; }
  const r = await getDoc(H('receipts', p.id));
  sheet(`<h3>${T.receipt} · ${fmtDate(p.date)}</h3>${r.exists() ? `<img class="rimg" src="${r.data().img}" alt="">` : ''}<div class="btns"><button class="btn gh" data-x>${T.close}</button></div>`, (e, el) => { if (e.target.closest('[data-x]')) el.remove(); });
}

// ---------- events ----------
function wireHead() {
  const q = id => document.getElementById(id);
  q('dr').onclick = openDrawer; q('lsw').onclick = () => S.tab === 'list' && openDrawer(); q('mn') && (q('mn').onclick = openMenu);
  $app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.q = ''; render(); scrollTo(0, 0); });
  const inp = q('in');
  if (inp) {
    let comp = false; inp.addEventListener('compositionstart', () => comp = true); inp.addEventListener('compositionend', () => { comp = false; S.q = inp.value; render(); });
    inp.oninput = () => { if (comp) return; S.q = inp.value; render(); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const v = inp.value; if (!v.trim()) return; S.q = ''; render(); addText(v); } };
    q('qx').onclick = () => { S.q = ''; render(); inp.focus(); };
  }
}
function wire() {
  const q = id => document.getElementById(id);
  q('addq') && (q('addq').onclick = () => { const v = S.q; S.q = ''; render(); addText(v); });
  $app.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => { S.q = ''; render(); addText(b.dataset.sug); });
  $app.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => document.getElementById('c-' + b.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  $app.querySelectorAll('.row').forEach(r => r.onclick = e => {
    const it = S.items.find(i => i.id === r.dataset.id); if (!it) return;
    if (e.target.closest('[data-chk]') || S.cart) { navigator.vibrate?.(10); return patch(it.id, { checked: !it.checked }); }
    openItem(it);
  });
  q('fin') && (q('fin').onclick = () => openFinish());
  q('rc') && (q('rc').onclick = () => openFinish(true));
  q('fp') && (q('fp').onclick = () => { scrollTo({ top: 0, behavior: 'smooth' }); q('in').focus(); });
  q('cm') && (q('cm').onclick = () => { S.cart = !S.cart; render(); });
  q('stp') && (q('stp').onclick = () => addStaplesToList());
  q('stpall') && (q('stpall').onclick = () => addStaplesToList());
  q('stf') && (q('stf').onsubmit = e => { e.preventDefault(); splitMulti(q('stin').value).map(parse).filter(Boolean).forEach(p => toggleStaple(p.name, null, p.qty, p.unit)); q('stin').value = ''; });
  $app.querySelectorAll('[data-padd]').forEach(b => b.onclick = () => { const bb = b.dataset; if (S.items.some(i => !i.checked && i.normalizedName === norm(bb.padd))) return;
    addMany([{ name: bb.padd, cat: bb.pc || null, qty: +bb.pq || 1, unit: bb.pu || null }]); });
  $app.querySelectorAll('[data-unstar]').forEach(b => b.onclick = () => deleteDoc(H('staples', b.dataset.unstar)));
  $app.querySelectorAll('[data-star]').forEach(b => b.onclick = () => toggleStaple(b.dataset.star, b.dataset.pc || null));
  q('tgc') && (q('tgc').onclick = () => { S.showCost = !S.showCost; localStorage.showCost = S.showCost ? '1' : '0'; render(); });
  const P_ = id => S.purchases.find(p => p.id === id);
  $app.querySelectorAll('[data-cost]').forEach(i => i.onchange = () => { const v = parseFloat(i.value.replace(',', '.')); updateDoc(H('purchases', i.dataset.cost), { cost: v > 0 ? v : null, currency: P_(i.dataset.cost)?.currency || cur() }); });
  $app.querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => { if (!confirm(T.delPurchase)) return; const id = b.dataset.pdel; await deleteDoc(H('purchases', id)); deleteDoc(H('receipts', id)).catch(() => {}); });
  $app.querySelectorAll('[data-hall]').forEach(b => b.onclick = () => { S.tab = 'list'; addMany((P_(b.dataset.hall).items || []).map(i => ({ name: i.n, qty: i.q || 1, unit: i.u, cat: i.c }))); render(); });
  $app.querySelectorAll('[data-hcopy]').forEach(b => b.onclick = () => copy(purchaseText(P_(b.dataset.hcopy))));
  $app.querySelectorAll('[data-hshare]').forEach(b => b.onclick = () => { const t = purchaseText(P_(b.dataset.hshare)); navigator.share ? navigator.share({ text: t }).catch(() => {}) : copy(t); });
  $app.querySelectorAll('[data-hrc]').forEach(b => b.onclick = () => openReceipt(P_(b.dataset.hrc)));
  $app.querySelectorAll('[data-hexp]').forEach(b => b.onclick = () => { S.expanded[b.dataset.hexp] = !S.expanded[b.dataset.hexp]; render(); });
}
function addStaplesToList() {
  const onList = new Set(S.items.filter(i => !i.checked).map(i => i.normalizedName));
  const todo = S.staples.filter(s => !onList.has(s.normalizedName)).map(s => ({ name: s.name, qty: s.quantity || 1, unit: s.unit, cat: s.categoryKey }));
  if (!todo.length) return toast(S.staples.length ? '✓' : T.staplesHint); addMany(todo);
}
