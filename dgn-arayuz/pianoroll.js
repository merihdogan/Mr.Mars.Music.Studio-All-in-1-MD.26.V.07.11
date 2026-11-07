/* Mr. Mars Music Studio · MRH DGN — piyano rulosu (MIDI düzenleyici) */
(function (OS) {
  const U = OS.U, el = U.el, ui = OS.ui, T = OS.transport;
  const PR = ui.pianoRoll = { grid: 0.25, rowH: 14, pxb: 80, root: 0, scale: 'Kromatik', lock: false, chord: 'Yok' };
  const SCALES = OS.SCALES = {
    'Kromatik': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'Majör': [0, 2, 4, 5, 7, 9, 11], 'Doğal Minör': [0, 2, 3, 5, 7, 8, 10],
    'Armonik Minör': [0, 2, 3, 5, 7, 8, 11], 'Melodik Minör': [0, 2, 3, 5, 7, 9, 11], 'Dorian': [0, 2, 3, 5, 7, 9, 10], 'Frigyen': [0, 1, 3, 5, 7, 8, 10],
    'Lidyen': [0, 2, 4, 6, 7, 9, 11], 'Miksolidyen': [0, 2, 4, 5, 7, 9, 10], 'Majör Pentatonik': [0, 2, 4, 7, 9], 'Minör Pentatonik': [0, 3, 5, 7, 10],
    'Blues': [0, 3, 5, 6, 7, 10], 'Hicaz': [0, 1, 4, 5, 7, 8, 10], 'Kürdi': [0, 1, 3, 5, 7, 8, 10],
  };
  const CHORDS = { 'Yok': [0], 'Majör': [0, 4, 7], 'Minör': [0, 3, 7], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10], 'sus2': [0, 2, 7], 'sus4': [0, 5, 7], 'Dim': [0, 3, 6], 'Aug': [0, 4, 8], 'Power (5)': [0, 7, 12], 'add9': [0, 4, 7, 14], 'Diyatonik üçlü': 'tri', 'Diyatonik 7li': 'sev' };
  const inScale = p => SCALES[PR.scale].includes(((p - PR.root) % 12 + 12) % 12);
  const snapScale = p => { if (!PR.lock || inScale(p)) return p; for (let d = 1; d < 12; d++) { if (inScale(p - d)) return p - d; if (inScale(p + d)) return p + d; } return p; };
  // Diyatonik akorlar ölçeğin derecelerinden kurulur
  function chordNotes(p) {
    const c = CHORDS[PR.chord];
    if (Array.isArray(c)) return c.map(i => p + i);
    const sc = SCALES[PR.scale].length >= 7 ? SCALES[PR.scale] : SCALES['Majör'];
    const rel = ((p - PR.root) % 12 + 12) % 12, deg = sc.indexOf(rel);
    if (deg < 0) return [p];
    const k = c === 'sev' ? 4 : 3, out = [];
    for (let i = 0; i < k; i++) { const d = deg + i * 2; out.push(p - rel + sc[d % sc.length] + 12 * Math.floor(d / sc.length)); }
    return out;
  }

  PR.open = function (track, clip) {
    ui.lowerKind = 'piano:' + clip.id;
    ui.openLower('Piyano Rulosu › ' + track.name + ' › ' + (clip.name || 'Klip'), c => build(c, track, clip));
  };

  function build(root, track, clip) {
    const drumMap = track.instrument && track.instrument.def.drumMap;
    const sel = new Set();
    const wrap = el('div', { class: 'pr' });
    const gridSel = el('select', { onchange: () => { PR.grid = +gridSel.value; draw(); } },
      [['1', '1/4'], ['0.5', '1/8'], ['0.25', '1/16'], ['0.125', '1/32'], ['0.3333333', '1/8T'], ['0.1666667', '1/16T']].map(([v, l]) => el('option', { value: v, selected: Math.abs(+v - PR.grid) < 1e-4 }, l)));
    const lenInp = el('input', { class: 'inp', type: 'number', min: 1, step: 1, value: clip.length, style: 'width:60px', onchange: () => { OS.history.push(); clip.length = Math.max(0.25, +lenInp.value); resize(); ui.changed(); } });
    const tb = el('div', { class: 'toolbar' },
      el('label', null, 'Izgara', gridSel),
      el('label', null, 'Klip uzunluğu (vuruş)', lenInp),
      el('button', { class: 'btn sm', title: 'Kuantize (Q)', onclick: () => quantize() }, 'Kuantize'),
      el('button', { class: 'btn sm', onclick: () => transpose(12) }, '+Oktav'),
      el('button', { class: 'btn sm', onclick: () => transpose(-12) }, '−Oktav'),
      el('button', { class: 'btn sm', onclick: () => humanize() }, 'İnsansı yap'),
      el('button', { class: 'btn sm', onclick: () => legato() }, 'Legato'),
      el('label', null, 'Ölçek', el('select', { onchange: e => { PR.root = +e.target.value; draw(); } }, U.NOTE_NAMES.map((n, i) => el('option', { value: i, selected: i === PR.root }, n))),
        el('select', { onchange: e => { PR.scale = e.target.value; draw(); } }, Object.keys(SCALES).map(k => el('option', { value: k, selected: k === PR.scale }, k)))),
      el('button', { class: 'btn sm' + (PR.lock ? ' on' : ''), title: 'Yeni notaları ölçeğe oturt', onclick: e => { PR.lock = !PR.lock; e.target.classList.toggle('on', PR.lock); } }, 'Ölçeğe kilitle'),
      el('label', null, 'Akor damgası', el('select', { onchange: e => { PR.chord = e.target.value; } }, Object.keys(CHORDS).map(k => el('option', { value: k, selected: k === PR.chord }, k)))),
      el('button', { class: 'btn sm', onclick: e => U.menu(e.clientX, e.clientY, [['Yukarı', 'up'], ['Aşağı', 'down'], ['Yukarı-Aşağı', 'updown'], ['Rastgele', 'rand']].map(([l, m]) => ({ label: 'Arpej: ' + l, onclick: () => arpeggiate(m) }))) }, 'Arpej ▾'),
      el('button', { class: 'btn sm', onclick: () => strum() }, 'Strum'),
      el('button', { class: 'btn sm', onclick: () => chop() }, 'Böl (ızgara)'),
      el('label', null, 'Yatay', el('input', { type: 'range', min: 20, max: 300, value: PR.pxb, oninput: e => { PR.pxb = +e.target.value; resize(); } })),
      el('span', { class: 'muted', style: 'font-size:11px' }, 'Sol tık: nota ekle/taşı • Kenar: uzat • Sağ tık: sil • Ctrl: çoklu seçim • Ok tuşları: taşı'),
    );
    const keys = el('canvas'), keysBox = el('div', { class: 'pr-keys' }, keys);
    const cv = el('canvas', { tabindex: 0 }), gridBox = el('div', { class: 'pr-grid' }, cv);
    const vel = el('canvas');
    wrap.append(tb, el('div', { class: 'pr-main' }, keysBox, gridBox), el('div', { class: 'pr-vel' }, el('div', { class: 'pad' }, 'Velocity'), vel));
    root.appendChild(wrap);

    const H = 128 * PR.rowH;
    const W = () => Math.max(gridBox.clientWidth, (clip.length + 4) * PR.pxb);
    function resize() { cv.width = W(); cv.height = H; keys.width = 70; keys.height = H; drawKeys(); draw(); }
    gridBox.addEventListener('scroll', () => { keysBox.scrollTop = gridBox.scrollTop; drawVel(); });
    keysBox.addEventListener('wheel', e => { gridBox.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });

    const yOf = p => (127 - p) * PR.rowH, pOf = y => 127 - Math.floor(y / PR.rowH);
    const snapB = (b, f) => f ? b : Math.round(b / PR.grid) * PR.grid;
    const floorB = b => Math.floor(b / PR.grid + 1e-6) * PR.grid;

    function drawKeys() {
      const g = keys.getContext('2d');
      for (let p = 0; p < 128; p++) {
        const y = yOf(p), black = [1, 3, 6, 8, 10].includes(p % 12);
        g.fillStyle = black ? '#1b1d22' : '#d9dce2'; g.fillRect(0, y, 70, PR.rowH);
        g.fillStyle = '#0006'; g.fillRect(0, y + PR.rowH - 1, 70, 1);
        g.fillStyle = black ? '#aaa' : '#333'; g.font = '10px Segoe UI';
        if (drumMap) { g.fillStyle = drumMap[p] ? (black ? '#fff' : '#000') : (black ? '#666' : '#999'); g.fillText(OS.t(drumMap[p] || U.noteName(p)), 3, y + PR.rowH - 3); }
        else if (p % 12 === 0) g.fillText(U.noteName(p), 40, y + PR.rowH - 3);
      }
    }
    function draw() {
      const g = cv.getContext('2d'), w = cv.width;
      g.fillStyle = '#1a1c21'; g.fillRect(0, 0, w, H);
      for (let p = 0; p < 128; p++) {
        if ([1, 3, 6, 8, 10].includes(p % 12)) { g.fillStyle = '#15171b'; g.fillRect(0, yOf(p), w, PR.rowH); }
        if (PR.scale !== 'Kromatik') { if (!inScale(p)) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, yOf(p), w, PR.rowH); } else if (((p - PR.root) % 12 + 12) % 12 === 0) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, yOf(p), w, PR.rowH); } }
        if (drumMap && drumMap[p]) { g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, yOf(p), w, PR.rowH); }
        g.fillStyle = p % 12 === 0 ? '#2c313b' : '#202329'; g.fillRect(0, yOf(p) + PR.rowH - 1, w, 1);
      }
      const bpb = OS.project.sig[0];
      for (let b = 0; b * PR.pxb < w; b += PR.grid) {
        const x = Math.round(b * PR.pxb) + 0.5;
        g.fillStyle = Math.abs(b % bpb) < 1e-6 ? '#4a5160' : Math.abs(b % 1) < 1e-6 ? '#333844' : '#24272e';
        g.fillRect(x, 0, 1, H);
      }
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(clip.length * PR.pxb, 0, w, H);
      clip.notes.forEach(n => {
        const x = n.s * PR.pxb, y = yOf(n.p), nw = Math.max(3, n.l * PR.pxb - 1);
        const a = 0.45 + n.v / 127 * 0.55;
        g.fillStyle = sel.has(n) ? `rgba(255,214,102,${a})` : track.color;
        g.globalAlpha = sel.has(n) ? 1 : a;
        g.fillRect(x, y + 1, nw, PR.rowH - 2);
        g.globalAlpha = 1;
        g.strokeStyle = '#000a'; g.strokeRect(x + 0.5, y + 1.5, nw - 1, PR.rowH - 3);
        if (nw > 26 && PR.rowH >= 12) { g.fillStyle = '#000c'; g.font = '9px Segoe UI'; g.fillText(U.noteName(n.p), x + 3, y + PR.rowH - 4); }
      });
      drawVel();
    }
    function drawVel() {
      const w = vel.width = vel.clientWidth, h = vel.height = vel.clientHeight, g = vel.getContext('2d');
      g.fillStyle = '#121418'; g.fillRect(0, 0, w, h);
      const sl = gridBox.scrollLeft;
      clip.notes.forEach(n => {
        const x = n.s * PR.pxb - sl, bh = n.v / 127 * (h - 4);
        g.fillStyle = sel.has(n) ? '#ffd666' : track.color;
        g.fillRect(x, h - bh, 4, bh); g.fillRect(x, h - bh, Math.max(4, n.l * PR.pxb * 0.6), 2);
      });
    }
    function phLoop() {
      if (!cv.isConnected) return;
      drawPH(); requestAnimationFrame(phLoop);
    }
    let lastPH = -1;
    function drawPH() {
      const b = T.position() - clip.start;
      if (!T.playing && lastPH === b) return;
      draw(); lastPH = b;
      if (b >= 0 && b <= clip.length) { const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(b * PR.pxb, 0, 1, H); }
    }
    const audition = (p, v) => { if (!track.instrument) return; OS.engine.resume(); const now = OS.engine.ctx.currentTime; track.instrument.noteOn(p, v || 100, now); track.instrument.noteOff(p, now + 0.25); };

    const hit = (x, y) => {
      const b = x / PR.pxb, p = pOf(y);
      for (let i = clip.notes.length - 1; i >= 0; i--) { const n = clip.notes[i]; if (n.p === p && b >= n.s && b <= n.s + n.l) return { n, edge: (n.s + n.l) * PR.pxb - x < 6 }; }
      return null;
    };
    cv.addEventListener('mousemove', e => { const h = hit(e.offsetX, e.offsetY); cv.style.cursor = h ? (h.edge ? 'ew-resize' : 'move') : 'crosshair'; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => {
      cv.focus();
      const x = e.offsetX, y = e.offsetY, h = hit(x, y);
      if (e.button === 2) { if (h) { OS.history.push(); clip.notes.splice(clip.notes.indexOf(h.n), 1); sel.delete(h.n); draw(); ui.changed(); } return; }
      if (e.button !== 0) return;
      OS.history.push();
      if (!h) {
        if (e.shiftKey) { rectSelect(e); return; }
        const root = snapScale(pOf(y)), s0 = floorB(x / PR.pxb);
        const made = (drumMap ? [root] : chordNotes(root)).filter(p => p >= 0 && p <= 127).map(p => ({ p, s: s0, l: PR.grid, v: PR.lastVel || 100 }));
        if (s0 >= clip.length) { clip.length = Math.ceil((s0 + 1) / OS.project.sig[0]) * OS.project.sig[0]; lenInp.value = clip.length; }
        sel.clear(); made.forEach(n => { clip.notes.push(n); sel.add(n); audition(n.p, n.v); });
        U.drag(e, dx => { const l = Math.max(PR.grid, snapB(s0 + PR.grid + dx / PR.pxb) - s0); made.forEach(n => n.l = l); draw(); }, () => { PR.lastLen = made[0].l; ui.changed(); });
        draw(); return;
      }
      if (e.ctrlKey) { sel.has(h.n) ? sel.delete(h.n) : sel.add(h.n); draw(); return; }
      if (!sel.has(h.n)) { sel.clear(); sel.add(h.n); }
      audition(h.n.p, h.n.v);
      const orig = [...sel].map(n => ({ n, s: n.s, p: n.p, l: n.l }));
      let lastP = h.n.p;
      U.drag(e, (dx, dy, ev) => {
        if (h.edge) { orig.forEach(o => { o.n.l = Math.max(0.03, snapB(o.s + o.l + dx / PR.pxb, ev.shiftKey) - o.s); }); }
        else {
          const ds = snapB(dx / PR.pxb, ev.shiftKey), dp = -Math.round(dy / PR.rowH);
          orig.forEach(o => { o.n.s = Math.max(0, o.s + ds); o.n.p = U.clamp(o.p + dp, 0, 127); });
          if (h.n.p !== lastP) { lastP = h.n.p; audition(h.n.p, h.n.v); }
        }
        draw();
      }, () => ui.changed());
      draw();
    });
    function rectSelect(e) {
      const r = cv.getBoundingClientRect(), x0 = e.clientX - r.left, y0 = e.clientY - r.top;
      U.drag(e, (dx, dy) => {
        const x1 = x0 + dx, y1 = y0 + dy, bx0 = Math.min(x0, x1) / PR.pxb, bx1 = Math.max(x0, x1) / PR.pxb, p0 = pOf(Math.max(y0, y1)), p1 = pOf(Math.min(y0, y1));
        sel.clear(); clip.notes.forEach(n => { if (n.p >= p0 && n.p <= p1 && n.s + n.l >= bx0 && n.s <= bx1) sel.add(n); });
        draw(); const g = cv.getContext('2d'); g.strokeStyle = '#fff'; g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(dx), Math.abs(dy));
      }, () => draw());
    }
    vel.addEventListener('mousedown', e => {
      OS.history.push();
      const setAt = ev => {
        const r = vel.getBoundingClientRect(), x = ev.clientX - r.left + gridBox.scrollLeft, v = U.clamp(Math.round((1 - (ev.clientY - r.top) / r.height) * 127), 1, 127);
        const targets = sel.size ? [...sel].filter(n => Math.abs(n.s * PR.pxb - x) < 8) : clip.notes.filter(n => Math.abs(n.s * PR.pxb - x) < 6);
        (targets.length ? targets : clip.notes.filter(n => Math.abs(n.s * PR.pxb - x) < 6)).forEach(n => n.v = v);
        PR.lastVel = v; draw();
      };
      setAt(e); U.drag(e, (dx, dy, ev) => setAt(ev), () => ui.changed());
    });
    cv.addEventListener('keydown', e => {
      const list = sel.size ? [...sel] : [];
      if (e.key === 'Delete' || e.key === 'Backspace') { if (!list.length) return; OS.history.push(); clip.notes = clip.notes.filter(n => !sel.has(n)); sel.clear(); draw(); ui.changed(); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'a' && e.ctrlKey) { clip.notes.forEach(n => sel.add(n)); draw(); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === 'q' || e.key === 'Q') { quantize(); e.stopPropagation(); }
      else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && list.length) {
        OS.history.push();
        list.forEach(n => {
          if (e.key === 'ArrowUp') n.p = Math.min(127, n.p + (e.shiftKey ? 12 : 1));
          if (e.key === 'ArrowDown') n.p = Math.max(0, n.p - (e.shiftKey ? 12 : 1));
          if (e.key === 'ArrowLeft') n.s = Math.max(0, n.s - PR.grid);
          if (e.key === 'ArrowRight') n.s += PR.grid;
        });
        draw(); ui.changed(); e.preventDefault(); e.stopPropagation();
      } else if ((e.key === 'd' || e.key === 'D') && e.ctrlKey && list.length) {
        OS.history.push();
        const mn = Math.min(...list.map(n => n.s)), mx = Math.max(...list.map(n => n.s + n.l)), off = Math.ceil((mx - mn) / PR.grid) * PR.grid;
        sel.clear(); list.forEach(n => { const c = Object.assign({}, n, { s: n.s + off }); clip.notes.push(c); sel.add(c); });
        draw(); ui.changed(); e.preventDefault(); e.stopPropagation();
      }
    });
    function targetNotes() { return sel.size ? [...sel] : clip.notes; }
    function quantize() { OS.history.push(); targetNotes().forEach(n => n.s = Math.round(n.s / PR.grid) * PR.grid); draw(); ui.changed(); U.toast('Kuantize edildi'); }
    function transpose(d) { OS.history.push(); targetNotes().forEach(n => n.p = U.clamp(n.p + d, 0, 127)); draw(); ui.changed(); }
    function humanize() { OS.history.push(); targetNotes().forEach(n => { n.s = Math.max(0, n.s + (Math.random() - 0.5) * 0.03); n.v = U.clamp(Math.round(n.v + (Math.random() - 0.5) * 20), 1, 127); }); draw(); ui.changed(); }
    // Aynı anda başlayan notaları akor sayıp ızgara adımlarına dağıtır
    function chords() {
      const m = new Map();
      targetNotes().forEach(n => { const k = Math.round(n.s * 1000); if (!m.has(k)) m.set(k, []); m.get(k).push(n); });
      return [...m.values()].filter(c => c.length > 1);
    }
    function arpeggiate(mode) {
      const cs = chords(); if (!cs.length) { U.toast('Arpej için akor (aynı anda başlayan notalar) seçin'); return; }
      OS.history.push();
      sel.clear();
      cs.forEach(c => {
        let ord = c.slice().sort((a, b) => a.p - b.p);
        if (mode === 'down') ord.reverse();
        if (mode === 'updown') ord = ord.concat(ord.slice(1, -1).reverse());
        const s0 = c[0].s, len = Math.max(...c.map(n => n.l)), cnt = Math.max(1, Math.round(len / PR.grid));
        c.forEach(n => clip.notes.splice(clip.notes.indexOf(n), 1));
        for (let i = 0; i < cnt; i++) {
          const src = mode === 'rand' ? ord[Math.floor(Math.random() * ord.length)] : ord[i % ord.length];
          const n = { p: src.p, s: s0 + i * PR.grid, l: PR.grid * 0.95, v: src.v };
          clip.notes.push(n); sel.add(n);
        }
      });
      draw(); ui.changed();
    }
    function strum() {
      const cs = chords(); if (!cs.length) { U.toast('Strum için akor seçin'); return; }
      OS.history.push();
      cs.forEach(c => c.sort((a, b) => a.p - b.p).forEach((n, i) => { n.s += i * 0.03; n.l = Math.max(0.03, n.l - i * 0.03); }));
      draw(); ui.changed();
    }
    function chop() {
      OS.history.push();
      const src = targetNotes().slice(); sel.clear();
      src.forEach(n => {
        const k = Math.round(n.l / PR.grid); if (k < 2) return;
        clip.notes.splice(clip.notes.indexOf(n), 1);
        for (let i = 0; i < k; i++) { const m = Object.assign({}, n, { s: n.s + i * PR.grid, l: PR.grid * 0.95 }); clip.notes.push(m); sel.add(m); }
      });
      draw(); ui.changed();
    }
    function legato() {
      OS.history.push();
      const ns = targetNotes().slice().sort((a, b) => a.s - b.s);
      ns.forEach((n, i) => { const nx = ns.find((m, k) => k > i && m.s > n.s + 1e-3); if (nx) n.l = nx.s - n.s; });
      draw(); ui.changed();
    }

    resize(); drawKeys();
    // ilk konum: notaların ortası veya C4
    const mid = clip.notes.length ? clip.notes.reduce((a, n) => a + n.p, 0) / clip.notes.length : (drumMap ? 42 : 60);
    requestAnimationFrame(() => { gridBox.scrollTop = yOf(mid) - gridBox.clientHeight / 2; keysBox.scrollTop = gridBox.scrollTop; resize(); });
    requestAnimationFrame(phLoop);
    const onRes = () => resize();
    addEventListener('resize', onRes);
    return () => removeEventListener('resize', onRes);
  }
})(window.OS);
