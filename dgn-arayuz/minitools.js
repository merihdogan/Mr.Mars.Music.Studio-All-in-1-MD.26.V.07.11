/* Mr. Mars Music Studio · MRH DGN — Mini Araçlar: XY synth pedi, XY efekt pedi, MIDI araçları, looper, pad controller */
(function (OS) {
  const U = OS.U, el = U.el, ui = OS.ui, E = OS.engine, T = OS.transport;
  const MT = ui.miniTools = {};
  let root;

  MT.init = function () { root = document.getElementById('view-mini'); };

  const target = () => E.liveTarget();
  function box(title, ...kids) { return el('div', { class: 'mini-box' }, el('div', { class: 'mini-title' }, title), ...kids); }
  function sel(options, value, on) { const s = el('select', { onchange: () => on(s.value) }, options.map(o => Array.isArray(o) ? el('option', { value: o[0], selected: String(o[0]) === String(value) }, o[1]) : el('option', { value: o, selected: String(o) === String(value) }, o))); return s; }
  function tog(label, on, fn, title) { const b = el('button', { class: 'btn sm' + (on ? ' on' : ''), title: title || '', onclick: () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); fn(v); } }, label); return b; }

  MT.render = function () {
    root.innerHTML = '';
    root.append(el('div', { class: 'mini-grid' }, xySynth(), xyFx(), midiToolsBox(), looperBox(), padsBox()));
  };

  // ---------------- XY Synth Pedi (dokun-çal, ölçeğe kilitli) ----------------
  const XS = MT.xs = Object.assign({ root: 0, scale: 'Minör Pentatonik', octs: 2, base: 3, yParam: 'cut' }, (() => { try { return JSON.parse(localStorage.getItem('os.xysynth') || '{}'); } catch (e) { return {}; } })());
  const saveXS = () => { try { localStorage.setItem('os.xysynth', JSON.stringify(XS)); } catch (e) { } };
  function scaleNotes() {
    const sc = OS.SCALES[XS.scale] || OS.SCALES['Majör'], out = [];
    for (let o = 0; o < XS.octs; o++) sc.forEach(i => out.push((XS.base + 1 + o) * 12 + XS.root + i));
    out.push((XS.base + 1 + XS.octs) * 12 + XS.root);
    return out;
  }
  function xySynth() {
    const t = target();
    const tName = el('b', null, t ? t.name : '—');
    const yOpts = () => { const tt = target(); return tt && tt.instrument ? tt.instrument.def.params.filter(p => p.type !== 'choice' && p.type !== 'bool').map(p => [p.id, p.name]) : []; };
    const ySel = sel(yOpts(), XS.yParam, v => { XS.yParam = v; saveXS(); });
    const cv = el('canvas', { class: 'xy-pad', style: { height: '280px' } });
    let cur = null, pos = null;
    function draw() {
      if (!cv.isConnected) return;
      const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight, g = cv.getContext('2d'), ns = scaleNotes();
      const grd = g.createLinearGradient(0, h, w, 0); grd.addColorStop(0, '#2b1630'); grd.addColorStop(1, '#13283a');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      const cw = w / ns.length;
      ns.forEach((n, i) => {
        const isRoot = ((n - XS.root) % 12 + 12) % 12 === 0;
        g.fillStyle = cur === n ? 'rgba(255,255,255,.18)' : isRoot ? 'rgba(255,255,255,.06)' : 'transparent'; g.fillRect(i * cw, 0, cw, h);
        g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(i * cw, 0, 1, h);
        g.fillStyle = isRoot ? '#ffd98a' : 'rgba(255,255,255,.5)'; g.font = '10px Segoe UI'; g.fillText(U.noteName(n), i * cw + 3, h - 5);
      });
      if (pos) { g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(pos.x * w, (1 - pos.y) * h, 13, 0, 7); g.fill(); }
      requestAnimationFrame(draw);
    }
    function at(e) {
      const r = cv.getBoundingClientRect(), x = U.clamp((e.clientX - r.left) / r.width, 0, 0.9999), y = U.clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
      const ns = scaleNotes(); return { x, y, n: ns[Math.floor(x * ns.length)] };
    }
    function applyY(y) {
      const tt = target(); if (!tt || !tt.instrument) return;
      const p = tt.instrument.def.params.find(q => q.id === XS.yParam); if (!p) return;
      const v = OS.auto.denorm(p, y);
      tt.instrument.setParam(p.id, v); OS.auto.touchDevice(tt.instrument, p.id, v);
    }
    cv.addEventListener('mousedown', e => {
      E.resume();
      const a = at(e); pos = a; cur = a.n; applyY(a.y);
      E.liveNoteOn(cur, 100);
      U.drag(e, (dx, dy, ev) => {
        const b = at(ev); pos = b; applyY(b.y);
        if (b.n !== cur) { E.liveNoteOff(cur); cur = b.n; E.liveNoteOn(cur, 100); }
      }, () => { if (cur != null) E.liveNoteOff(cur); cur = null; pos = null; });
    });
    requestAnimationFrame(draw);
    return box('XY Synth Pedi',
      el('div', { class: 'row' }, 'Çalan parça:', tName,
        el('button', { class: 'btn sm', onclick: () => { const nt = ui.arrange.addTrack('instrument', 'inst.minisynth'); nt.name = 'XY Synth'; OS.history.push(); ui.changed(); MT.render(); } }, '+ Mini Synth parçası')),
      el('div', { class: 'row' },
        el('label', { class: 'field' }, 'Ölçek', sel(U.NOTE_NAMES.map((n, i) => [i, n]), XS.root, v => { XS.root = +v; saveXS(); }), sel(Object.keys(OS.SCALES), XS.scale, v => { XS.scale = v; saveXS(); })),
        el('label', { class: 'field' }, 'Oktav', sel([1, 2, 3, 4].map(i => [i, i]), XS.octs, v => { XS.octs = +v; saveXS(); })),
        el('label', { class: 'field' }, 'Başlangıç', sel([1, 2, 3, 4, 5, 6].map(i => [i, 'C' + i]), XS.base, v => { XS.base = +v; saveXS(); })),
        el('label', { class: 'field' }, 'Y ekseni', ySel),
        tog('Gate Arp', OS.midiTools.s.arp, v => { OS.midiTools.s.arp = v; if (v && OS.midiTools.s.mode === 0) OS.midiTools.s.mode = 6; OS.midiTools.save(); }, 'Basılı tutarken notayı tempoya göre tekrarlar (MIDI araçlarındaki arpej ayarlarını kullanır)')),
      cv,
      el('div', { class: 'muted' }, 'X ekseni ölçeğe kilitli notaları, Y ekseni seçilen parametreyi (ör. filtre) kontrol eder. Seçili enstrüman parçası çalar; kayıtta notalar parçaya yazılır, Y hareketleri otomasyona (W) kaydedilebilir.'));
  }

  // ---------------- XY Efekt Pedi (master çıkışında) ----------------
  function xyFx() {
    const P = OS.project;
    let dev = P.master.inserts.find(d => d.pluginId === 'fx.xypad');
    if (!dev) {
      return box('XY Efekt Pedi', el('div', { class: 'muted' }, 'Canlı performans efektleri: dokunduğunuz sürece filtre, delay, reverb, flanger, bit ezici, perde, gater veya beat repeat uygulanır.'),
        el('button', { class: 'btn primary', onclick: () => { OS.history.push(); P.master.inserts.push(OS.newDevice('fx.xypad')); E.ensureMaster(); MT.render(); } }, 'Master çıkışına ekle'));
    }
    return box('XY Efekt Pedi',
      el('div', { class: 'row' },
        el('label', { class: 'field' }, 'Efekt', sel(OS.XY_MODES.map((m, i) => [i, m]), Math.round(dev.values.mode), v => dev.setParam('mode', +v))),
        tog('Tut (Hold)', dev.values.hold >= 0.5, v => dev.setParam('hold', v ? 1 : 0), 'Parmağınızı kaldırınca efekt açık kalır'),
        el('button', { class: 'btn sm', onclick: () => { OS.history.push(); P.master.inserts.splice(P.master.inserts.indexOf(dev), 1); dev.dispose(); E.ensureMaster(); MT.render(); } }, 'Kaldır')),
      OS.xyPadUI(dev, { height: 280 }),
      el('div', { class: 'muted' }, 'Master çıkışındaki tüm sese uygulanır. Ayrıca “XY Efekt Pedi” herhangi bir parçaya efekt olarak da eklenebilir ve X/Y otomasyonla kaydedilebilir.'));
  }

  // ---------------- MIDI araçları ----------------
  function midiToolsBox() {
    const M = OS.midiTools, s = M.s, set = (k, v) => { s[k] = v; M.save(); if (k === 'rate') M.restartArp(); };
    const knob = (label, k, min, max, fmt) => U.knob({ label, size: 36, min, max, step: 1, def: s[k], value: s[k], fmt, onchange: v => set(k, Math.round(v)) });
    return box('MIDI Araçları (Arpej / Akor / Ölçek)',
      el('div', { class: 'row' },
        knob('Transpoze', 'transpose', -24, 24, v => (v > 0 ? '+' : '') + Math.round(v)),
        tog('Ölçeğe oturt', s.scaleOn, v => set('scaleOn', v)),
        sel(U.NOTE_NAMES.map((n, i) => [i, n]), s.root, v => set('root', +v)),
        sel(Object.keys(OS.SCALES), s.scale, v => set('scale', v)),
        el('label', { class: 'field' }, 'Akor', sel(Object.keys(M.CHORDS), s.chord, v => set('chord', v)))),
      el('div', { class: 'row' },
        tog('ARPEJ', s.arp, v => { set('arp', v); if (!v) M.panic(); }),
        sel(M.MODES.map((m, i) => [i, m]), s.mode, v => set('mode', +v)),
        el('label', { class: 'field' }, 'Hız', sel(Object.keys(M.RATES), s.rate, v => set('rate', v))),
        knob('Oktav', 'oct', 1, 4, v => Math.round(v)),
        U.knob({ label: 'Gate', size: 36, min: 0.05, max: 1, def: 0.6, value: s.gate, fmt: v => Math.round(v * 100) + '%', onchange: v => set('gate', v) }),
        knob('Swing', 'swing', 0, 100, v => Math.round(v) + '%'),
        tog('Latch', s.latch, v => { set('latch', v); if (!v) M.panic(); }, 'Tuşları bıraksanız da arpej devam eder')),
      el('div', { class: 'row' },
        el('label', { class: 'field' }, 'Velocity', sel(['Çalınan', 'Sabit', 'Yumuşak', 'Sert'], s.velMode, v => set('velMode', v))),
        el('button', { class: 'btn sm danger', onclick: () => M.panic() }, 'Panik (tüm notaları sustur)')),
      el('div', { class: 'muted' }, 'Bu araçlar MIDI klavye, bilgisayar klavyesi, ekran piyanosu, XY ped ve pad’lerden gelen tüm notalara uygulanır. Aktarım çalarken arpej tempoya kilitlenir; kayıtta üretilen notalar parçaya yazılır.'));
  }

  // ---------------- Looper (2 kanal, kayıt modları, katman geri alma, sayım) ----------------
  // Mod "REC-OD-PLAY": kayıt → üzerine kayıt → çal; "REC-PLAY-OD": kayıt → çal → üzerine kayıt
  const LP = MT.looper = { bars: 2, src: 'master', countIn: true, tracks: [0, 1].map(i => ({ i, buf: null, state: 'empty', mode: 'rec-od-play', vol: 1, undo: [], redo: [], rec: false, play: false })), pos: 0, len: 0, node: null };
  function ensureLooper() {
    if (LP.node) return;
    const ctx = E.init(), sp = ctx.createScriptProcessor(2048, 2, 2), out = ctx.createGain();
    sp.onaudioprocess = e => {
      const iL = e.inputBuffer.getChannelData(0), iR = e.inputBuffer.getChannelData(1), oL = e.outputBuffer.getChannelData(0), oR = e.outputBuffer.getChannelData(1);
      oL.fill(0); oR.fill(0);
      if (!LP.len) return;
      for (let i = 0; i < iL.length; i++) {
        const p = LP.pos;
        LP.tracks.forEach(t => {
          if (!t.buf) return;
          if (t.play) { oL[i] += t.buf[0][p] * t.vol; oR[i] += t.buf[1][p] * t.vol; }
          if (t.rec) { t.buf[0][p] += iL[i]; t.buf[1][p] += iR[i]; }
        });
        LP.pos = (p + 1) % LP.len;
        // ilk kayıt bir tur dolunca moda göre otomatik geçiş
        if (LP.pos === 0) LP.tracks.forEach(t => { if (t.first) { t.first = false; if (t.mode === 'rec-play-od') { t.rec = false; t.state = 'play'; } else t.state = 'od'; LP.dirty = true; } });
      }
    };
    sp.connect(out); out.connect(ctx.destination);
    LP.node = sp; LP.out = out; LP.tap = ctx.createGain(); LP.tap.connect(sp);
    routeSrc();
    setInterval(() => { if (LP.dirty) { LP.dirty = false; LP.refresh && LP.refresh(); } }, 120);
  }
  function routeSrc() {
    try { E.master && E.master.mute.disconnect(LP.tap); } catch (e) { }
    if (LP.inNode) { try { LP.inNode.disconnect(LP.tap); } catch (e) { } LP.inNode = null; }
    if (LP.src === 'master') { E.ensureMaster(); E.master.mute.connect(LP.tap); }
    else if (E.inputSource) { LP.inNode = E.inputSource; LP.inNode.connect(LP.tap); }
  }
  const snapshot = t => [t.buf[0].slice(), t.buf[1].slice()];
  // Ana düğme: boş → kayıt → (OD | çal) → ... modlar arasında döner
  async function mainBtn(t) {
    ensureLooper(); E.resume();
    if (LP.src === 'input' && !E.inputSource) { try { await E.openInput(OS.settings.inputId); routeSrc(); } catch (er) { U.toast(er.message); return; } }
    if (!LP.len) LP.len = Math.round(LP.bars * OS.project.sig[0] * 60 / T.bpm * E.ctx.sampleRate);
    if (t.state === 'empty') {
      const start = () => { t.buf = [new Float32Array(LP.len), new Float32Array(LP.len)]; if (!LP.tracks.some(x => x !== t && x.buf)) LP.pos = 0; t.rec = true; t.play = true; t.first = true; t.state = 'rec'; t.undo = []; t.redo = []; LP.refresh(); };
      if (LP.countIn && !LP.tracks.some(x => x !== t && x.buf)) countIn(start); else start();
      return;
    }
    t.first = false;
    if (t.state === 'rec' || t.state === 'od') { t.rec = false; t.play = true; t.state = 'play'; }
    else { t.undo.push(snapshot(t)); t.redo = []; if (t.undo.length > 10) t.undo.shift(); t.rec = true; t.play = true; t.state = 'od'; }
    LP.refresh();
  }
  function countIn(then) {
    const spb = 60 / T.bpm, now = E.ctx.currentTime, n = OS.project.sig[0];
    for (let k = 0; k < n; k++) { const o = E.ctx.createOscillator(), g = E.ctx.createGain(); o.frequency.value = k ? 1000 : 1600; o.connect(g); g.connect(E.ctx.destination); g.gain.setValueAtTime(0.4, now + k * spb); g.gain.exponentialRampToValueAtTime(0.0001, now + k * spb + 0.06); o.start(now + k * spb); o.stop(now + k * spb + 0.07); }
    U.toast(OS.t('Sayım…'), n * spb * 1000);
    setTimeout(then, n * spb * 1000);
  }
  function looperBox() {
    const box = el('div', { class: 'mini-box' });
    LP.refresh = () => {
      box.innerHTML = '';
      const any = LP.tracks.some(t => t.buf);
      box.append(el('div', { class: 'mini-title' }, 'Looper (2 kanal)'),
        el('div', { class: 'row' },
          el('label', { class: 'field' }, 'Uzunluk', el('select', { disabled: any, onchange: e => { LP.bars = +e.target.value; LP.len = 0; } }, [[1, '1 ölçü'], [2, '2 ölçü'], [4, '4 ölçü'], [8, '8 ölçü']].map(([v, l]) => el('option', { value: v, selected: v === LP.bars }, l)))),
          el('label', { class: 'field' }, 'Kaynak', el('select', { onchange: e => { LP.src = e.target.value; ensureLooper(); routeSrc(); } }, [['master', 'Master çıkışı'], ['input', 'Ses girişi (mikrofon / gitar)']].map(([v, l]) => el('option', { value: v, selected: v === LP.src }, l)))),
          el('label', { class: 'field' }, el('input', { type: 'checkbox', checked: LP.countIn, onchange: e => LP.countIn = e.target.checked }), 'Sayım (1 ölçü metronom)'),
          el('button', { class: 'btn sm', onclick: () => { LP.tracks.forEach(t => { t.buf = null; t.state = 'empty'; t.rec = t.play = false; t.undo = []; t.redo = []; }); LP.len = 0; LP.refresh(); } }, 'Tümünü temizle'),
          el('button', { class: 'btn sm', onclick: toArrange }, 'Aranjmana aktar')));
      LP.tracks.forEach(t => {
        const lbl = { empty: '● ' + OS.t('Kayıt'), rec: OS.t('Kaydediyor'), od: OS.t('Üzerine kaydediyor'), play: OS.t('Çalıyor'), stop: OS.t('Durdu') }[t.state];
        box.appendChild(el('div', { class: 'row loop-track' },
          el('b', null, OS.t('Kanal') + ' ' + (t.i + 1)),
          el('button', { class: 'btn loop-main ' + t.state, onclick: () => mainBtn(t) }, lbl),
          el('select', { title: OS.t('Kayıt modu'), onchange: e => t.mode = e.target.value }, [['rec-od-play', 'REC → OD → PLAY'], ['rec-play-od', 'REC → PLAY → OD']].map(([v, l]) => el('option', { value: v, selected: v === t.mode }, l))),
          el('button', { class: 'btn sm', disabled: !t.buf, onclick: () => { t.rec = false; t.first = false; if (t.state === 'stop') { t.play = true; t.state = 'play'; } else { t.play = false; t.state = 'stop'; } LP.refresh(); } }, '■ / ▶'),
          el('button', { class: 'btn sm', title: OS.t('Son katmanı geri al'), disabled: !t.undo.length, onclick: () => { t.redo.push(snapshot(t)); t.buf = t.undo.pop(); t.rec = false; t.state = 'play'; LP.refresh(); } }, '↶'),
          el('button', { class: 'btn sm', title: OS.t('Yinele'), disabled: !t.redo.length, onclick: () => { t.undo.push(snapshot(t)); t.buf = t.redo.pop(); LP.refresh(); } }, '↷'),
          U.knob({ label: 'Seviye', size: 30, min: 0, max: 1.5, def: 1, value: t.vol, fmt: v => Math.round(v * 100) + '%', onchange: v => t.vol = v }),
          el('button', { class: 'btn sm', onclick: () => { t.buf = null; t.state = 'empty'; t.rec = t.play = false; if (!LP.tracks.some(x => x.buf)) LP.len = 0; LP.refresh(); } }, 'Temizle')));
      });
      box.appendChild(el('div', { class: 'muted' }, 'Ana düğmeye basınca kayıt başlar; döngü bitince seçtiğiniz moda göre üzerine kayda (OD) ya da çalmaya geçer. ↶ son katmanı geri alır. Uzunluk proje temposuna göre hesaplanır; ikinci kanal ilk kanalla aynı döngüye kilitlenir.'));
    };
    LP.refresh();
    return box;
  }
  function toArrange() {
    const used = LP.tracks.filter(t => t.buf);
    if (!used.length) { U.toast(OS.t('Önce bir döngü kaydedin')); return; }
    OS.history.push();
    const P = OS.project, at = T.position();
    used.forEach(t => {
      const b = E.ctx.createBuffer(2, LP.len, E.ctx.sampleRate); b.copyToChannel(t.buf[0], 0); b.copyToChannel(t.buf[1], 1);
      const id = U.uid(); E.buffers.set(id, b); OS.store.saveBuffer(id, b, 'Looper');
      const tr = OS.makeTrack('audio', 'Looper ' + (t.i + 1)); tr.inputCh = 'stereo';
      P.tracks.splice(P.tracks.filter(x => x.type !== 'fx').length, 0, tr);
      tr.clips.push({ id: U.uid(), start: at, length: T.secToBeat(b.duration), offset: 0, bufferId: id, name: 'Looper ' + (t.i + 1), gain: 0 });
    });
    E.syncAll(); ui.changed(); U.toast(OS.t('Döngü aranjmana eklendi'));
  }

  // ---------------- Pad controller (4x4, note repeat) ----------------
  const PD = MT.pads = { repeat: false, rate: '1/16', base: 36, held: new Map() };
  function padsBox() {
    const t = target(), drum = t && t.instrument && t.instrument.def.drumMap;
    const grid = el('div', { class: 'pad-grid' });
    for (let r = 3; r >= 0; r--) for (let c = 0; c < 4; c++) {
      const i = r * 4 + c, n = PD.base + i;
      const pad = el('div', { class: 'mpad' }, el('span', null, drum ? OS.t(drum[n] || U.noteName(n)) : U.noteName(n)));
      pad.addEventListener('mousedown', e => {
        e.preventDefault(); E.resume();
        const rr = pad.getBoundingClientRect(), v = U.clamp(Math.round(127 - (e.clientY - rr.top) / rr.height * 90), 20, 127);
        pad.classList.add('on');
        if (PD.repeat) startRepeat(n, v); else E.liveNoteOn(n, v);
        const up = () => { pad.classList.remove('on'); removeEventListener('mouseup', up); if (PD.repeat) stopRepeat(n); else E.liveNoteOff(n); };
        addEventListener('mouseup', up);
      });
      grid.appendChild(pad);
    }
    return box('Pad Controller (Note Repeat)',
      el('div', { class: 'row' },
        tog('Note Repeat', PD.repeat, v => PD.repeat = v),
        sel(Object.keys(OS.midiTools.RATES), PD.rate, v => PD.rate = v),
        el('label', { class: 'field' }, 'Başlangıç notası', sel([[24, 'C1'], [36, 'C2 (davul)'], [48, 'C3'], [60, 'C4']], PD.base, v => { PD.base = +v; MT.render(); }))),
      grid,
      el('div', { class: 'muted' }, 'Pad’in üst kısmına basmak daha yüksek velocity verir. Note repeat açıkken basılı tutulan pad tempoya göre tekrar çalar.'));
  }
  function startRepeat(n, v) {
    let next = E.ctx.currentTime + 0.005;
    const tick = () => {
      const d = (OS.midiTools.RATES[PD.rate] || 0.25) * 60 / T.bpm;
      while (next < E.ctx.currentTime + 0.08) { E.playNoteOn(n, v, next); E.playNoteOff(n, next + d * 0.5); next += d; }
    };
    tick(); PD.held.set(n, setInterval(tick, 15));
  }
  function stopRepeat(n) { clearInterval(PD.held.get(n)); PD.held.delete(n); }
})(window.OS);
