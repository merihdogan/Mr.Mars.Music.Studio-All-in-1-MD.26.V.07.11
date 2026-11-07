/* Mr. Mars Music Studio · MRH DGN — ekran piyanosu, bilgisayar klavyesiyle çalma, Web MIDI girişi */
(function (OS) {
  const U = OS.U, el = U.el, ui = OS.ui, E = OS.engine;
  const K = ui.keys = { octave: 4, vel: 100, qwerty: false, held: new Set(), midiStatus: 'MIDI: kontrol ediliyor…' };
  const MAP = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16 };
  let cv, status, qBtn, lo = 36, hi = 96;
  const pressed = new Set();

  K.init = function () {
    const bar = document.getElementById('keyboard-bar');
    status = el('div', null, K.midiStatus);
    qBtn = el('button', { class: 'btn sm', onclick: () => { K.qwerty = !K.qwerty; qBtn.classList.toggle('on', K.qwerty); U.toast(K.qwerty ? 'Klavye ile çalma açık: A W S E D F T G… (Z/X oktav, C/V velocity)' : 'Klavye ile çalma kapalı'); } }, '⌨ Klavyeyle çal');
    const oct = el('span', null, 'Oktav: C' + K.octave);
    K._oct = oct;
    bar.append(el('div', { class: 'kb-side' }, qBtn, oct, status));
    cv = el('canvas'); bar.appendChild(cv);
    cv.addEventListener('mousedown', e => {
      let cur = noteAt(e);
      if (cur == null) return;
      const v = velAt(e);
      E.liveNoteOn(cur, v);
      U.drag(e, (dx, dy, ev) => { const n = noteAt(ev); if (n != null && n !== cur) { E.liveNoteOff(cur); cur = n; E.liveNoteOn(cur, velAt(ev)); } }, () => E.liveNoteOff(cur));
    });
    document.addEventListener('os-note', e => { e.detail.on ? pressed.add(e.detail.n) : pressed.delete(e.detail.n); draw(); });
    // Touchpad sıkıştırması sayfayı büyütmesin; Ctrl+tekerlek kendi işini yapan yerlerde çalışmaya devam eder
    document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    addEventListener('resize', draw);
    // Yerleşim değişince piyano yeniden çizilir; çizim alanı genişliği düzeni etkilemez
    if (window.ResizeObserver) new ResizeObserver(draw).observe(cv);
    draw();
    initMidi();
  };

  // Beyaz/siyah tuş geometrisi
  function layout() {
    const whites = []; for (let n = lo; n <= hi; n++) if (![1, 3, 6, 8, 10].includes(n % 12)) whites.push(n);
    const w = cv.clientWidth / whites.length;
    return { whites, w };
  }
  function draw() {
    if (!cv) return;
    const H = cv.clientHeight, dpr = window.devicePixelRatio || 1, g = cv.getContext('2d');
    const bw = Math.round(cv.clientWidth * dpr), bh = Math.round(H * dpr);
    if (cv.width !== bw) cv.width = bw;
    if (cv.height !== bh) cv.height = bh;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cv.clientWidth, H);
    const { whites, w } = layout();
    whites.forEach((n, i) => {
      g.fillStyle = pressed.has(n) ? '#ff3b30' : '#3b3b3b'; g.fillRect(i * w, 0, w - 1, H);
      if (n % 12 === 0) { g.fillStyle = '#8a8a8a'; g.font = '9px Segoe UI'; g.fillText('C' + (n / 12 - 1), i * w + 2, H - 4); }
    });
    whites.forEach((n, i) => {
      const b = n + 1;
      if (b <= hi && [1, 3, 6, 8, 10].includes(b % 12)) { g.fillStyle = pressed.has(b) ? '#c9302a' : '#121212'; g.fillRect(i * w + w * 0.65, 0, w * 0.7, H * 0.6); }
    });
    const qlo = (K.octave + 1) * 12;
    if (K.qwerty) { const i0 = whites.indexOf(qlo); if (i0 >= 0) { g.fillStyle = 'rgba(255,59,48,.6)'; g.fillRect(i0 * w, H - 4, w * 10, 4); } }
  }
  function noteAt(e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const { whites, w } = layout();
    const i = Math.floor(x / w); if (i < 0 || i >= whites.length) return null;
    if (y < r.height * 0.6) {
      const fx = x / w - i;
      if (fx > 0.65 && [1, 3, 6, 8, 10].includes((whites[i] + 1) % 12)) return whites[i] + 1;
      if (fx < 0.35 && i > 0 && [1, 3, 6, 8, 10].includes((whites[i] - 1) % 12)) return whites[i] - 1;
    }
    return whites[i];
  }
  function velAt(e) { const r = cv.getBoundingClientRect(); return U.clamp(Math.round(40 + (e.clientY - r.top) / r.height * 87), 1, 127); }

  // Bilgisayar klavyesi: true döndürürse olay tüketildi
  K.keydown = function (e) {
    if (!K.qwerty || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.code === 'KeyZ') { K.octave = Math.max(0, K.octave - 1); K._oct.textContent = 'Oktav: C' + K.octave; draw(); return true; }
    if (e.code === 'KeyX') { K.octave = Math.min(8, K.octave + 1); K._oct.textContent = 'Oktav: C' + K.octave; draw(); return true; }
    if (e.code === 'KeyC') { K.vel = Math.max(10, K.vel - 15); U.toast('Velocity ' + K.vel); return true; }
    if (e.code === 'KeyV') { K.vel = Math.min(127, K.vel + 15); U.toast('Velocity ' + K.vel); return true; }
    if (e.code in MAP) {
      if (!e.repeat && !K.held.has(e.code)) { const n = (K.octave + 1) * 12 + MAP[e.code]; K.held.add(e.code); K.heldNote = K.heldNote || {}; K.heldNote[e.code] = n; E.liveNoteOn(n, K.vel); }
      return true;
    }
    return false;
  };
  K.keyup = function (e) {
    if (K.held.has(e.code)) { K.held.delete(e.code); E.liveNoteOff(K.heldNote[e.code]); return true; }
    return false;
  };

  // ---------------- Web MIDI ----------------
  async function initMidi() {
    if (!navigator.requestMIDIAccess) { status.textContent = 'MIDI: desteklenmiyor'; return; }
    try {
      const acc = await navigator.requestMIDIAccess({ sysex: false });
      OS.midiAccess = acc;
      const bind = () => {
        const ins = [...acc.inputs.values()];
        ins.forEach(i => i.onmidimessage = onMidi);
        status.textContent = ins.length ? 'MIDI: ' + ins.map(i => i.name).join(', ').slice(0, 40) : 'MIDI: cihaz yok';
        status.title = ins.map(i => i.name).join('\n');
      };
      acc.onstatechange = bind; bind();
    } catch (e) { status.textContent = 'MIDI: izin yok'; }
  }
  function onMidi(m) {
    if (OS.midiHooks && OS.midiHooks.some(h => h(m.data))) return;
    const [st, d1, d2] = m.data, cmd = st & 0xf0;
    if (cmd === 0x90 && d2 > 0) E.liveNoteOn(d1, d2);
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) E.liveNoteOff(d1);
    else if (cmd === 0xb0 && d1 === 123) OS.project.tracks.forEach(t => t.instrument && t.instrument.allOff());
  }
})(window.OS);
