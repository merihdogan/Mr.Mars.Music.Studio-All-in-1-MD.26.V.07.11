/* Mr. Mars Music Studio · MRH DGN — mini cihazlar: dijital osilatörlü mini synth ve XY efekt pedi */
(function (OS) {
  const R = OS.plugins.register, U = OS.U;
  const tempo = () => (OS.transport ? OS.transport.bpm : 120);

  // ---------------- Dijital Mini Synth ----------------
  const ENGINES = ['Süper Testere', 'Dalga Tablosu', 'Harmonik (Additive)', 'Telli (Karplus)', 'Formant (Vokal)'];
  const VOWELS = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870]]; // a e i o u
  R({
    id: 'inst.minisynth', name: 'Dijital Mini Synth', type: 'instrument', category: 'Enstrüman',
    params: [
      { id: 'engine', name: 'Motor', type: 'choice', options: ENGINES, min: 0, max: ENGINES.length - 1, def: 0 },
      { id: 'timbre', name: 'Tını', min: 0, max: 1, def: 0.5 },
      { id: 'shape', name: 'Şekil', min: 0, max: 1, def: 0.5 },
      { id: 'cut', name: 'Kesim', min: 60, max: 18000, def: 6000, unit: 'Hz', curve: 'log' },
      { id: 'res', name: 'Rezonans', min: 0.1, max: 18, def: 1, curve: 'log' },
      { id: 'fenv', name: 'Filtre Env', min: 0, max: 1, def: 0.3 },
      { id: 'a', name: 'Atak', min: 0.001, max: 4, def: 0.005, unit: 's', curve: 'log' },
      { id: 'd', name: 'Düşüş', min: 0.01, max: 4, def: 0.4, unit: 's', curve: 'log' },
      { id: 's', name: 'Süreklilik', min: 0, max: 1, def: 0.6 },
      { id: 'r', name: 'Bırakma', min: 0.01, max: 6, def: 0.3, unit: 's', curve: 'log' },
      { id: 'glide', name: 'Glide', min: 0, max: 0.5, def: 0, unit: 's' },
      { id: 'vol', name: 'Ses', min: -40, max: 6, def: -9, unit: 'dB' },
    ],
    presets: {
      'Süper Testere Trance': { engine: 0, timbre: 0.7, shape: 0.6, cut: 7000, fenv: 0.2, a: 0.01, d: 0.6, s: 0.8, r: 0.4 },
      'Dalga Tablosu Pad': { engine: 1, timbre: 0.4, shape: 0.5, cut: 3000, a: 0.6, d: 1.5, s: 0.7, r: 1.8 },
      'Org (Harmonik)': { engine: 2, timbre: 0.3, shape: 0, cut: 9000, a: 0.005, s: 1, r: 0.08 },
      'Klarnet (Harmonik)': { engine: 2, timbre: 0.5, shape: 1, cut: 5000, a: 0.04, s: 0.9, r: 0.15 },
      'Gitar Teli': { engine: 3, timbre: 0.6, shape: 0.6, cut: 12000, a: 0.001, d: 2, s: 0, r: 0.6 },
      'Arp Teli / Kanun': { engine: 3, timbre: 0.85, shape: 0.8, cut: 15000, a: 0.001, d: 3, s: 0, r: 1.5 },
      'Vokal Lead': { engine: 4, timbre: 0.2, shape: 0.6, cut: 8000, a: 0.03, s: 0.9, r: 0.2, glide: 0.05 },
    },
    create(ctx) {
      const out = ctx.createGain(), p = {}, voices = [], tables = [], ksCache = new Map();
      let lastF = 0;
      // dalga tablosu: sinüsten testereye, kareye ve "dijital" spektrumlara uzanan 6 tablo
      for (let k = 0; k < 6; k++) {
        const N = 48, re = new Float32Array(N), im = new Float32Array(N);
        for (let h = 1; h < N; h++) {
          const saw = 1 / h, sq = h % 2 ? 1 / h : 0, dig = (h % 3 === 0 ? 1 : 0.15) / Math.sqrt(h), bell = Math.exp(-((h - 8) ** 2) / 10) / 2;
          const mix = [[1, 0, 0, 0], [0.5, 0.5, 0, 0], [0, 1, 0, 0], [0, 0.4, 0.6, 0], [0, 0, 0.5, 0.5], [0, 0.2, 0, 0.8]][k];
          im[h] = (h === 1 ? mix[0] : 0) + mix[1] * saw + mix[2] * sq + mix[3] * dig + (mix[4] || 0) * bell + (mix[5] || 0);
          if (k === 0 && h > 1) im[h] = 0;
        }
        tables.push(ctx.createPeriodicWave(re, im));
      }
      function karplus(f) {
        const key = Math.round(f * 10) + ':' + p.timbre.toFixed(2) + ':' + p.shape.toFixed(2);
        if (ksCache.has(key)) return ksCache.get(key);
        const sr = ctx.sampleRate, len = Math.floor(sr * (0.6 + p.shape * 3)), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
        const P = sr / f, N = Math.max(2, Math.floor(P)), frac = P - N, line = new Float32Array(N + 2);
        let lp = 0; for (let i = 0; i < N + 2; i++) { const n = Math.random() * 2 - 1; lp += (0.3 + p.timbre * 0.7) * (n - lp); line[i] = lp; }
        const damp = 0.5 + p.timbre * 0.49, decay = 0.990 + p.shape * 0.0098;
        let idx = 0, prev = 0;
        for (let i = 0; i < len; i++) {
          const a = line[idx], b = line[(idx + 1) % (N + 1)];
          const s = a * (1 - frac) + b * frac;
          const y = decay * (damp * s + (1 - damp) * prev); prev = s;
          d[i] = s; line[idx] = y; idx = (idx + 1) % (N + 1);
        }
        if (ksCache.size > 200) ksCache.clear();
        ksCache.set(key, buf); return buf;
      }
      function noteOn(n, vel, t) {
        t = Math.max(t || 0, ctx.currentTime);
        const f = U.midiToFreq(n), v = (vel == null ? 100 : vel) / 127, eng = Math.round(p.engine);
        const filt = ctx.createBiquadFilter(), amp = ctx.createGain(), mixG = ctx.createGain();
        filt.type = 'lowpass'; filt.Q.value = p.res;
        const srcs = [];
        const osc = (type, freq, cents, g, wave) => {
          const o = ctx.createOscillator(), gg = ctx.createGain();
          if (wave) o.setPeriodicWave(wave); else o.type = type;
          o.detune.value = cents || 0; gg.gain.value = g;
          if (p.glide > 0 && lastF) { o.frequency.setValueAtTime(lastF * freq / f, t); o.frequency.exponentialRampToValueAtTime(freq, t + p.glide); } else o.frequency.setValueAtTime(freq, t);
          o.connect(gg); gg.connect(mixG); o.start(t); srcs.push(o); return o;
        };
        if (eng === 0) {
          const spread = 5 + p.timbre * 45;
          [-3, -2, -1, 0, 1, 2, 3].forEach(k => osc('sawtooth', f, k * spread / 3, k === 0 ? 0.35 : 0.35 * p.shape + 0.05));
        } else if (eng === 1) {
          const pos = p.timbre * (tables.length - 1), i0 = Math.floor(pos), fr = pos - i0;
          osc(null, f, 0, 1 - fr, tables[i0]); if (fr > 0) osc(null, f, 0, fr, tables[Math.min(tables.length - 1, i0 + 1)]);
          if (p.shape > 0) osc('sine', f / 2, 0, p.shape * 0.6);
        } else if (eng === 2) {
          const N = 40, re = new Float32Array(N), im = new Float32Array(N), tilt = 0.6 + (1 - p.timbre) * 2;
          for (let h = 1; h < N; h++) im[h] = (h % 2 === 0 ? 1 - p.shape : 1) / Math.pow(h, tilt);
          osc(null, f, 0, 1, ctx.createPeriodicWave(re, im));
        } else if (eng === 3) {
          const s = ctx.createBufferSource(), gg = ctx.createGain(); s.buffer = karplus(f); gg.gain.value = 1.2;
          s.connect(gg); gg.connect(mixG); s.start(t); srcs.push(s);
        } else {
          osc('sawtooth', f, 0, 0.6);
          const vpos = p.timbre * (VOWELS.length - 1), a = VOWELS[Math.floor(vpos)], b = VOWELS[Math.min(VOWELS.length - 1, Math.floor(vpos) + 1)], fr = vpos - Math.floor(vpos);
          const form = ctx.createGain();
          [0, 1].forEach(k => { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6 + p.shape * 10; bp.frequency.value = a[k] * (1 - fr) + b[k] * fr; mixG.connect(bp); bp.connect(form); });
          srcs.vowel = form;
        }
        lastF = f;
        (srcs.vowel || mixG).connect(filt);
        if (srcs.vowel) srcs.vowel.gain.value = 7;
        mixG.gain.value = 0.4; filt.connect(amp); amp.connect(out);
        const base = p.cut, peak = Math.min(20000, base + p.fenv * (18000 - base) * v);
        filt.frequency.setValueAtTime(base, t); filt.frequency.linearRampToValueAtTime(peak, t + Math.max(0.003, p.a)); filt.frequency.setTargetAtTime(base, t + p.a, p.d / 2);
        amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(v, t + p.a); amp.gain.setTargetAtTime(v * p.s, t + p.a, p.d / 3);
        const vc = { n, srcs, amp, released: false, start: t };
        voices.push(vc);
        srcs[0].onended = () => { const i = voices.indexOf(vc); if (i >= 0) voices.splice(i, 1); try { amp.disconnect(); } catch (e) { } };
        if (eng === 3) { const dur = srcs[0].buffer.duration; srcs.forEach(s => s.stop(t + dur)); }
        if (voices.filter(x => !x.released).length > 16) off(voices.find(x => !x.released), t, 0.02);
      }
      function off(vc, t, r) {
        if (!vc || vc.released) return;
        vc.released = true;
        const g = vc.amp.gain;
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
        g.setTargetAtTime(0, t, Math.max(0.005, r / 4));
        vc.srcs.forEach(s => { try { s.stop(t + r * 1.5 + 0.05); } catch (e) { } });
      }
      return {
        output: out,
        set(id, v) { p[id] = v; if (id === 'vol') out.gain.value = U.dbToGain(v); },
        noteOn,
        noteOff(n, t) { t = Math.max(t || 0, ctx.currentTime); off(voices.find(x => x.n === n && !x.released && x.start <= t + 0.001), t, p.r); },
        allOff() { voices.forEach(v => off(v, ctx.currentTime, 0.02)); },
      };
    },
  });

  // ---------------- XY Efekt Pedi ----------------
  const MODES = ['Filtre LP + Rezonans', 'Filtre HP + Rezonans', 'Filtre + Delay', 'Tempo Delay', 'Reverb', 'Flanger', 'Phaser', 'Bit Ezici', 'Perde Kaydırma', 'Gater', 'Beat Repeat (Stutter)'];
  OS.XY_MODES = MODES;
  const SYNC_IDX = [9, 8, 6, 7, 3, 4, 2]; // fx.delay sync seçenekleri: kısa → uzun
  R({
    id: 'fx.xypad', name: 'XY Efekt Pedi', category: 'Performans',
    params: [
      { id: 'mode', name: 'Efekt', type: 'choice', options: MODES, min: 0, max: MODES.length - 1, def: 0 },
      { id: 'x', name: 'X', min: 0, max: 1, def: 0.5 },
      { id: 'y', name: 'Y', min: 0, max: 1, def: 0.5 },
      { id: 'touch', name: 'Dokunma', type: 'bool', min: 0, max: 1, def: 0 },
      { id: 'hold', name: 'Tut (Hold)', type: 'bool', min: 0, max: 1, def: 0 },
    ],
    create(ctx) {
      const input = ctx.createGain(), out = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(), fxIn = ctx.createGain();
      input.connect(dry); dry.connect(out); input.connect(fxIn); wet.connect(out); wet.gain.value = 0;
      const p = { mode: 0, x: 0.5, y: 0.5, touch: 0, hold: 0 };
      let devs = [], stut = null;
      const dev = (id, vals) => { const d = new OS.Device(ctx, id, { values: vals || {} }); devs.push(d); return d; };
      function build() {
        devs.forEach(d => d.dispose()); devs = []; stut = null;
        try { fxIn.disconnect(); } catch (e) { }
        const m = Math.round(p.mode);
        let chain;
        if (m === 0 || m === 1) chain = [dev('fx.filter', { type: m })];
        else if (m === 2) chain = [dev('fx.filter', { type: 0 }), dev('fx.delay', { sync: 6, fb: 0.45 })];
        else if (m === 3) chain = [dev('fx.delay', { mix: 0.5 })];
        else if (m === 4) chain = [dev('fx.reverb', {})];
        else if (m === 5) chain = [dev('fx.flanger', { mix: 0.6 })];
        else if (m === 6) chain = [dev('fx.phaser', { mix: 0.6 })];
        else if (m === 7) chain = [dev('fx.crusher', {})];
        else if (m === 8) chain = [dev('fx.pitch', {})];
        else if (m === 9) chain = [dev('fx.tremolo', { shape: 1 })];
        else {
          // beat repeat: son X vuruşluk parçayı geri beslemeyle döngüye al
          const d = ctx.createDelay(4), fb = ctx.createGain(), gate = ctx.createGain(), o = ctx.createGain();
          fb.gain.value = 0; gate.gain.value = 1;
          fxIn.connect(gate); gate.connect(d); d.connect(fb); fb.connect(d); d.connect(o); o.connect(wet);
          stut = { d, fb, gate, o };
          apply(); return;
        }
        let prev = fxIn; chain.forEach(dd => { prev.connect(dd.in); prev = dd.out; }); prev.connect(wet);
        apply();
      }
      const beats = [1, 0.5, 0.25, 0.125];
      function apply() {
        const m = Math.round(p.mode), x = p.x, y = p.y, d0 = devs[0], d1 = devs[1];
        if (m <= 2) { d0.setParam('freq', m === 1 ? 20 * Math.pow(400, x) : 60 * Math.pow(300, x)); d0.setParam('q', 0.7 + y * (m === 2 ? 8 : 18)); if (d1) d1.setParam('mix', y * 0.6); }
        else if (m === 3) { d0.setParam('sync', SYNC_IDX[Math.min(SYNC_IDX.length - 1, Math.floor(x * SYNC_IDX.length))]); d0.setParam('fb', y * 0.92); }
        else if (m === 4) { d0.setParam('size', 0.4 + x * 7); d0.setParam('mix', 0.2 + y * 0.8); }
        else if (m === 5) { d0.setParam('rate', 0.05 + x * 4); d0.setParam('fb', y * 0.9); }
        else if (m === 6) { d0.setParam('rate', 0.05 + x * 6); d0.setParam('fb', y * 0.85); }
        else if (m === 7) { d0.setParam('bits', Math.round(16 - x * 14)); d0.setParam('tone', 500 * Math.pow(40, y)); }
        else if (m === 8) { d0.setParam('semi', Math.round(x * 24 - 12)); d0.setParam('mix', y); }
        else if (m === 9) { d0.setParam('rate', tempo() / 60 * [1, 2, 4, 8][Math.min(3, Math.floor(x * 4))]); d0.setParam('depth', y); }
        else if (stut) stut.o.gain.value = 0.4 + y * 0.6;
      }
      function engage(on) {
        const t = ctx.currentTime, m = Math.round(p.mode);
        wet.gain.setTargetAtTime(on ? 1 : 0, t, 0.008);
        // filtre ve stutter kuru sesi tamamen değiştirir, diğerleri üstüne eklenir
        const replace = m <= 1 || m === 7 || m === 8 || m === 9 || m === 10;
        dry.gain.setTargetAtTime(on && replace ? 0 : 1, t, 0.008);
        if (stut) {
          const len = beats[Math.min(3, Math.floor(p.x * 4))] * 60 / tempo();
          stut.d.delayTime.setValueAtTime(len, t);
          if (on) { stut.gate.gain.setValueAtTime(1, t); stut.gate.gain.setValueAtTime(0, t + len); stut.fb.gain.setValueAtTime(0, t); stut.fb.gain.setValueAtTime(1, t + len); }
          else { stut.fb.gain.setValueAtTime(0, t); stut.gate.gain.setValueAtTime(1, t); }
        }
      }
      build();
      return {
        input, output: out,
        set(id, v) {
          const was = p.touch >= 0.5 || p.hold >= 0.5;
          p[id] = v;
          if (id === 'mode') { build(); engage(p.touch >= 0.5 || p.hold >= 0.5); return; }
          if (id === 'x' || id === 'y') apply();
          const now = p.touch >= 0.5 || p.hold >= 0.5;
          if (id === 'touch' || id === 'hold') { if (now !== was || (id === 'touch' && v >= 0.5 && stut)) engage(now); }
          if (stut && id === 'x' && now) engage(true);
        },
        dispose() { devs.forEach(d => d.dispose()); },
      };
    },
    ui(container, dev) { container.appendChild(OS.xyPadUI(dev, { height: 200 })); },
  });

  // XY yüzeyi: hem cihaz panelinde hem Mini Araçlar sayfasında kullanılır
  OS.xyPadUI = function (dev, opts) {
    const cv = U.el('canvas', { class: 'xy-pad', style: { height: (opts.height || 260) + 'px' } });
    const trail = [];
    function draw() {
      if (!cv.isConnected) return;
      const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight, g = cv.getContext('2d');
      const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#1b2a3a'); grd.addColorStop(1, '#2b1b3a');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.06)';
      for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 8); g.lineTo(w, i * h / 8); g.stroke(); }
      const t = performance.now();
      while (trail.length && t - trail[0].t > 600) trail.shift();
      trail.forEach(q => { const a = 1 - (t - q.t) / 600; g.fillStyle = `rgba(255,255,255,${a * 0.4})`; g.beginPath(); g.arc(q.x * w, (1 - q.y) * h, 10 * a + 2, 0, 7); g.fill(); });
      const on = dev.values.touch >= 0.5 || dev.values.hold >= 0.5;
      g.fillStyle = on ? '#ff3b30' : 'rgba(255,255,255,.35)';
      g.beginPath(); g.arc(dev.values.x * w, (1 - dev.values.y) * h, on ? 12 : 7, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '12px Segoe UI';
      g.fillText(OS.t(OS.XY_MODES[Math.round(dev.values.mode)] || ''), 10, 18);
      requestAnimationFrame(draw);
    }
    const setXY = e => {
      const r = cv.getBoundingClientRect(), x = U.clamp((e.clientX - r.left) / r.width, 0, 1), y = U.clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
      dev.setParam('x', x); dev.setParam('y', y); OS.auto && OS.auto.touchDevice(dev, 'x', x); OS.auto && OS.auto.touchDevice(dev, 'y', y);
      trail.push({ x, y, t: performance.now() });
    };
    cv.addEventListener('mousedown', e => { OS.engine.resume(); setXY(e); dev.setParam('touch', 1); U.drag(e, (dx, dy, ev) => setXY(ev), () => dev.setParam('touch', 0)); });
    requestAnimationFrame(draw);
    return cv;
  };
})(window.OS);
