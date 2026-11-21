(() => {
  'use strict';
  if (window.__ytscLoaded) return;
  window.__ytscLoaded = true;

  const ID = Math.random().toString(36).slice(2);
  const S = { ...YTSC_DEFAULTS };

  /* ───────────── util ───────────── */
  const $ = (s, r = document) => r.querySelector(s);
  const alive = () => { try { return !!chrome.runtime.id; } catch { return false; } };
  const getVideo = () => $('#movie_player video.html5-main-video') || $('#movie_player video');
  const vidId = () => new URLSearchParams(location.search).get('v');
  const isWatch = () => location.pathname === '/watch';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const title = () => document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '');
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
  };
  const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const sget = (k) => new Promise((r) => { try { chrome.storage.local.get(k, (x) => r(x || {})); } catch { r({}); } });
  const sset = (o) => { try { chrome.storage.local.set(o); } catch {} };
  const sdel = (k) => { try { chrome.storage.local.remove(k); } catch {} };

  let saveT;
  function save(patch) {
    Object.assign(S, patch);
    clearTimeout(saveT);
    saveT = setTimeout(() => sset({ settings: { ...S, _src: ID } }), 250);
  }

  /* ───────────── toast ───────────── */
  let toastT;
  function toast(msg) {
    const p = $('#movie_player');
    if (!p) return;
    let t = $('#ytsc-toast', p);
    if (!t) { t = h('div', { id: 'ytsc-toast' }); p.append(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 1400);
  }

  /* ───────────── gaya video (filter / mirror) ───────────── */
  const styleEl = h('style', { id: 'ytsc-dyn' });
  document.documentElement.append(styleEl);

  function filterStr() {
    const p = [];
    if (S.brightness !== 100) p.push(`brightness(${S.brightness}%)`);
    if (S.contrast !== 100) p.push(`contrast(${S.contrast}%)`);
    if (S.saturate !== 100) p.push(`saturate(${S.saturate}%)`);
    if (S.hue) p.push(`hue-rotate(${S.hue}deg)`);
    if (S.sepia) p.push(`sepia(${S.sepia}%)`);
    return p.join(' ');
  }
  function transformStr() {
    const p = [];
    if (S.mirror) p.push('scaleX(-1)');
    if (S.flip) p.push('scaleY(-1)');
    return p.join(' ');
  }
  function applyVideoStyle() {
    const f = filterStr(), t = transformStr();
    styleEl.textContent = f || t
      ? `#movie_player video.html5-main-video{${f ? `filter:${f}!important;` : ''}${t ? `transform:${t}!important;` : ''}}`
      : '';
  }

  /* ───────────── kecepatan ───────────── */
  function applySpeed() {
    const v = getVideo();
    if (!v) return;
    if (Math.abs(v.playbackRate - S.speed) > 0.001) v.playbackRate = S.speed;
  }
  function setSpeed(x, quiet) {
    x = clamp(Math.round(x * 100) / 100, 0.1, 16);
    save({ speed: x });
    applySpeed();
    syncPanel();
    if (!quiet) toast(`⚡ ${x}×`);
  }

  /* ───────────── booster volume (WebAudio) ───────────── */
  let ac = null, gain = null, src = null, boundEl = null, armed = false;
  function armGesture() {
    if (armed) return;
    armed = true;
    const go = () => { armed = false; applyBoost(); };
    addEventListener('pointerdown', go, { once: true, capture: true });
    addEventListener('keydown', go, { once: true, capture: true });
  }
  async function applyBoost() {
    const v = getVideo();
    if (!v) return;
    if (S.boost === 1 && !boundEl) return;
    try {
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        gain = ac.createGain();
        gain.connect(ac.destination);
        ac.onstatechange = () => { if (ac.state === 'suspended' && boundEl) ac.resume().catch(() => {}); };
      }
      if (ac.state !== 'running') { try { await ac.resume(); } catch {} }
      if (ac.state !== 'running') { armGesture(); return; }
      if (boundEl !== v) {
        try { if (src) src.disconnect(); } catch {}
        src = ac.createMediaElementSource(v);
        src.connect(gain);
        boundEl = v;
      }
      gain.gain.value = clamp(S.boost, 1, 6);
    } catch (e) {
      console.warn('[YTSC] booster volume gagal:', e);
    }
  }

  /* ───────────── kualitas ───────────── */
  const QMAP = { 2160: 'hd2160', 1440: 'hd1440', 1080: 'hd1080', 720: 'hd720', 480: 'large', 360: 'medium', 240: 'small', 144: 'tiny' };
  function applyQuality() {
    const q = QMAP[S.quality];
    if (q) document.dispatchEvent(new CustomEvent('ytsc:quality', { detail: q }));
  }

  /* ───────────── loop A-B ───────────── */
  let loopA = null, loopB = null, loopT = null;
  function startLoop() {
    clearInterval(loopT);
    loopT = null;
    if (loopB === null) return;
    loopT = setInterval(() => {
      const v = getVideo();
      if (!v || v.paused) return;
      const t = v.currentTime;
      if (t >= loopB && t - loopB < 2) v.currentTime = loopA;
    }, 60);
  }
  function setLoop(which) {
    const v = getVideo();
    if (!v) return;
    const t = v.currentTime;
    if (which === 'A') {
      loopA = t;
      if (loopB !== null && loopB <= t) loopB = null;
      toast(`🅰 A = ${fmt(t)}`);
    } else {
      if (loopA === null) loopA = 0;
      if (t <= loopA) { toast('Titik B harus setelah A'); return; }
      loopB = t;
      toast(`🅱 B = ${fmt(t)} · loop aktif`);
    }
    startLoop();
    renderMarkers();
    syncPanel();
  }
  function clearLoop(quiet) {
    loopA = loopB = null;
    clearInterval(loopT);
    loopT = null;
    renderMarkers();
    syncPanel();
    if (!quiet) toast('Loop dihapus');
  }

  /* ───────────── penanda di progress bar ───────────── */
  function renderMarkers() {
    const bar = $('#movie_player .ytp-progress-bar');
    if (!bar) return;
    let box = $('#ytsc-markers', bar);
    if (!box) { box = h('div', { id: 'ytsc-markers' }); bar.append(box); }
    box.textContent = '';
    const v = getVideo();
    const d = v && v.duration;
    if (!d || !isFinite(d)) return;
    if (loopA !== null) {
      const l = (loopA / d) * 100;
      if (loopB !== null) box.append(h('div', { class: 'ytsc-range', style: `left:${l}%;width:${((loopB - loopA) / d) * 100}%` }));
      else box.append(h('div', { class: 'ytsc-pin', style: `left:${l}%` }));
    }
    for (const n of notes) box.append(h('div', { class: 'ytsc-tick', style: `left:${(n.t / d) * 100}%` }));
  }

  /* ───────────── catatan timestamp ───────────── */
  let notes = [];
  async function loadNotes() {
    const id = vidId();
    notes = [];
    if (id) {
      const r = await sget('bm:' + id);
      if (id === vidId()) notes = (r['bm:' + id] && r['bm:' + id].notes) || [];
    }
    renderNotes();
    renderMarkers();
  }
  function persistNotes() {
    const id = vidId();
    if (!id) return;
    if (notes.length) sset({ ['bm:' + id]: { title: title(), notes } });
    else sdel('bm:' + id);
  }
  function addNote(text) {
    const v = getVideo();
    if (!v) return;
    notes.push({ t: Math.floor(v.currentTime), text: (text || '').trim() || 'Penanda' });
    notes.sort((a, b) => a.t - b.t);
    persistNotes();
    renderNotes();
    renderMarkers();
    toast(`📝 ${fmt(v.currentTime)} disimpan`);
  }
  function seek(t) { const v = getVideo(); if (v) v.currentTime = t; }
  async function copyNotes() {
    const id = vidId();
    if (!id || !notes.length) { toast('Belum ada catatan'); return; }
    const md = `# ${title()}\nhttps://www.youtube.com/watch?v=${id}\n\n` +
      notes.map((n) => `- [${fmt(n.t)}](https://youtu.be/${id}?t=${n.t}) ${n.text}`).join('\n');
    try { await navigator.clipboard.writeText(md); toast('📋 Catatan disalin (Markdown)'); }
    catch { toast('Gagal menyalin'); }
  }

  /* ───────────── screenshot ───────────── */
  async function screenshot(copy) {
    try {
      const v = getVideo();
      if (!v || !v.videoWidth) throw new Error('no video');
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const x = c.getContext('2d');
      const f = filterStr();
      if (f) x.filter = f;
      if (S.mirror || S.flip) {
        x.translate(S.mirror ? c.width : 0, S.flip ? c.height : 0);
        x.scale(S.mirror ? -1 : 1, S.flip ? -1 : 1);
      }
      x.drawImage(v, 0, 0, c.width, c.height);
      const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('blob'))), 'image/png'));
      if (copy) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('📋 Frame disalin ke clipboard');
      } else {
        const url = URL.createObjectURL(blob);
        const a = h('a', { href: url, download: `${safeName(title())}_${fmt(v.currentTime).replace(/:/g, '-')}.png` });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast('📷 Screenshot tersimpan');
      }
    } catch (e) {
      toast('Gagal mengambil frame (video terproteksi?)');
    }
  }

  async function pip() {
    const v = getVideo();
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch { toast('Picture-in-Picture tidak tersedia'); }
  }

  function stepFrame(dir) {
    const v = getVideo();
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, v.currentTime + dir / 30);
  }

  /* ───────────── timer tidur ───────────── */
  let sleepAt = 0, sleepMin = 0, sleepTimer = null;
  function setSleep(min) {
    clearTimeout(sleepTimer);
    sleepMin = min;
    if (!min) { sleepAt = 0; toast('Timer tidur dimatikan'); syncPanel(); return; }
    sleepAt = Date.now() + min * 60000;
    sleepTimer = setTimeout(() => {
      const v = getVideo();
      if (v) v.pause();
      sleepAt = 0; sleepMin = 0;
      toast('😴 Timer tidur: video dijeda');
      syncPanel();
    }, min * 60000);
    toast(`😴 Dijeda otomatis dalam ${min} menit`);
    syncPanel();
  }

  /* ───────────── statistik tontonan ───────────── */
  let pend = { w: 0, s: 0 };
  const today = () => new Date().toLocaleDateString('sv-SE');
  function statTick() {
    const v = getVideo();
    const p = $('#movie_player');
    if (!v || v.paused || v.ended || !isWatch() || (p && p.classList.contains('ad-showing'))) return;
    pend.w += 1;
    pend.s += Math.max(0, v.playbackRate - 1);
  }
  async function flushStats() {
    if (!pend.w || !alive()) return;
    const add = pend;
    pend = { w: 0, s: 0 };
    const r = await sget('stats');
    const stats = r.stats || {};
    const k = today();
    const cur = stats[k] || { w: 0, s: 0 };
    cur.w += add.w;
    cur.s += add.s;
    stats[k] = cur;
    const keys = Object.keys(stats).sort();
    while (keys.length > 35) delete stats[keys.shift()];
    sset({ stats });
  }

  /* ───────────── otomatisasi ───────────── */
  const SKIP_SEL = '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-container button';
  function skipAds() {
    let b = $(SKIP_SEL);
    if (b && b.offsetParent !== null) {
      if (b.tagName !== 'BUTTON') b = b.querySelector('button') || b;
      b.click();
    }
    const c = $('.ytp-ad-overlay-close-button');
    if (c) c.click();
  }

  let theaterDone = null;
  function maybeTheater() {
    if (!S.autoTheater || theaterDone === vidId()) return;
    const flexy = $('ytd-watch-flexy');
    const btn = $('.ytp-size-button');
    if (!flexy || !btn) return;
    if (!flexy.hasAttribute('theater') && !flexy.hasAttribute('fullscreen')) btn.click();
    theaterDone = vidId();
  }

  let pausedByUs = false;
  document.addEventListener('visibilitychange', () => {
    if (!S.autoPauseHidden || document.pictureInPictureElement) return;
    const v = getVideo();
    if (!v) return;
    if (document.hidden) {
      if (!v.paused) { v.pause(); pausedByUs = true; }
    } else if (pausedByUs) {
      v.play().catch(() => {});
      pausedByUs = false;
    }
    if (document.hidden) flushStats();
  });

  /* ───────────── mode bioskop ───────────── */
  const cinemaEl = h('div', { id: 'ytsc-cinema' });
  document.body.append(cinemaEl);

  /* ───────────── panel ───────────── */
  const ui = {};
  const syncs = [];
  let panel = null;
  let currentTab = 'speed';
  const syncPanel = () => { for (const f of syncs) { try { f(); } catch {} } };

  const btn = (t, f, cls) => h('button', { class: 'btn ' + (cls || ''), onclick: f }, t);

  function sliderRow(label, key, min, max, step, fmtFn, onSet) {
    const inp = h('input', { type: 'range', min, max, step });
    const out = h('span', { class: 'v' });
    const sync = () => { inp.value = S[key]; out.textContent = fmtFn(S[key]); };
    inp.addEventListener('input', () => {
      const val = +inp.value;
      save({ [key]: val });
      out.textContent = fmtFn(val);
      if (onSet) onSet(val);
    });
    syncs.push(sync);
    sync();
    return h('label', { class: 'row' }, h('span', { class: 'l' }, label), inp, out);
  }
  function checkRow(label, key, onSet) {
    const inp = h('input', { type: 'checkbox' });
    const sync = () => { inp.checked = !!S[key]; };
    inp.addEventListener('change', () => { save({ [key]: inp.checked }); if (onSet) onSet(); });
    syncs.push(sync);
    sync();
    return h('label', { class: 'chk' }, inp, h('span', {}, label));
  }
  const section = (name, ...kids) => h('div', { class: 'sec' }, h('h4', {}, name), ...kids);

  function renderNotes() {
    const box = ui.noteList;
    if (!box) return;
    box.textContent = '';
    if (!notes.length) { box.append(h('div', { class: 'empty' }, 'Belum ada catatan. Tulis lalu tekan “Tambah” (atau Alt+N).')); return; }
    notes.forEach((n, i) => {
      box.append(h('div', { class: 'note' },
        h('button', { class: 'ts', onclick: () => seek(n.t) }, fmt(n.t)),
        h('span', { class: 'tx' }, n.text),
        h('button', { class: 'x', title: 'Hapus', onclick: () => { notes.splice(i, 1); persistNotes(); renderNotes(); renderMarkers(); } }, '×')));
    });
  }

  function buildPanel() {
    syncs.length = 0;

    /* — tab kecepatan — */
    const spOut = h('div', { class: 'big' });
    const spInp = h('input', { type: 'range', min: 0, max: 1000, step: 1 });
    const toPos = (s) => Math.round((1000 * Math.log(s / 0.1)) / Math.log(160));
    const fromPos = (p) => Math.round(0.1 * Math.pow(160, p / 1000) * 20) / 20;
    spInp.addEventListener('input', () => setSpeed(fromPos(+spInp.value), true));
    syncs.push(() => {
      const r = (getVideo() || {}).playbackRate || S.speed;
      spOut.textContent = r.toFixed(2).replace(/\.?0+$/, '') + '×';
      if (document.activeElement !== spInp) spInp.value = toPos(clamp(r, 0.1, 16));
    });
    const chips = h('div', { class: 'chips' },
      [0.5, 1, 1.25, 1.5, 2, 2.5, 3, 4, 8, 16].map((x) => h('button', { class: 'chip', onclick: () => setSpeed(x) }, x + '×')));

    const loopTxt = h('div', { class: 'hint' });
    syncs.push(() => {
      loopTxt.textContent = loopA === null ? 'Belum ada loop (Alt+1 / Alt+2 / Alt+3)' : `A ${fmt(loopA)} → B ${loopB === null ? '…' : fmt(loopB)}`;
    });

    const tabSpeed = h('div', { class: 'body', 'data-tab': 'speed' },
      section('Kecepatan putar', h('div', { class: 'speedtop' }, spOut, spInp), chips,
        h('div', { class: 'hint' }, 'Tombol [ dan ] mengubah kecepatan, \\ untuk reset.')),
      section('Booster volume',
        sliderRow('Volume', 'boost', 1, 6, 0.1, (x) => Math.round(x * 100) + '%', applyBoost),
        h('div', { class: 'hint' }, 'Di atas 200% suara bisa pecah. Hati-hati dengan headphone.')),
      section('Loop A–B', h('div', { class: 'btns' }, btn('Set A', () => setLoop('A')), btn('Set B', () => setLoop('B')), btn('Hapus', () => clearLoop())), loopTxt),
      checkRow('Ingat kecepatan di video berikutnya', 'rememberSpeed'));

    /* — tab video — */
    const tabVideo = h('div', { class: 'body', 'data-tab': 'video' },
      section('Filter warna',
        sliderRow('Kecerahan', 'brightness', 50, 200, 1, (x) => x + '%', applyVideoStyle),
        sliderRow('Kontras', 'contrast', 50, 200, 1, (x) => x + '%', applyVideoStyle),
        sliderRow('Saturasi', 'saturate', 0, 300, 1, (x) => x + '%', applyVideoStyle),
        sliderRow('Rona', 'hue', 0, 360, 1, (x) => x + '°', applyVideoStyle),
        sliderRow('Sepia', 'sepia', 0, 100, 1, (x) => x + '%', applyVideoStyle),
        btn('Reset filter', () => {
          save({ brightness: 100, contrast: 100, saturate: 100, hue: 0, sepia: 0 });
          applyVideoStyle(); syncPanel();
        })),
      section('Transformasi',
        checkRow('Cermin horizontal (Alt+M)', 'mirror', applyVideoStyle),
        checkRow('Balik vertikal', 'flip', applyVideoStyle)),
      section('Mode bioskop',
        checkRow('Redupkan area sekitar pemutar (Alt+L)', 'cinema', applyAll),
        sliderRow('Kegelapan', 'cinemaOpacity', 30, 100, 1, (x) => x + '%', applyAll)));

    /* — tab alat — */
    const sleepSel = h('select', {},
      [[0, 'Mati'], [15, '15 menit'], [30, '30 menit'], [45, '45 menit'], [60, '1 jam'], [90, '1,5 jam'], [120, '2 jam']]
        .map(([v, t]) => h('option', { value: v }, t)));
    const sleepTxt = h('span', { class: 'hint' });
    sleepSel.addEventListener('change', () => setSleep(+sleepSel.value));
    syncs.push(() => {
      sleepSel.value = sleepMin;
      sleepTxt.textContent = sleepAt ? `sisa ${fmt((sleepAt - Date.now()) / 1000)}` : '';
    });

    const qSel = h('select', {},
      [['auto', 'Otomatis'], ['2160', '2160p (4K)'], ['1440', '1440p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p'], ['360', '360p'], ['240', '240p'], ['144', '144p']]
        .map(([v, t]) => h('option', { value: v }, t)));
    qSel.addEventListener('change', () => { save({ quality: qSel.value }); applyQuality(); });
    syncs.push(() => { qSel.value = S.quality; });

    const tabTools = h('div', { class: 'body', 'data-tab': 'tools' },
      section('Tangkap frame',
        h('div', { class: 'btns' }, btn('📷 Simpan PNG', () => screenshot(false)), btn('📋 Salin', () => screenshot(true))),
        h('div', { class: 'hint' }, 'Termasuk filter & cermin. Pintasan: Alt+S')),
      section('Pemutar',
        h('div', { class: 'btns' }, btn('◀ Frame', () => stepFrame(-1)), btn('Frame ▶', () => stepFrame(1)), btn('PiP', pip))),
      section('Timer tidur', h('div', { class: 'inline' }, sleepSel, sleepTxt)),
      section('Kualitas favorit', h('div', { class: 'inline' }, qSel), h('div', { class: 'hint' }, 'Bersifat “upaya terbaik”; YouTube bisa mengabaikannya.')),
      section('Otomatis',
        checkRow('Klik “Lewati iklan” saat tombol muncul', 'autoSkipAds'),
        checkRow('Mode teater otomatis', 'autoTheater'),
        checkRow('Jeda saat tab disembunyikan', 'autoPauseHidden')));

    /* — tab catatan — */
    const noteInp = h('input', { type: 'text', class: 'txt', placeholder: 'Catatan untuk waktu ini…', maxlength: 200 });
    const add = () => { addNote(noteInp.value); noteInp.value = ''; };
    noteInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    ui.noteList = h('div', { class: 'notes' });
    const tabNotes = h('div', { class: 'body', 'data-tab': 'notes' },
      h('div', { class: 'inline' }, noteInp, btn('Tambah', add)),
      ui.noteList,
      h('div', { class: 'btns' }, btn('📋 Salin Markdown', copyNotes),
        btn('Hapus semua', () => { notes = []; persistNotes(); renderNotes(); renderMarkers(); })));

    /* — rangka panel — */
    const tabs = [
      { id: 'speed', name: '⚡ Kecepatan', body: tabSpeed },
      { id: 'video', name: '🎨 Video', body: tabVideo },
      { id: 'tools', name: '🧰 Alat', body: tabTools },
      { id: 'notes', name: '📝 Catatan', body: tabNotes }
    ];
    const bar = h('div', { class: 'tabs' });
    const show = (id) => {
      currentTab = id;
      for (const t of tabs) {
        t.btn.classList.toggle('on', t.id === id);
        t.body.style.display = t.id === id ? '' : 'none';
      }
    };
    for (const t of tabs) {
      t.btn = h('button', { class: 'tab', onclick: () => show(t.id) }, t.name);
      bar.append(t.btn);
    }
    const head = h('div', { class: 'head' }, h('b', {}, '⚡ YT Supercharger'), h('button', { class: 'close', title: 'Tutup', onclick: () => togglePanel(false) }, '×'));
    const el = h('div', { id: 'ytsc-panel' }, head, bar, ...tabs.map((t) => t.body));
    for (const ev of ['click', 'dblclick', 'mousedown', 'mouseup', 'keydown', 'keyup', 'wheel', 'contextmenu']) {
      el.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'keydown' && e.key === 'Escape') togglePanel(false); });
    }
    show(currentTab);
    renderNotes();
    syncPanel();
    return el;
  }

  function togglePanel(force) {
    const p = $('#movie_player');
    if (!p) return;
    if (!panel || !panel.isConnected) { panel = buildPanel(); p.append(panel); }
    const open = force === undefined ? !panel.classList.contains('open') : force;
    panel.classList.toggle('open', open);
    const b = $('#ytsc-btn');
    if (b) b.classList.toggle('on', open);
    if (open) syncPanel();
  }

  function makeBtn() {
    const b = h('button', { id: 'ytsc-btn', class: 'ytp-button', title: 'YT Supercharger (Alt+P)', 'aria-label': 'YT Supercharger', onclick: (e) => { e.stopPropagation(); togglePanel(); } });
    b.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M13 2 4.5 13.5H11L10 22l9.5-12H13z"/></svg>';
    return b;
  }

  /* ───────────── apply all ───────────── */
  function applyAll() {
    const c = document.documentElement.classList;
    c.toggle('ytsc-hide-shorts', !!S.hideShorts);
    c.toggle('ytsc-hide-comments', !!S.hideComments);
    c.toggle('ytsc-hide-recs', !!S.hideRecs);
    c.toggle('ytsc-hide-endcards', !!S.hideEndCards);
    c.toggle('ytsc-cinema-on', !!S.cinema);
    c.toggle('ytsc-hide-btn', !S.showButton);
    cinemaEl.style.opacity = String(S.cinemaOpacity / 100);
    applyVideoStyle();
    applySpeed();
    applyBoost();
    syncPanel();
  }

  /* ───────────── video & navigasi ───────────── */
  let boundVideo = null;
  function bindVideo() {
    const v = getVideo();
    if (!v || v === boundVideo) return;
    boundVideo = v;
    const onMeta = () => {
      applySpeed();
      applyBoost();
      setTimeout(applySpeed, 700);
      setTimeout(applyQuality, 1200);
      renderMarkers();
    };
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('durationchange', renderMarkers);
    v.addEventListener('ratechange', syncPanel);
    v.addEventListener('play', () => { if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); });
    if (v.readyState >= 1) onMeta();
  }

  let lastVid = null;
  function onVideoChange() {
    lastVid = vidId();
    clearLoop(true);
    theaterDone = null;
    if (!S.rememberSpeed && S.speed !== 1) save({ speed: 1 });
    applySpeed();
    loadNotes();
    setTimeout(applyQuality, 1500);
  }

  function tick() {
    if (!alive()) { shutdown(); return; }
    const watch = isWatch();
    document.documentElement.classList.toggle('ytsc-watch', watch);
    if (!watch) return;
    const p = $('#movie_player');
    if (!p) return;
    bindVideo();
    if (vidId() !== lastVid) onVideoChange();
    if (!$('#ytsc-btn', p)) {
      const rc = $('.ytp-right-controls', p);
      if (rc) rc.prepend(makeBtn());
    }
    if (!$('#ytsc-markers', p)) renderMarkers();
    maybeTheater();
    if (panel && panel.classList.contains('open')) syncPanel();
  }

  const timers = [];
  function shutdown() {
    timers.forEach(clearInterval);
    clearInterval(loopT);
    for (const sel of ['#ytsc-btn', '#ytsc-panel', '#ytsc-markers', '#ytsc-cinema', '#ytsc-dyn']) {
      const el = $(sel);
      if (el) el.remove();
    }
    document.documentElement.classList.remove('ytsc-watch', 'ytsc-cinema-on', 'ytsc-hide-shorts', 'ytsc-hide-comments', 'ytsc-hide-recs', 'ytsc-hide-endcards');
  }

  /* ───────────── pintasan keyboard ───────────── */
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (!isWatch() || e.ctrlKey || e.metaKey) return;
    const cur = () => (getVideo() || {}).playbackRate || S.speed;
    let used = true;
    if (e.altKey) {
      switch (e.code) {
        case 'Digit1': setLoop('A'); break;
        case 'Digit2': setLoop('B'); break;
        case 'Digit3': clearLoop(); break;
        case 'KeyS': screenshot(false); break;
        case 'KeyN': addNote(''); break;
        case 'KeyP': togglePanel(); break;
        case 'KeyM': save({ mirror: !S.mirror }); applyVideoStyle(); syncPanel(); toast(S.mirror ? '↔ Cermin aktif' : '↔ Cermin mati'); break;
        case 'KeyL': save({ cinema: !S.cinema }); applyAll(); break;
        case 'KeyI': pip(); break;
        default: used = false;
      }
    } else {
      switch (e.code) {
        case 'BracketRight': setSpeed(cur() + S.speedStep); break;
        case 'BracketLeft': setSpeed(cur() - S.speedStep); break;
        case 'Backslash': setSpeed(1); break;
        default: used = false;
      }
    }
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ───────────── pesan dari popup ───────────── */
  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (!m) return;
    if (m.type === 'togglePanel') togglePanel();
    else if (m.type === 'screenshot') screenshot(false);
    reply({ ok: isWatch() });
  });

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !ch.settings) return;
    const nv = ch.settings.newValue || {};
    if (nv._src === ID) return;
    const { _src, ...rest } = nv;
    Object.assign(S, YTSC_DEFAULTS, rest);
    applyAll();
    applyQuality();
  });

  document.addEventListener('yt-navigate-finish', () => setTimeout(tick, 60));
  addEventListener('pagehide', flushStats);

  /* ───────────── mulai ───────────── */
  (async () => {
    const r = await sget('settings');
    Object.assign(S, YTSC_DEFAULTS, r.settings || {});
    delete S._src;
    applyAll();
    tick();
    timers.push(setInterval(tick, 1000));
    timers.push(setInterval(() => { if (S.autoSkipAds && isWatch()) skipAds(); }, 400));
    timers.push(setInterval(statTick, 1000));
    timers.push(setInterval(flushStats, 15000));
  })();
})();
