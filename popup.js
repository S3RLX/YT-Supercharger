const D = YTSC_DEFAULTS;
let S = { ...D };
const $ = (s) => document.querySelector(s);

const fmt = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};
const dur = (sec) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}j ${m % 60}m` : `${m}m`;
};

function save(patch) {
  Object.assign(S, patch);
  chrome.storage.local.set({ settings: { ...S, _src: 'popup' } });
}

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}

const TOGGLES = [
  ['Pemutar', [
    ['rememberSpeed', 'Ingat kecepatan antar video'],
    ['autoTheater', 'Mode teater otomatis'],
    ['autoSkipAds', 'Klik otomatis tombol “Lewati iklan”'],
    ['autoPauseHidden', 'Jeda saat tab disembunyikan'],
    ['showButton', 'Tampilkan tombol ⚡ di pemutar']
  ]],
  ['Bersihkan YouTube', [
    ['hideShorts', 'Sembunyikan Shorts'],
    ['hideComments', 'Sembunyikan komentar'],
    ['hideRecs', 'Sembunyikan rekomendasi samping'],
    ['hideEndCards', 'Sembunyikan end cards']
  ]],
  ['Tampilan', [
    ['cinema', 'Mode bioskop (redupkan sekitar pemutar)']
  ]]
];

function renderOptions() {
  const box = $('#opts');
  box.textContent = '';
  for (const [name, items] of TOGGLES) {
    const g = el('div', { class: 'group' }, el('h2', {}, name));
    for (const [key, label] of items) {
      const inp = el('input', { type: 'checkbox' });
      inp.checked = !!S[key];
      inp.addEventListener('change', () => save({ [key]: inp.checked }));
      g.append(el('label', { class: 'opt' }, el('span', {}, label), el('div', { class: 'switch' }, inp, el('i'))));
    }
    box.append(g);
  }

  const g = el('div', { class: 'group' }, el('h2', {}, 'Lanjutan'));

  const q = el('select', {}, [['auto', 'Otomatis'], ['2160', '2160p'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p'], ['240', '240p'], ['144', '144p']]
    .map(([v, t]) => el('option', { value: v }, t)));
  q.value = S.quality;
  q.addEventListener('change', () => save({ quality: q.value }));
  g.append(el('label', { class: 'opt' }, el('span', {}, 'Kualitas favorit'), q));

  const st = el('select', {}, [0.05, 0.1, 0.25, 0.5].map((v) => el('option', { value: v }, `${v}×`)));
  st.value = String(S.speedStep);
  st.addEventListener('change', () => save({ speedStep: parseFloat(st.value) }));
  g.append(el('label', { class: 'opt' }, el('span', {}, 'Langkah kecepatan ( [ dan ] )'), st));

  const cm = el('input', { type: 'range', min: 30, max: 100, step: 1 });
  cm.value = S.cinemaOpacity;
  cm.addEventListener('input', () => save({ cinemaOpacity: +cm.value }));
  g.append(el('label', { class: 'opt' }, el('span', {}, 'Kegelapan mode bioskop'), cm));

  box.append(g);
}

function renderStats(stats) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ key: d.toLocaleDateString('sv-SE'), label: d.toLocaleDateString('id-ID', { weekday: 'short' }), today: i === 0 });
  }
  const t = stats[days[6].key] || { w: 0, s: 0 };
  $('#stToday').textContent = dur(t.w);
  $('#stSaved').textContent = dur(t.s);
  const max = Math.max(60, ...days.map((d) => (stats[d.key] || { w: 0 }).w));
  const chart = $('#chart');
  chart.textContent = '';
  for (const d of days) {
    const w = (stats[d.key] || { w: 0 }).w;
    const bar = el('div', { class: 'bar' + (d.today ? ' today' : ''), title: `${d.key}: ${dur(w)}` }, el('i'), el('span', {}, d.label));
    bar.querySelector('i').style.height = Math.max(2, (w / max) * 44) + 'px';
    chart.append(bar);
  }
}

async function sendToTab(type) {
  const msg = $('#msg');
  msg.textContent = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.tabs.sendMessage(tab.id, { type });
    if (!res || !res.ok) { msg.textContent = 'Buka halaman video YouTube (youtube.com/watch) dulu.'; return false; }
    return true;
  } catch {
    msg.textContent = 'Buka tab video YouTube (dan muat ulang halaman setelah memasang ekstensi).';
    return false;
  }
}

async function exportNotes() {
  const all = await chrome.storage.local.get(null);
  const lines = ['# Catatan YouTube', ''];
  let count = 0;
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith('bm:') || !v || !v.notes || !v.notes.length) continue;
    const id = k.slice(3);
    lines.push(`## ${v.title || id}`, `https://www.youtube.com/watch?v=${id}`, '');
    for (const n of v.notes) lines.push(`- [${fmt(n.t)}](https://youtu.be/${id}?t=${n.t}) ${n.text}`);
    lines.push('');
    count++;
  }
  if (!count) { $('#msg').textContent = 'Belum ada catatan untuk diekspor.'; return; }
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' }));
  const a = el('a', { href: url, download: 'catatan-youtube.md' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

(async () => {
  const r = await chrome.storage.local.get(['settings', 'stats']);
  S = { ...D, ...(r.settings || {}) };
  delete S._src;
  renderOptions();
  renderStats(r.stats || {});
  $('#openPanel').addEventListener('click', async () => { if (await sendToTab('togglePanel')) window.close(); });
  $('#shot').addEventListener('click', async () => { if (await sendToTab('screenshot')) window.close(); });
  $('#export').addEventListener('click', exportNotes);
})();
