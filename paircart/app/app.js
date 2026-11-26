// PairCart web (PWA): same Firestore data model as the Android app (households/{h}/lists|items|categories).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, updateDoc, writeBatch,
  collection, query, where, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { CATALOG } from './catalog.js';

// Firebase web config (public by design; access is enforced by Firestore rules).
const firebaseConfig = {
  apiKey: 'AIzaSyCSTRBb1Huclgqh-GO6W3QUoBGE5aTXOc0', authDomain: 'paircart-7179e.firebaseapp.com', projectId: 'paircart-7179e',
  storageBucket: 'paircart-7179e.firebasestorage.app', messagingSenderId: '172916625582', appId: '1:172916625582:web:9cecf1b3873e1ae46b5d3f',
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

const HE = (localStorage.lang || navigator.language || 'en').startsWith('he') || localStorage.lang === 'iw';
document.documentElement.lang = HE ? 'he' : 'en'; document.documentElement.dir = HE ? 'rtl' : 'ltr';
const T = HE ? {
  signin: 'התחברות עם Google', hint: 'התחברו עם אותו חשבון Google כמו באפליקציה, והרשימות יסתנכרנו.', add: 'הוספה', ph: 'מה צריך? למשל "2 חלב"',
  empty: 'הרשימה ריקה', newList: '+ רשימה חדשה', listName: 'שם הרשימה', out: 'יציאה', deleted: 'נמחק', undo: 'ביטול', clear: 'ניקוי מסומנים', lang: 'EN', defList: 'קניות',
  cats: { produce: 'ירקות ופירות', dairy: 'חלב וביצים', meat_fish: 'בשר ודגים', bakery: 'מאפים', pantry: 'מזווה', drinks: 'משקאות', frozen: 'קפואים', cleaning: 'ניקיון', pharm: 'פארם', home: 'לבית', other: 'אחר' },
} : {
  signin: 'Sign in with Google', hint: 'Use the same Google account as in the app and your lists sync.', add: 'Add', ph: 'What do you need? e.g. "2 milk"',
  empty: 'The list is empty', newList: '+ New list', listName: 'List name', out: 'Sign out', deleted: 'Deleted', undo: 'Undo', clear: 'Clear checked', lang: 'עב', defList: 'Groceries',
  cats: { produce: 'Fruit & vegetables', dairy: 'Dairy & eggs', meat_fish: 'Meat & fish', bakery: 'Bakery', pantry: 'Pantry', drinks: 'Drinks', frozen: 'Frozen', cleaning: 'Cleaning', pharm: 'Pharmacy', home: 'Home', other: 'Other' },
};
const BUILTIN = [['produce','🥕'],['dairy','🥛'],['meat_fish','🥩'],['bakery','🥖'],['pantry','🥫'],['drinks','🥤'],['frozen','🧊'],['cleaning','🧽'],['pharm','💊'],['home','🏠'],['other','🛒']];

const $app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => s.replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
function parse(raw) { // same rules as Android QuickAddParser
  const t = raw.trim().replace(/\s+/g, ' '); if (!t) return null;
  const q = s => { const n = parseFloat(s.replace(',', '.')); return n > 0 && n <= 999 ? n : null; };
  let m = t.match(/^(\d+(?:[.,]\d+)?)\s*[xX×]?\s+(.+)$/); if (m && q(m[1])) return { name: m[2].trim(), qty: q(m[1]) };
  m = t.match(/^(.+?)\s+[xX×]?\s*(\d+(?:[.,]\d+)?)$/); if (m && q(m[2])) return { name: m[1].trim(), qty: q(m[2]) };
  return { name: t, qty: 1 };
}
const S = { hid: null, lists: [], items: [], cats: {}, sel: localStorage.sel || null, unsub: [], itemUnsub: null };

onAuthStateChanged(auth, async user => {
  S.unsub.forEach(u => u()); S.unsub = []; S.itemUnsub?.(); S.itemUnsub = null;
  if (!user) return renderSignIn();
  $app.innerHTML = '<div class="center">…</div>';
  S.hid = await ensureHousehold(user.uid);
  const base = doc(db, 'households', S.hid);
  S.unsub.push(onSnapshot(collection(base, 'lists'), s => {
    S.lists = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => !l.archived).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    if (!S.lists.length) return createList(T.defList);
    if (!S.lists.some(l => l.id === S.sel)) selectList(S.lists[0].id); else render();
  }));
  S.unsub.push(onSnapshot(collection(base, 'categories'), s => { S.cats = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); render(); }));
});

async function ensureHousehold(uid) { // mirrors CloudSync.ensureHousehold
  const u = await getDoc(doc(db, 'users', uid));
  if (u.exists() && u.data().householdId) return u.data().householdId;
  const h = doc(collection(db, 'households'));
  const b = writeBatch(db);
  b.set(h, { ownerUid: uid, memberUids: [uid], roles: { [uid]: 'owner' }, isPro: false, type: 'personal', createdAt: serverTimestamp() });
  b.set(doc(db, 'users', uid), { householdId: h.id }, { merge: true });
  await b.commit(); return h.id;
}
function selectList(id) {
  S.sel = id; localStorage.sel = id; S.itemUnsub?.();
  S.itemUnsub = onSnapshot(query(collection(db, 'households', S.hid, 'items'), where('listId', '==', id)), s => {
    S.items = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => !i.deleted); render();
  });
}
async function createList(name) {
  const id = crypto.randomUUID(), now = Date.now();
  const pos = S.lists.reduce((m, l) => Math.max(m, l.position ?? 0), -1) + 1;
  await setDoc(doc(db, 'households', S.hid, 'lists', id), { name, colorIndex: 0, position: pos, archived: false, createdAt: now, updatedAt: now });
  selectList(id);
}
function guessCategory(n) {
  const prev = S.items.find(i => i.normalizedName === n); if (prev) return prev.categoryKey;
  const hit = CATALOG.find(([he, en]) => norm(he) === n || norm(en) === n) || CATALOG.find(([he, en]) => n.includes(norm(he)) || n.includes(norm(en)));
  return hit ? hit[2] : 'other';
}
const itemRef = id => doc(db, 'households', S.hid, 'items', id);
async function addItem(raw) {
  const p = parse(raw); if (!p) return;
  const n = norm(p.name), now = Date.now(), uid = auth.currentUser.uid;
  const dup = S.items.find(i => i.normalizedName === n && !i.checked);
  if (dup) return updateDoc(itemRef(dup.id), { quantity: (dup.quantity || 1) + p.qty, updatedAt: now, updatedBy: uid });
  const id = crypto.randomUUID();
  await setDoc(itemRef(id), { listId: S.sel, name: p.name, normalizedName: n, quantity: p.qty, unit: null, note: null,
    categoryKey: guessCategory(n), checked: false, deleted: false, createdAt: now, updatedAt: now, updatedBy: uid });
}
const patch = (id, data) => updateDoc(itemRef(id), { ...data, updatedAt: Date.now(), updatedBy: auth.currentUser.uid });
let toastTimer;
function removeItem(id) {
  patch(id, { deleted: true }); clearTimeout(toastTimer); document.querySelector('.toast')?.remove();
  const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `<span>${T.deleted}</span><button>${T.undo}</button>`;
  t.querySelector('button').onclick = () => { patch(id, { deleted: false }); t.remove(); };
  document.body.append(t); toastTimer = setTimeout(() => t.remove(), 5000);
}
async function clearChecked() {
  const b = writeBatch(db), now = Date.now();
  S.items.filter(i => i.checked).forEach(i => b.update(itemRef(i.id), { deleted: true, updatedAt: now, updatedBy: auth.currentUser.uid }));
  await b.commit();
}

function renderSignIn() {
  $app.innerHTML = `<div class="center"><img src="icon-192.png" width="96" height="96" style="border-radius:22px" alt=""><h2>PairCart</h2>
    <p>${T.hint}</p><button class="btn" id="si">${T.signin}</button></div>`;
  document.getElementById('si').onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(e => alert(e.message));
}
function catInfo(key) {
  const c = S.cats[key], b = BUILTIN.find(x => x[0] === key);
  return { name: c?.name || T.cats[key] || key, emoji: c?.emoji || b?.[1] || '🛒', pos: c?.position ?? (b ? BUILTIN.indexOf(b) : 99) };
}
function render() {
  if (!S.hid || !S.sel) return;
  const focused = document.activeElement?.id === 'in', draft = document.getElementById('in')?.value || '';
  const open = S.items.filter(i => !i.checked), done = S.items.filter(i => i.checked);
  const groups = {}; open.forEach(i => (groups[i.categoryKey || 'other'] ??= []).push(i));
  const row = i => `<div class="row ${i.checked ? 'done' : ''}" data-id="${i.id}"><span class="chk">${i.checked ? '✓' : ''}</span>
    <span class="nm">${esc(i.name)}</span>${i.quantity && i.quantity !== 1 ? `<span class="q">${+i.quantity}${i.unit ? ' ' + esc(i.unit) : ''}</span>` : ''}
    <button class="del" data-del="${i.id}" aria-label="delete">×</button></div>`;
  const byName = (a, b) => a.name.localeCompare(b.name);
  const body = Object.keys(groups).map(k => [k, catInfo(k)]).sort((a, b) => a[1].pos - b[1].pos)
    .map(([k, c]) => `<div class="cat">${c.emoji} ${esc(c.name)}</div><div class="grp">${groups[k].sort(byName).map(row).join('')}</div>`).join('')
    + (done.length ? `<div class="cat">✓ ${done.length}</div><div class="grp">${done.sort(byName).map(row).join('')}</div><button class="clear" id="clr">${T.clear}</button>` : '');
  $app.innerHTML = `<header><select id="ls">${S.lists.map(l => `<option value="${l.id}" ${l.id === S.sel ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
      <option value="__new">${T.newList}</option></select><button id="lg">${T.lang}</button><button id="so">${T.out}</button></header>
    <main>${S.items.length ? body : `<div class="empty">${T.empty}</div>`}</main>
    <form class="add" id="f"><input id="in" placeholder="${T.ph}" autocomplete="off" enterkeyhint="done"><button>${T.add}</button></form>`;
  const inp = document.getElementById('in'); inp.value = draft; if (focused) inp.focus();
  document.getElementById('f').onsubmit = e => { e.preventDefault(); const v = inp.value; inp.value = ''; addItem(v); inp.focus(); };
  document.getElementById('ls').onchange = e => {
    if (e.target.value !== '__new') return selectList(e.target.value);
    const n = prompt(T.listName); n?.trim() ? createList(n.trim()) : (e.target.value = S.sel);
  };
  document.getElementById('so').onclick = () => signOut(auth);
  document.getElementById('lg').onclick = () => { localStorage.lang = HE ? 'en' : 'he'; location.reload(); };
  document.getElementById('clr')?.addEventListener('click', clearChecked);
  $app.querySelectorAll('.row').forEach(r => r.onclick = e => {
    const id = r.dataset.id;
    if (e.target.dataset.del) return removeItem(id);
    const it = S.items.find(i => i.id === id); patch(id, { checked: !it.checked });
  });
}
