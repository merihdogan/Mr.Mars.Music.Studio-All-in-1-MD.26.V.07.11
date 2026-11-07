/* Mr. Mars Music Studio · MRH DGN — Metal Creative cihazları (örneklemsiz sentez)
 *  inst.metalgtr   Metal Gitar DI (7/8 tel): palm mute, aşağı / alternatif / otomatik pena, çift kayıt
 *  inst.metalbass  Metal Bas (5 tel, multiscale karakter): 3 vuruş katmanı, DI / Amfi 1 / Amfi 2 / Temiz
 *  inst.metaldrums Metal Davul Kiti (GM eşlemesi, çift pedal için iki kick, china, stack)
 *  inst.industrial Endüstriyel Yıkım FX: 14 kategori × 6 çeşit + 1 oktav bozuk synth; 6 düğme
 *  fx.dienhance    DI Güçlendirici: Chunk, Alçalt (oktav altı), Yeni Teller, İsveç Testeresi, Çınlama, Ezme
 *  fx.drumpunch    Davul Yumruğu: Punch, Crunch, 3 bant transient (Chunk), Thud, Sizzle, Karışım
 */
(function (OS) {
  const R = OS.plugins.register, U = OS.U;
  const shell = (...a) => OS.fxShell(...a);
  const M = OS.metal = OS.metal || {};

  // ---------------- ortak yardımcılar ----------------
  const rnd = seed => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
  const curveCache = new Map();
  function clipCurve(kind, k) {
    const key = kind + k; if (curveCache.has(key)) return curveCache.get(key);
    const n = 4096, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1) * 2 - 1;
      c[i] = kind === 'abs' ? Math.abs(x) : kind === 'hard' ? Math.max(-1, Math.min(1, x * k))
        : kind === 'clamp' ? Math.max(-0.9, Math.min(3, x * 4)) : Math.tanh(x * k) / Math.tanh(k);
    }
    curveCache.set(key, c); return c;
  }
  M.clipCurve = clipCurve;

  // Yerel (gecikmesiz) transient tasarımcısı: hızlı - yavaş zarf farkı kazancı modüle eder.
  // Gerçek zamanlı ve çevrimdışı render'da aynı çalışır.
  function transient(ctx) {
    const input = ctx.createGain(), vca = ctx.createGain(), abs = ctx.createWaveShaper();
    const fast = ctx.createBiquadFilter(), slow = ctx.createBiquadFilter(), inv = ctx.createGain();
    const aG = ctx.createGain(), sG = ctx.createGain(), sInv = ctx.createGain(), clamp = ctx.createWaveShaper(), ctl = ctx.createGain();
    abs.curve = clipCurve('abs', 1);
    fast.type = 'lowpass'; fast.frequency.value = 180; fast.Q.value = 0.5;
    slow.type = 'lowpass'; slow.frequency.value = 7; slow.Q.value = 0.5;
    inv.gain.value = -1; sInv.gain.value = -1;
    input.connect(abs); abs.connect(fast); abs.connect(slow); slow.connect(inv);
    // fark = hızlı - yavaş (atak anında pozitif, kuyrukta negatif)
    const diff = ctx.createGain(); fast.connect(diff); inv.connect(diff);
    diff.connect(aG); diff.connect(sInv); sInv.connect(sG);
    aG.connect(ctl); sG.connect(ctl);
    clamp.curve = clipCurve('clamp', 1); ctl.gain.value = 0.25; ctl.connect(clamp); // 1/4 ölçek: eğri 4× geri açar
    vca.gain.value = 1; clamp.connect(vca.gain);
    input.connect(vca);
    aG.gain.value = 0; sG.gain.value = 0;
    return {
      input, output: vca,
      set(att, sus) { aG.gain.value = att * 9; sG.gain.value = sus * 5; },
    };
  }
  M.transient = transient;

  // ---------------- tel modeli (Karplus-Strong, örnek tabanlı önbellek) ----------------
  const bufCache = new Map();
  function stringBuf(ctx, f, o) {
    const key = [ctx.sampleRate, f.toFixed(2), o.pm, o.stroke, o.layer, o.rr, o.bright.toFixed(2), o.bass ? 1 : 0, o.pmAmt.toFixed(2)].join('|');
    if (bufCache.has(key)) return bufCache.get(key);
    const sr = ctx.sampleRate, r = rnd(Math.round(f * 100) + o.rr * 7919 + o.stroke * 104729 + o.layer * 1299709);
    const dur = o.pm ? 0.22 + (1 - o.pmAmt) * 0.5 : (o.bass ? 3.2 : 2.6);
    const len = Math.ceil(dur * sr), out = new Float32Array(len);
    const hard0 = [0.55, 0.78, 1][o.layer], bright0 = U.clamp(o.bright * (0.6 + 0.4 * hard0) * (o.stroke ? 0.88 : 1), 0.05, 0.98);
    const damp = o.pm ? 0.18 + bright0 * 0.25 : 0.42 + bright0 * 0.5;
    // döngü gecikmesi = L + (1 - damp) [alçak geçiren] + frac [allpass] = sr / f
    let L = Math.floor(sr / f - (1 - damp)), frac = sr / f - (1 - damp) - L;
    if (frac < 0.1 && L > 2) { L -= 1; frac += 1; }
    const line = new Float32Array(L + 2);
    // uyarım: penanın genişliği ve telin üzerindeki konumu (köprüye yakın = parlak)
    const hard = hard0, bright = bright0;
    const pickPos = (o.bass ? 0.16 : 0.11) + r() * 0.03, pp = Math.max(1, Math.round(pickPos * L));
    let lp = 0;
    const exc = new Float32Array(L);
    for (let i = 0; i < L; i++) { const w = r() * 2 - 1; lp += (w - lp) * (0.15 + bright * 0.85); exc[i] = lp; }
    for (let i = 0; i < L; i++) line[i] = exc[i] - (i >= pp ? exc[i - pp] : 0) * 0.9;
    // kayıp ve parlaklık: palm mute'ta köprü kenarındaki el teli boğar
    let loss = o.pm ? 0.955 + (1 - o.pmAmt) * 0.035 : (o.bass ? 0.9994 : 0.9991);
    let idx = 0, prev = 0, peak = 0;
    // tel uzunluğundaki kesirli kısım için 1. dereceden allpass
    const ap = (1 - frac) / (1 + frac); let apx = 0, apy = 0;
    for (let n = 0; n < len; n++) {
      const cur = line[idx];
      const filt = damp * cur + (1 - damp) * prev; prev = cur;
      const y = ap * (filt - apy) + apx; apx = filt; apy = y;
      line[idx] = y * loss;
      out[n] = cur;
      idx++; if (idx >= L) idx = 0;
      const a = Math.abs(cur); if (a > peak) peak = a;
    }
    // pena tıkı (atak) ve DI manyetiği karakteri: kısa yüksek geçiren gürültü
    const clickN = Math.floor(sr * 0.003);
    for (let n = 0; n < clickN; n++) out[n] += (r() * 2 - 1) * (1 - n / clickN) * 0.25 * hard * peak;
    // basit DC / sub temizliği ve son zarf
    let hp = 0, xm = 0;
    const fade = Math.floor(sr * 0.02);
    for (let n = 0; n < len; n++) { const x = out[n]; hp = 0.996 * (hp + x - xm); xm = x; out[n] = hp; if (n > len - fade) out[n] *= (len - n) / fade; }
    if (o.pm) { const pmEnv = sr * (0.05 + (1 - o.pmAmt) * 0.25); for (let n = 0; n < len; n++) out[n] *= Math.exp(-n / pmEnv) * 0.6 + 0.4 * Math.exp(-n / (pmEnv * 3)); }
    let pk = 0; for (let n = 0; n < len; n++) pk = Math.max(pk, Math.abs(out[n]));
    const norm = pk > 0 ? 0.85 / pk : 1;
    for (let n = 0; n < len; n++) out[n] *= norm;
    const b = ctx.createBuffer(1, len, sr); b.copyToChannel(out, 0);
    if (bufCache.size > 600) bufCache.delete(bufCache.keys().next().value);
    bufCache.set(key, b);
    return b;
  }
  M.stringBuf = stringBuf;

  const PM_MODES = ['Otomatik (vuruş ≤ 100 → palm mute)', 'Hep palm mute', 'Palm mute yok'];
  const PICK_MODES = ['Hep aşağı', 'Alternatif', 'Otomatik'];
  // Telli çalgı sesi: gitar ve bas aynı çekirdeği paylaşır
  function stringInstrument(ctx, bass) {
    const out = ctx.createGain(), bus = ctx.createGain(), noiseB = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const nd = noiseB.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const p = { pm: 0, pmAmt: 0.6, pick: 2, tight: 0.7, dyn: 0.6, noise: 0.4, bright: 0.65, double: 0, spread: 0.6 };
    const voices = []; let lastT = -9, stroke = 0, rrN = 0;
    function play(n, vel, t, pan, offs, rr, det) {
      const v = vel / 127;
      const pm = p.pm === 1 ? 1 : p.pm === 2 ? 0 : (vel <= 100 ? 1 : 0);
      const layer = pm ? (vel < 50 ? 0 : vel < 80 ? 1 : 2) : (vel < 112 ? 1 : 2);
      const f = U.midiToFreq(n) * Math.pow(2, det / 1200);
      const b = stringBuf(ctx, f, { pm, stroke, layer, rr, bright: p.bright, bass, pmAmt: p.pmAmt });
      const s = ctx.createBufferSource(), g = ctx.createGain(), pn = ctx.createStereoPanner();
      s.buffer = b; pn.pan.value = pan;
      const lvl = (1 - p.dyn) * 0.75 + p.dyn * (pm ? 0.35 + v * 0.65 : 0.5 + v * 0.55);
      g.gain.value = lvl * (stroke ? 0.9 : 1);
      s.connect(g); g.connect(pn); pn.connect(bus);
      const st = t + offs; s.start(st);
      const vc = { n, s, g, start: st, pm, released: false };
      voices.push(vc);
      s.onended = () => { const i = voices.indexOf(vc); if (i >= 0) voices.splice(i, 1); };
      return vc;
    }
    function release(vc, t, quick) {
      if (vc.released) return; vc.released = true;
      const rel = quick ? 0.008 : 0.015 + (1 - p.tight) * 0.12;
      vc.g.gain.cancelScheduledValues(t); vc.g.gain.setValueAtTime(vc.g.gain.value, t); vc.g.gain.setTargetAtTime(0, t, rel / 3);
      try { vc.s.stop(t + rel * 2 + 0.02); } catch (e) { }
      // tel bırakma / parmak sesi
      if (!quick && !vc.pm && p.noise > 0.02) {
        const ns = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
        ns.buffer = noiseB; bp.type = 'bandpass'; bp.frequency.value = (bass ? 1500 : 2800) + Math.random() * 1500; bp.Q.value = 2.5;
        ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.06 * p.noise, t + 0.004); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        ns.connect(bp); bp.connect(ng); ng.connect(bus); ns.start(t); ns.stop(t + 0.08);
      }
    }
    return {
      out, bus, p,
      noteOn(n, vel, t) {
        t = Math.max(t || 0, ctx.currentTime); vel = vel == null ? 100 : vel;
        // pena yönü
        if (p.pick === 0) stroke = 0; else if (p.pick === 1) stroke = 1 - stroke; else stroke = (t - lastT < 0.16) ? 1 - stroke : 0;
        // sıkılık: aynı anda başlamayan önceki notaları susturur (tek tel / riff hissi), akorlar korunur
        if (p.tight > 0.3) voices.forEach(vc => { if (!vc.released && t - vc.start > 0.012) release(vc, t, true); });
        voices.filter(vc => vc.n === n && !vc.released).forEach(vc => release(vc, t, true));
        lastT = t; rrN = (rrN + 1) % 3;
        if (p.double) {
          const sp = p.spread;
          play(n, vel, t, -sp, 0, rrN, -2);
          play(n, U.clamp(vel + Math.round((Math.random() - 0.5) * 8), 1, 127), t, sp, 0.006 + Math.random() * 0.01, (rrN + 1) % 3, 2);
        } else play(n, vel, t, 0, 0, rrN, 0);
      },
      noteOff(n, t) { t = Math.max(t || 0, ctx.currentTime); voices.filter(vc => vc.n === n && !vc.released && vc.start <= t + 0.001).forEach(vc => release(vc, t)); },
      allOff() { voices.slice().forEach(vc => release(vc, ctx.currentTime, true)); },
    };
  }

  const strParams = (bass) => [
    { id: 'pm', name: 'Palm Mute', type: 'choice', options: PM_MODES, min: 0, max: 2, def: 0 },
    { id: 'pmAmt', name: 'Palm Mute Sıkılığı', min: 0, max: 1, def: 0.6 },
    { id: 'pick', name: 'Pena', type: 'choice', options: PICK_MODES, min: 0, max: 2, def: 2 },
    { id: 'tight', name: 'Sıkılık', min: 0, max: 1, def: 0.75 },
    { id: 'dyn', name: 'Dinamik', min: 0, max: 1, def: 0.6 },
    { id: 'noise', name: 'Tel Bırakma Sesi', min: 0, max: 1, def: 0.35 },
    { id: 'bright', name: 'Tel Parlaklığı', min: 0.1, max: 1, def: bass ? 0.55 : 0.7 },
    { id: 'double', name: 'Çift Kayıt (L/R)', type: 'bool', min: 0, max: 1, def: 0 },
    { id: 'spread', name: 'Genişlik', min: 0, max: 1, def: 0.85 },
  ];

  R({
    id: 'inst.metalgtr', name: 'Metal Gitar DI (7/8 tel)', type: 'instrument', category: 'Metal Creative',
    description: 'Amfi simülatörüne girecek temiz DI gitar sesi. Vuruş gücü ≤ 100 notalar palm mute, üstü açık çalar.',
    params: strParams(false).concat([
      { id: 'pickup', name: 'Manyetik', type: 'choice', options: ['Pasif humbucker', 'Aktif humbucker', 'Tek bobin'], min: 0, max: 2, def: 1 },
      { id: 'vol', name: 'Ses', min: -40, max: 6, def: -6, unit: 'dB' },
    ]),
    presets: {
      'Modern Ritim (çift kayıt)': { double: 1, tight: 0.85, pick: 2, bright: 0.75, pmAmt: 0.65 },
      'Breakdown Chug': { double: 1, tight: 0.95, pick: 0, pm: 0, pmAmt: 0.8, bright: 0.7 },
      'Djent Sıkı': { double: 1, tight: 1, pick: 1, pmAmt: 0.9, bright: 0.85, pickup: 1 },
      'Nu Metal Gevşek': { double: 1, tight: 0.55, pick: 0, pmAmt: 0.45, bright: 0.5, pickup: 0 },
      'Lead / Solo': { double: 0, tight: 0.4, pick: 1, pm: 2, bright: 0.8 },
    },
    create(ctx) {
      const si = stringInstrument(ctx, false), pu = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter();
      pu.type = 'peaking'; hp.type = 'highpass'; hp.frequency.value = 55;
      si.bus.connect(hp); hp.connect(pu); pu.connect(si.out);
      const pickup = v => { const k = Math.round(v); pu.frequency.value = [2600, 3200, 4200][k]; pu.Q.value = [1.4, 0.9, 1.8][k]; pu.gain.value = [4, 2.5, 6][k]; si.out.gain.value = U.dbToGain(si.p.vol != null ? si.p.vol : -6) * [0.85, 1.15, 0.7][k]; si.p.pu = k; };
      return {
        output: si.out,
        set(id, v) {
          if (id === 'vol') { si.p.vol = v; pickup(si.p.pu != null ? si.p.pu : 1); return; }
          if (id === 'pickup') { pickup(v); return; }
          si.p[id] = ['pm', 'pick', 'double'].includes(id) ? Math.round(v) : v;
        },
        noteOn: si.noteOn, noteOff: si.noteOff, allOff: si.allOff,
      };
    },
  });

  const BASS_TONES = ['DI', 'Amfi 1 (modern agresif)', 'Amfi 2 (klasik grit)', 'Temiz'];
  R({
    id: 'inst.metalbass', name: 'Metal Bas (5 tel)', type: 'instrument', category: 'Metal Creative',
    description: 'Drop G / F / E ve altı için 5 telli metal bas. Yumuşak / orta / sert vuruş katmanları, dört ton.',
    params: strParams(true).concat([
      { id: 'tone', name: 'Ton', type: 'choice', options: BASS_TONES, min: 0, max: 3, def: 1 },
      { id: 'drive', name: 'Amfi Kazancı', min: 0, max: 1, def: 0.6 },
      { id: 'vol', name: 'Ses', min: -40, max: 6, def: -5, unit: 'dB' },
    ]),
    presets: {
      'Modern Metal Bas': { tone: 1, drive: 0.65, tight: 0.85, pick: 2 },
      'Deathcore Sub': { tone: 1, drive: 0.8, tight: 0.95, pick: 0, bright: 0.45 },
      'Klasik Grit': { tone: 2, drive: 0.5, tight: 0.7 },
      'Temiz DI (amfi sim için)': { tone: 0, tight: 0.8 },
    },
    create(ctx) {
      const si = stringInstrument(ctx, true);
      // ton zincirleri
      const pre = ctx.createGain(), post = ctx.createGain();
      si.bus.connect(pre); post.connect(si.out);
      let nodes = [];
      const p = { tone: 1, drive: 0.6 };
      function build() {
        nodes.forEach(n => { try { n.disconnect(); } catch (e) { } }); nodes = []; try { pre.disconnect(); } catch (e) { }
        const k = Math.round(p.tone), mk = (type, f, q, g) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (g != null) b.gain.value = g; nodes.push(b); return b; };
        if (k === 0) { pre.connect(post); return; }
        if (k === 1) { // ikiye bölünmüş bas: temiz alt + bozuk üst (modern metal bas yöntemi)
          const lo = mk('lowpass', 220, 0.7), hi = mk('highpass', 280, 0.7), ws = ctx.createWaveShaper(), g = ctx.createGain(), lp = mk('lowpass', 5200, 0.7), mid = mk('peaking', 1100, 1, 5), hg = ctx.createGain(), comp = ctx.createDynamicsCompressor();
          nodes.push(ws, g, hg, comp); ws.oversample = '2x'; ws.curve = clipCurve('tanh', 2 + p.drive * 10); g.gain.value = 1 + p.drive * 8; hg.gain.value = 0.35;
          comp.threshold.value = -20; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.1;
          pre.connect(lo); lo.connect(comp); comp.connect(post);
          pre.connect(hi); hi.connect(g); g.connect(ws); ws.connect(mid); mid.connect(lp); lp.connect(hg); hg.connect(post);
        } else if (k === 2) {
          const ws = ctx.createWaveShaper(), g = ctx.createGain(), lp = mk('lowpass', 3400, 0.7), ls = mk('lowshelf', 90, null, 3), o = ctx.createGain();
          nodes.push(ws, g, o); ws.oversample = '2x'; ws.curve = clipCurve('tanh', 1.2 + p.drive * 3); g.gain.value = 1 + p.drive * 3; o.gain.value = 0.7;
          pre.connect(g); g.connect(ws); ws.connect(ls); ls.connect(lp); lp.connect(o); o.connect(post);
        } else {
          const comp = ctx.createDynamicsCompressor(), ls = mk('lowshelf', 80, null, 4), md = mk('peaking', 400, 1, -3), hs = mk('highshelf', 3000, null, 2);
          nodes.push(comp); comp.threshold.value = -24; comp.ratio.value = 5; comp.attack.value = 0.005; comp.release.value = 0.12;
          pre.connect(comp); comp.connect(ls); ls.connect(md); md.connect(hs); hs.connect(post);
        }
      }
      build();
      return {
        output: si.out,
        set(id, v) {
          if (id === 'vol') { si.out.gain.value = U.dbToGain(v); return; }
          if (id === 'tone' || id === 'drive') { p[id] = v; build(); return; }
          si.p[id] = ['pm', 'pick', 'double'].includes(id) ? Math.round(v) : v;
        },
        noteOn: si.noteOn, noteOff: si.noteOff, allOff: si.allOff,
      };
    },
  });

  // =====================================================================
  // Metal davul kiti
  // =====================================================================
  const KIT = {
    35: 'Kick 2', 36: 'Kick', 37: 'Yan Çubuk', 38: 'Snare', 39: 'Clap', 40: 'Snare Rimshot', 41: 'Yer Tomu 2', 42: 'Hi-Hat Kapalı', 43: 'Yer Tomu',
    44: 'Hi-Hat Pedal', 45: 'Tom Orta', 46: 'Hi-Hat Açık', 47: 'Tom Orta 2', 48: 'Tom Yüksek', 49: 'Crash', 50: 'Tom Yüksek 2', 51: 'Ride',
    52: 'China', 53: 'Ride Çan', 54: 'Stack', 55: 'Splash', 57: 'Crash 2',
  };
  M.KIT = KIT;
  R({
    id: 'inst.metaldrums', name: 'Metal Davul Kiti', type: 'instrument', category: 'Metal Creative', drumMap: KIT,
    params: [
      { id: 'click', name: 'Kick Tıkı', min: 0, max: 1, def: 0.65 },
      { id: 'ktune', name: 'Kick Akort', min: -12, max: 12, def: 0, unit: 'st' },
      { id: 'stune', name: 'Snare Akort', min: -12, max: 12, def: 0, unit: 'st' },
      { id: 'decay', name: 'Uzunluk', min: 0.4, max: 2, def: 1 },
      { id: 'punch', name: 'Vuruş', min: 0, max: 1, def: 0.5 },
      { id: 'room', name: 'Oda', min: 0, max: 1, def: 0.18 },
      { id: 'vol', name: 'Ses', min: -40, max: 6, def: -4, unit: 'dB' },
    ],
    create(ctx) {
      const out = ctx.createGain(), bus = ctx.createGain(), comp = ctx.createDynamicsCompressor(), ws = ctx.createWaveShaper(), dry = ctx.createGain(), wet = ctx.createGain(), conv = ctx.createConvolver();
      ws.curve = clipCurve('tanh', 1.5); conv.buffer = U.makeReverbIR(ctx, 0.9, 3, 0.5);
      bus.connect(comp); comp.connect(ws); ws.connect(dry); dry.connect(out); ws.connect(conv); conv.connect(wet); wet.connect(out);
      comp.attack.value = 0.008; comp.release.value = 0.09; comp.knee.value = 6;
      const p = { click: 0.65, ktune: 0, stune: 0, decay: 1 };
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const live = [];
      const env = (g, t, pk, dec, att) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + (att || 0.001)); g.gain.exponentialRampToValueAtTime(0.0001, t + dec); };
      const osc = (t, type, f0, f1, sw, dec, pk) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + sw); o.connect(g); g.connect(bus); env(g, t, pk, dec); o.start(t); o.stop(t + dec + 0.05); live.push(o); };
      const noise = (t, dec, type, f, q, pk, att, type2, f2) => { const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = nb; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q || 0.7; s.connect(fl); let last = fl; if (type2) { const f2n = ctx.createBiquadFilter(); f2n.type = type2; f2n.frequency.value = f2; fl.connect(f2n); last = f2n; } last.connect(g); g.connect(bus); env(g, t, pk, dec, att); s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.05); live.push(s); };
      const HAT = [205.3, 304.4, 369.6, 522.7, 540, 800], metalBufs = new Map();
      // 6 kare dalganın toplamı bir kez hesaplanır (2 sn, döngülü); her zil vuruşu tek kaynak kullanır
      const metalBuf = mul => {
        if (metalBufs.has(mul)) return metalBufs.get(mul);
        const sr = ctx.sampleRate, len = sr * 2, b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
        HAT.forEach(f => { const w = 2 * Math.PI * f * mul / sr, ph = Math.random() * 6.28; for (let i = 0; i < len; i++) d[i] += Math.sin(w * i + ph) >= 0 ? 1 : -1; });
        metalBufs.set(mul, b); return b;
      };
      const metal = (t, mul, dec, pk, bp, hp, trash) => {
        const g = ctx.createGain(), b = ctx.createBiquadFilter(), h = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = bp; b.Q.value = 0.8; h.type = 'highpass'; h.frequency.value = hp;
        const s = ctx.createBufferSource(); s.buffer = metalBuf(mul); s.loop = true; s.connect(b); s.start(t, Math.random() * 1.5); s.stop(t + dec + 0.05); live.push(s);
        let last = h; b.connect(h);
        if (trash) { const w = ctx.createWaveShaper(); w.curve = clipCurve('tanh', 4); h.connect(w); last = w; }
        last.connect(g); g.connect(bus); env(g, t, pk * 0.35, dec, 0.002);
      };
      function hit(n, vel, t) {
        const v = (vel == null ? 100 : vel) / 127, d = p.decay, kt = Math.pow(2, p.ktune / 12), st = Math.pow(2, p.stune / 12);
        switch (n) {
          case 35: case 36: {
            const f = (n === 35 ? 52 : 50) * kt;
            osc(t, 'sine', f * 3.6, f, 0.035, 0.32 * d, v);
            osc(t, 'triangle', 1150, 0, 0, 0.012, v * 0.35);
            noise(t, 0.006, 'highpass', 3500, 0.7, v * 0.8 * p.click, 0.0005, 'peaking', 5000);
            break;
          }
          case 37: noise(t, 0.03, 'bandpass', 1800 * st, 3, v * 0.7); osc(t, 'triangle', 520 * st, 0, 0, 0.03, v * 0.4); break;
          case 38: case 40: {
            const rim = n === 40;
            osc(t, 'sine', 245 * st, 185 * st, 0.03, 0.16 * d, v * 0.9);
            osc(t, 'sine', 360 * st, 330 * st, 0.02, 0.09 * d, v * 0.45);
            noise(t, 0.24 * d, 'bandpass', 3800, 0.6, v * 0.75, 0.001, 'highpass', 1600);
            noise(t, 0.012, 'highpass', 5500, 0.7, v * (rim ? 1 : 0.6));
            if (rim) osc(t, 'square', 900 * st, 0, 0, 0.02, v * 0.2);
            break;
          }
          case 39: for (let i = 0; i < 3; i++) noise(t + i * 0.01, 0.025, 'bandpass', 1200, 1.5, v * 0.5); noise(t + 0.03, 0.15 * d, 'bandpass', 1200, 1.2, v * 0.5); break;
          case 41: case 43: case 45: case 47: case 48: case 50: {
            const f = { 41: 72, 43: 84, 45: 105, 47: 122, 48: 145, 50: 170 }[n] * kt;
            osc(t, 'sine', f * 1.6, f, 0.06, 0.55 * d, v * 0.95); osc(t, 'sine', f * 2.4, f * 1.5, 0.05, 0.18 * d, v * 0.25);
            noise(t, 0.03, 'bandpass', 1800, 1, v * 0.35); break;
          }
          case 42: metal(t, 1, 0.055 * d, v * 0.8, 10000, 7500); break;
          case 44: metal(t, 1, 0.035, v * 0.6, 9000, 7000); break;
          case 46: metal(t, 1, 0.45 * d, v * 0.8, 10000, 7000); break;
          case 49: case 57: metal(t, n === 57 ? 1.12 : 1, 1.6 * d, v, 8000, 4500); noise(t, 1.4 * d, 'highpass', 5000, 0.7, v * 0.3); break;
          case 51: metal(t, 1.4, 1.2 * d, v * 0.45, 7000, 5000); osc(t, 'sine', 3100, 0, 0, 0.6 * d, v * 0.06); break;
          case 53: osc(t, 'sine', 1650, 0, 0, 0.9 * d, v * 0.25); osc(t, 'sine', 2480, 0, 0, 0.5 * d, v * 0.12); metal(t, 1.4, 0.4, v * 0.3, 7000, 5000); break;
          case 52: metal(t, 0.82, 1.3 * d, v * 1.1, 4200, 2500, true); noise(t, 0.9 * d, 'bandpass', 3800, 0.9, v * 0.35); break; // china: çöp, bozuk
          case 54: metal(t, 0.9, 0.22 * d, v, 5200, 3000, true); noise(t, 0.18 * d, 'bandpass', 5000, 1, v * 0.4); break; // stack
          case 55: metal(t, 1.25, 0.6 * d, v * 0.8, 9000, 5500); break;
          default: metal(t, 1, 0.3 * d, v * 0.5, 8000, 5000);
        }
        while (live.length > 600) live.shift();
      }
      return {
        output: out,
        set(id, v) {
          p[id] = v;
          if (id === 'vol') out.gain.value = U.dbToGain(v);
          if (id === 'punch') { comp.threshold.value = -6 - v * 22; comp.ratio.value = 2 + v * 6; bus.gain.value = 1 + v * 0.8; }
          if (id === 'room') { wet.gain.value = v * 0.7; dry.gain.value = 1 - v * 0.2; }
        },
        noteOn(n, v, t) { hit(n, v, Math.max(t || 0, ctx.currentTime)); },
        noteOff() { },
        allOff() { live.splice(0).forEach(s => { try { s.stop(); } catch (e) { } }); },
      };
    },
  });

  // =====================================================================
  // Endüstriyel Yıkım FX: 14 kategori × 6 çeşit (C1–B7 arası) + 1 oktav bozuk synth
  // =====================================================================
  const CATS = ['Bozuk Kick', 'Bozuk Snare', 'Örs', 'Braam', 'Pulsar', 'Darbe', 'Uhrevi Çığlık', 'Doku', 'Bozuk Doku', 'Ambiyans', 'Gitar Çığlığı', 'Hırıltı', 'Bozuk Bas Vuruşu', 'Bozuk Synth'];
  const IND_BASE = 24;
  const indMap = {};
  for (let c = 0; c < 13; c++) for (let k = 0; k < 6; k++) indMap[IND_BASE + c * 6 + k] = CATS[c] + ' ' + (k + 1);
  for (let k = 0; k < 12; k++) indMap[IND_BASE + 78 + k] = CATS[13] + ' ' + ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][k];
  M.IND_CATS = CATS; M.IND_BASE = IND_BASE;
  R({
    id: 'inst.industrial', name: 'Endüstriyel Yıkım FX', type: 'instrument', category: 'Metal Creative', drumMap: indMap,
    description: '90 çalınabilir endüstriyel ses: bozuk kick / snare, örs, braam, pulsar, çığlık, doku, hırıltı, bas vuruşu ve bir oktav bozuk synth.',
    params: [
      { id: 'punch', name: 'Vuruş', min: 0, max: 1, def: 0.4 },
      { id: 'sub', name: 'Alt Bas', min: 0, max: 1, def: 0.4 },
      { id: 'width', name: 'Stereo', min: 0, max: 1, def: 0.5 },
      { id: 'space', name: 'Oda', min: 0, max: 1, def: 0.3 },
      { id: 'tone', name: 'Renk', min: -1, max: 1, def: 0 },
      { id: 'destroy', name: 'Parçala', min: 0, max: 1, def: 0.3 },
      { id: 'vol', name: 'Ses', min: -40, max: 6, def: -8, unit: 'dB' },
    ],
    create(ctx) {
      const out = ctx.createGain(), bus = ctx.createGain(), sub = ctx.createBiquadFilter(), lo = ctx.createBiquadFilter(), hi = ctx.createBiquadFilter();
      const drv = ctx.createGain(), ws = ctx.createWaveShaper(), dDry = ctx.createGain(), dWet = ctx.createGain(), mixN = ctx.createGain();
      const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2), hd = ctx.createDelay(0.05), conv = ctx.createConvolver(), sp = ctx.createGain(), dryS = ctx.createGain();
      sub.type = 'lowshelf'; sub.frequency.value = 80; lo.type = 'lowshelf'; lo.frequency.value = 300; hi.type = 'highshelf'; hi.frequency.value = 3000;
      ws.oversample = '2x';
      conv.buffer = U.makeReverbIR(ctx, 3.5, 2.2, 0.35);
      bus.connect(sub); sub.connect(lo); lo.connect(hi);
      hi.connect(dDry); hi.connect(drv); drv.connect(ws); ws.connect(dWet); dDry.connect(mixN); dWet.connect(mixN);
      // genişlik: sağ kanala Haas gecikmesi
      mixN.connect(split); split.connect(merge, 0, 0); split.connect(hd, 0); hd.connect(merge, 0, 1);
      merge.connect(dryS); dryS.connect(out); merge.connect(conv); conv.connect(sp); sp.connect(out);
      const p = { punch: 0.4, sub: 0.4 };
      const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const live = [], held = new Map();
      const track = n => { live.push(n); while (live.length > 800) live.shift(); return n; };
      const gEnv = (t, pk, att, dec, hold) => { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk * (1 + p.punch * 0.8), t + att); g.gain.exponentialRampToValueAtTime(pk, t + att + 0.03 + (1 - p.punch) * 0.05); if (hold == null) g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec); g.connect(bus); return g; };
      const O = (t, type, f, dur, dest, f1, sw) => { const o = track(ctx.createOscillator()); o.type = type; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + sw); if (dest) o.connect(dest); o.start(t); if (dur) o.stop(t + dur + 0.1); return o; };
      const N = (t, dur, dest, type, f, q) => { const s = track(ctx.createBufferSource()), fl = ctx.createBiquadFilter(); s.buffer = nb; s.loop = true; fl.type = type || 'lowpass'; fl.frequency.value = f || 8000; fl.Q.value = q || 0.7; s.connect(fl); fl.connect(dest); s.start(t, Math.random()); if (dur) s.stop(t + dur + 0.1); return fl; };
      const dist = (dest, k) => { const w = ctx.createWaveShaper(); w.curve = clipCurve('tanh', k); w.connect(dest); return w; };
      const subHit = (t, f, dur, v) => { if (p.sub < 0.02) return; const g = gEnv(t, v * p.sub * 0.8, 0.005, dur); O(t, 'sine', f * 2, dur, g, f, 0.08); };
      function play(n, vel, t) {
        const v = (vel == null ? 100 : vel) / 127, i = n - IND_BASE;
        if (i < 0 || i >= 78) return synth(n, v, t); // son oktav: adındaki notada çalan bozuk synth
        const c = Math.floor(i / 6), k = i % 6, r = rnd(n * 977 + 13), varr = 0.8 + k * 0.08;
        switch (c) {
          case 0: { const g = gEnv(t, v, 0.002, 0.5 * varr), d = dist(g, 6 + k * 2); O(t, 'sine', 220 * varr, 0.6, d, 42 * varr, 0.07); N(t, 0.02, d, 'highpass', 3000); subHit(t, 45, 0.6, v); break; }
          case 1: { const g = gEnv(t, v * 0.9, 0.001, 0.35 * varr), d = dist(g, 5 + k * 2); O(t, 'triangle', 240 * varr, 0.2, d, 160, 0.05); N(t, 0.4, d, 'bandpass', 2500 + k * 400, 0.8); break; }
          case 2: { const g = gEnv(t, v * 0.6, 0.001, 2.5 * varr), d = dist(g, 1.5 + k * 0.4); const f = 330 * varr * (1 + r() * 0.2); [1, 2.32, 4.25, 6.63, 9.38].forEach((m, j) => { const gg = ctx.createGain(); gg.gain.value = 1 / (j + 1); gg.connect(d); O(t, 'sine', f * m, 2.6, gg); }); N(t, 0.03, d, 'highpass', 4000); break; }
          case 3: { const g = gEnv(t, v * 0.7, 0.04, 3.2), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4; lp.frequency.setValueAtTime(150, t); lp.frequency.exponentialRampToValueAtTime(2600 + k * 300, t + 0.7); lp.frequency.exponentialRampToValueAtTime(400, t + 3); const d = dist(g, 3 + k); lp.connect(d); const f = [41.2, 43.65, 46.25, 49, 51.9, 55][k]; for (let j = 0; j < 6; j++) O(t, 'sawtooth', f * (j % 2 ? 2 : 1) * (1 + (j - 3) * 0.004), 3.3, lp); subHit(t, f, 3, v); break; }
          case 4: { const g = gEnv(t, v * 0.6, 0.01, 2.2), vca = ctx.createGain(), lfo = O(t, 'square', 8 + k * 2, 2.3, null); const lg = ctx.createGain(); lg.gain.value = 0.5; vca.gain.value = 0.5; lfo.connect(lg); lg.connect(vca.gain); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + k * 300; lp.Q.value = 6; vca.connect(lp); lp.connect(dist(g, 3)); O(t, 'sawtooth', 55 * varr, 2.3, vca); O(t, 'sawtooth', 110.5 * varr, 2.3, vca); break; }
          case 5: { const g = gEnv(t, v * 0.8, 0.001, 0.28 + k * 0.03), d = dist(g, 4); const c2 = O(t, 'square', 110 * varr, 0.4, d, 55 * varr, 0.2); const m = O(t, 'sine', 330 * varr, 0.4, null), mg = ctx.createGain(); mg.gain.setValueAtTime(400, t); mg.gain.exponentialRampToValueAtTime(5, t + 0.25); m.connect(mg); mg.connect(c2.frequency); break; }
          case 6: { const g = gEnv(t, v * 0.5, 0.08, 1.6), fm = [800, 1150, 2900]; const sum = ctx.createGain(); fm.forEach(f => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.setValueAtTime(f * 0.7, t); b.frequency.linearRampToValueAtTime(f * (1.2 + k * 0.05), t + 1.2); b.Q.value = 8; sum.connect(b); b.connect(dist(g, 3)); }); const o = O(t, 'sawtooth', 300 * varr, 1.7, sum, 520 * varr, 1.2); const vib = O(t, 'sine', 7 + k, 1.7, null), vg = ctx.createGain(); vg.gain.value = 25 + k * 8; vib.connect(vg); vg.connect(o.frequency); N(t, 1.6, sum, 'bandpass', 3000, 1); break; }
          case 7: case 8: { const g = gEnv(t, v * 0.5, 0.3, 3.2), d = c === 8 ? dist(g, 6 + k) : g; const b = N(t, 3.4, d, 'bandpass', 600 + k * 500, 6); const l = O(t, 'sine', 0.3 + k * 0.4, 3.4, null), lg = ctx.createGain(); lg.gain.value = 400 + k * 200; l.connect(lg); lg.connect(b.frequency); if (c === 8) { const rm = ctx.createGain(); rm.gain.value = 0; const ro = O(t, 'sine', 90 + k * 40, 3.4, null); ro.connect(rm.gain); N(t, 3.4, rm, 'lowpass', 3000); rm.connect(d); } break; }
          case 9: { const g = gEnv(t, v * 0.35, 1.2, 5), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200 + k * 300; lp.connect(g); const f = [55, 61.7, 65.4, 73.4, 82.4, 87.3][k]; [1, 1.5, 2, 3].forEach((m, j) => O(t, 'triangle', f * m * (1 + (j - 1.5) * 0.003), 5.2, lp)); N(t, 5.2, g, 'bandpass', 5000, 3); break; }
          case 10: { const g = gEnv(t, v * 0.45, 0.005, 1.2), d = dist(g, 10), b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 2400 + k * 300; b.Q.value = 3; b.connect(d); const up = k % 2 === 0; O(t, 'sawtooth', up ? 600 * varr : 2400 * varr, 1.3, b, up ? 2800 * varr : 500 * varr, 0.9); break; }
          case 11: { const g = gEnv(t, v * 0.6, 0.03, 1.5), vca = ctx.createGain(); vca.gain.value = 0.5; const fl = O(t, 'square', 28 + k * 4, 1.6, null), fg = ctx.createGain(); fg.gain.value = 0.5; fl.connect(fg); fg.connect(vca.gain); [[450, 6], [800, 5], [2830, 3]].forEach(([f, q]) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f * (0.8 + k * 0.05); b.Q.value = q; vca.connect(b); b.connect(dist(g, 5)); }); O(t, 'sawtooth', 70 * varr, 1.6, vca, 55 * varr, 1.4); break; }
          case 12: { const g = gEnv(t, v * 0.8, 0.002, 1.8), d = dist(g, 4 + k); O(t, 'sawtooth', 82 * varr, 1.9, d, 30 * varr, 1.5); O(t, 'sine', 160 * varr, 1.9, g, 30 * varr, 0.3); subHit(t, 35 * varr, 1.8, v); break; }
        }
      }
      function synth(n, v, t) {
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v * 0.35, t + 0.008); g.connect(bus);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(1800, t + 0.6); lp.Q.value = 3;
        const d = dist(lp, 4); d.connect(g);
        const f = U.midiToFreq(n >= IND_BASE + 78 && n < IND_BASE + 90 ? 48 + (n - IND_BASE - 78) : n);
        const os = [O(t, 'sawtooth', f, 0, d), O(t, 'square', f * 1.005, 0, d), O(t, 'sawtooth', f / 2, 0, d)];
        const vc = { g, os }; held.set(n, vc);
      }
      return {
        output: out,
        set(id, v) {
          p[id] = v;
          if (id === 'vol') out.gain.value = U.dbToGain(v);
          if (id === 'sub') sub.gain.value = v * 9;
          if (id === 'width') hd.delayTime.value = v * 0.018;
          if (id === 'space') { sp.gain.value = v * 0.8; dryS.gain.value = 1 - v * 0.3; }
          if (id === 'tone') { lo.gain.value = -v * 6; hi.gain.value = v * 8; }
          if (id === 'destroy') { drv.gain.value = 1 + v * 25; ws.curve = clipCurve('tanh', 1 + v * 6); dWet.gain.value = v * 0.8; dDry.gain.value = 1 - v * 0.6; }
        },
        noteOn(n, v, t) { play(n, v, Math.max(t || 0, ctx.currentTime)); },
        noteOff(n, t) {
          const vc = held.get(n); if (!vc) return; held.delete(n); t = Math.max(t || 0, ctx.currentTime);
          vc.g.gain.cancelScheduledValues(t); vc.g.gain.setValueAtTime(vc.g.gain.value, t); vc.g.gain.setTargetAtTime(0, t, 0.08);
          vc.os.forEach(o => { try { o.stop(t + 0.5); } catch (e) { } });
        },
        allOff() { live.splice(0).forEach(s => { try { s.stop(); } catch (e) { } }); held.forEach(vc => vc.os.forEach(o => { try { o.stop(); } catch (e) { } })); held.clear(); },
      };
    },
  });

  // =====================================================================
  // DI Güçlendirici: amfiden ÖNCE kullanılacak 6 yıkıcı işlem
  // =====================================================================
  R({
    id: 'fx.dienhance', name: 'DI Güçlendirici (6 mod)', category: 'Metal Creative',
    description: 'Amfiden önce: Gövde, Derin Oktav, Tel Parlatıcı, Testere Distorsiyonu, Metal Halka ve Sıkıştır aşamaları.',
    params: [
      { id: 'chunk', name: 'Gövde', min: 0, max: 1, def: 0.5 },
      { id: 'low', name: 'Derin Oktav', min: 0, max: 1, def: 0 },
      { id: 'fresh', name: 'Tel Parlatıcı', min: 0, max: 1, def: 0.3 },
      { id: 'saw', name: 'Testere Distorsiyonu', type: 'bool', min: 0, max: 1, def: 0 },
      { id: 'sDrive', name: 'Testere Drive', min: 0, max: 10, def: 7 },
      { id: 'sLevel', name: 'Testere Level', min: 0, max: 10, def: 5 },
      { id: 'sBass', name: 'Testere Bas', min: 0, max: 10, def: 8 },
      { id: 'sMid', name: 'Testere Orta', min: 0, max: 10, def: 8 },
      { id: 'sTreble', name: 'Testere Tiz', min: 0, max: 10, def: 8 },
      { id: 'sMix', name: 'Testere Karışım', min: 0, max: 1, def: 1 },
      { id: 'clang', name: 'Metal Halka (ring mod)', min: 0, max: 1, def: 0 },
      { id: 'cFreq', name: 'Metal Halka Frekansı', min: 20, max: 2000, def: 180, unit: 'Hz', curve: 'log' },
      { id: 'crush', name: 'Sıkıştır (clip)', min: 0, max: 1, def: 0.2 },
      { id: 'out', name: 'Çıkış', min: -24, max: 12, def: 0, unit: 'dB' },
    ],
    presets: {
      'Modern Chug': { chunk: 0.8, fresh: 0.5, crush: 0.3 },
      'Breakdown Duvarı': { chunk: 0.9, low: 0.5, crush: 0.4, fresh: 0.3 },
      'İsveç Death Metal': { saw: 1, sDrive: 10, sBass: 10, sMid: 10, sTreble: 10, chunk: 0.3 },
      'Pasif → Aktif His': { crush: 0.7, fresh: 0.4, chunk: 0.4 },
      'Delirmiş Lead': { clang: 0.45, cFreq: 340, fresh: 0.6 },
      'Eski Teller Kurtarma': { fresh: 1, chunk: 0.4 },
    },
    create(ctx) {
      const input = ctx.createGain(), output = ctx.createGain();
      // 1) Chunk: transient atağı + düşük bant sıkılaştırma + pena / gövde EQ
      const td = transient(ctx), cLow = ctx.createBiquadFilter(), cPick = ctx.createBiquadFilter(), cMud = ctx.createBiquadFilter(), cComp = ctx.createDynamicsCompressor();
      cLow.type = 'peaking'; cLow.frequency.value = 110; cLow.Q.value = 1; cPick.type = 'peaking'; cPick.frequency.value = 2600; cPick.Q.value = 1.2; cMud.type = 'peaking'; cMud.frequency.value = 350; cMud.Q.value = 1.4;
      cComp.attack.value = 0.012; cComp.release.value = 0.06; cComp.knee.value = 4;
      input.connect(td.input); td.output.connect(cMud); cMud.connect(cLow); cLow.connect(cPick); cPick.connect(cComp);
      const s1 = cComp;
      // 2) Alçalt: oktav altı paralel karışım
      const lowSum = ctx.createGain(), ps = OS.makePitchShifter(ctx, 0.05), lowLp = ctx.createBiquadFilter(), lowG = ctx.createGain();
      lowLp.type = 'lowpass'; lowLp.frequency.value = 1100;
      s1.connect(lowSum); s1.connect(ps.input); ps.output.connect(lowLp); lowLp.connect(lowG); lowG.connect(lowSum); ps.setRatio(0.5);
      // 3) Yeni Teller: harmonik heyecanlandırıcı + üst raf
      const fHp = ctx.createBiquadFilter(), fWs = ctx.createWaveShaper(), fHp2 = ctx.createBiquadFilter(), fG = ctx.createGain(), fShelf = ctx.createBiquadFilter(), fSum = ctx.createGain();
      fHp.type = 'highpass'; fHp.frequency.value = 2800; fHp2.type = 'highpass'; fHp2.frequency.value = 3500; fWs.curve = clipCurve('tanh', 3); fShelf.type = 'highshelf'; fShelf.frequency.value = 5000;
      lowSum.connect(fShelf); fShelf.connect(fSum); lowSum.connect(fHp); fHp.connect(fWs); fWs.connect(fHp2); fHp2.connect(fG); fG.connect(fSum);
      // 4) İsveç testeresi (bas, orta, tiz tepe noktaları distorsiyondan sonra; hepsi 10 = testere)
      const sDry = ctx.createGain(), sWet = ctx.createGain(), sIn = ctx.createGain(), sWs = ctx.createWaveShaper(), sB = ctx.createBiquadFilter(), sM = ctx.createBiquadFilter(), sT = ctx.createBiquadFilter(), sLp = ctx.createBiquadFilter(), sHp = ctx.createBiquadFilter(), sLvl = ctx.createGain(), sSum = ctx.createGain();
      sWs.oversample = '2x'; sWs.curve = clipCurve('hard', 1); sHp.type = 'highpass'; sHp.frequency.value = 90;
      sB.type = 'peaking'; sB.frequency.value = 100; sB.Q.value = 1.1; sM.type = 'peaking'; sM.frequency.value = 1000; sM.Q.value = 1.4; sT.type = 'peaking'; sT.frequency.value = 2700; sT.Q.value = 1.6; sLp.type = 'lowpass'; sLp.frequency.value = 7500;
      fSum.connect(sDry); sDry.connect(sSum); fSum.connect(sHp); sHp.connect(sIn); sIn.connect(sWs); sWs.connect(sB); sB.connect(sM); sM.connect(sT); sT.connect(sLp); sLp.connect(sLvl); sLvl.connect(sWet); sWet.connect(sSum);
      // 5) Çınlama: ring modülasyon
      const rVca = ctx.createGain(), rOsc = ctx.createOscillator(), rDry = ctx.createGain(), rWet = ctx.createGain(), rSum = ctx.createGain();
      rVca.gain.value = 0; rOsc.connect(rVca.gain); rOsc.start();
      sSum.connect(rDry); rDry.connect(rSum); sSum.connect(rVca); rVca.connect(rWet); rWet.connect(rSum);
      // 6) Ezme: yumuşak dizli clipper
      const cIn = ctx.createGain(), cWs = ctx.createWaveShaper(), cOut = ctx.createGain();
      cWs.oversample = '2x';
      rSum.connect(cIn); cIn.connect(cWs); cWs.connect(cOut); cOut.connect(output);
      const p = { chunk: 0.5, low: 0, fresh: 0.3, saw: 0, sDrive: 7, sLevel: 5, sBass: 8, sMid: 8, sTreble: 8, sMix: 1, clang: 0, cFreq: 180, crush: 0.2, out: 0 };
      // CPU: kullanılmayan dallar ana yoldan ayrılır; bağlı olmayan düğümler hiç işlenmez
      const links = { low: [lowG, lowSum], fresh: [fG, fSum], saw: [sWet, sSum], clang: [rWet, rSum] }, on = {};
      const gate = (k, want) => { if (!!on[k] === want) return; on[k] = want; const [a, b] = links[k]; if (want) a.connect(b); else try { a.disconnect(b); } catch (e) { } };
      [lowG, fG, sWet, rWet].forEach(n => { try { n.disconnect(); } catch (e) { } });
      function apply() {
        const c = p.chunk;
        td.set(c * 0.9, -c * 0.25); cLow.gain.value = c * 4; cPick.gain.value = c * 4.5; cMud.gain.value = -c * 4;
        cComp.threshold.value = -c * 18; cComp.ratio.value = 1 + c * 4;
        lowG.gain.value = p.low * 1.3;
        fG.gain.value = p.fresh * 0.5; fShelf.gain.value = p.fresh * 5;
        const sawOn = !!Math.round(p.saw);
        sIn.gain.value = 1 + Math.pow(p.sDrive / 10, 2) * 120;
        sB.gain.value = (p.sBass - 5) * 3; sM.gain.value = (p.sMid - 5) * 3; sT.gain.value = (p.sTreble - 5) * 3;
        sLvl.gain.value = U.dbToGain((p.sLevel - 5) * 2 - 14);
        sWet.gain.value = sawOn ? p.sMix : 0; sDry.gain.value = sawOn ? 1 - p.sMix : 1;
        rOsc.frequency.value = p.cFreq; rWet.gain.value = p.clang; rDry.gain.value = 1 - p.clang * 0.7;
        cIn.gain.value = 1 + p.crush * 6; cWs.curve = clipCurve('tanh', 1 + p.crush * 3); cOut.gain.value = U.dbToGain(p.out) / (1 + p.crush * 2.2);
        gate('low', p.low > 0.001); gate('fresh', p.fresh > 0.001); gate('saw', sawOn); gate('clang', p.clang > 0.001);
      }
      apply();
      return { input, output, set(id, v) { p[id] = v; apply(); }, dispose() { try { rOsc.stop(); } catch (e) { } ps.dispose && ps.dispose(); } };
    },
  });

  // =====================================================================
  // Davul Yumruğu: modern metal davul zinciri tek ekranda
  // =====================================================================
  R({
    id: 'fx.drumpunch', name: 'Davul Yumruğu', category: 'Metal Creative',
    description: 'Tek ekranda davul zinciri: kompresör, clipper, 3 bant transient, alt ve üst raf EQ, paralel karışım.',
    params: [
      { id: 'punch', name: 'Vuruş', min: 0, max: 1, def: 0.5 },
      { id: 'crunch', name: 'Kırçıl', min: 0, max: 1, def: 0.25 },
      { id: 'chunk', name: 'Transient', min: 0, max: 1, def: 0.4 },
      { id: 'lowA', name: 'Alçak Atak', min: -1, max: 1, def: 0 },
      { id: 'lowS', name: 'Alçak Kuyruk', min: -1, max: 1, def: 0 },
      { id: 'midA', name: 'Orta Atak', min: -1, max: 1, def: 0 },
      { id: 'midS', name: 'Orta Kuyruk', min: -1, max: 1, def: 0 },
      { id: 'highA', name: 'Tiz Atak', min: -1, max: 1, def: 0 },
      { id: 'highS', name: 'Tiz Kuyruk', min: -1, max: 1, def: 0 },
      { id: 'thud', name: 'Gümbür (100 Hz)', min: 0, max: 12, def: 2, unit: 'dB' },
      { id: 'sizzle', name: 'Parıltı (8 kHz)', min: 0, max: 12, def: 2, unit: 'dB' },
      { id: 'mix', name: 'Karışım', min: 0, max: 1, def: 1 },
      { id: 'out', name: 'Çıkış', min: -24, max: 12, def: 0, unit: 'dB' },
    ],
    presets: {
      'Kick: Tık + Ağırlık': { punch: 0.6, crunch: 0.3, chunk: 0.6, highA: 0.6, thud: 6, sizzle: 3 },
      'Snare: Çatlak': { punch: 0.7, crunch: 0.4, chunk: 0.5, midA: 0.5, sizzle: 4 },
      'Tomlar: Gövde': { punch: 0.5, chunk: 0.4, lowS: 0.4, thud: 4 },
      'Davul Grubu (paralel)': { punch: 0.8, crunch: 0.5, chunk: 0.3, mix: 0.45, thud: 3, sizzle: 3 },
      'Oda Ezici': { punch: 1, crunch: 0.6, lowS: 0.6, midS: 0.6, mix: 0.5 },
    },
    create(ctx) {
      const s = shell(ctx);
      const comp = ctx.createDynamicsCompressor(), mk = ctx.createGain(), cIn = ctx.createGain(), cWs = ctx.createWaveShaper(), cOut = ctx.createGain();
      comp.attack.value = 0.012; comp.release.value = 0.08; comp.knee.value = 6; cWs.oversample = '2x';
      s.input.connect(comp); comp.connect(mk); mk.connect(cIn); cIn.connect(cWs); cWs.connect(cOut);
      // 3 bant transient
      const xo = (type, f) => { const a = ctx.createBiquadFilter(), b = ctx.createBiquadFilter(); a.type = b.type = type; a.frequency.value = b.frequency.value = f; a.Q.value = b.Q.value = 0.707; a.connect(b); return [a, b]; };
      const [l1, l2] = xo('lowpass', 200), [m1, m2] = xo('highpass', 200), [m3, m4] = xo('lowpass', 4000), [h1, h2] = xo('highpass', 4000);
      const tL = transient(ctx), tM = transient(ctx), tH = transient(ctx), sum = ctx.createGain();
      cOut.connect(l1); l2.connect(tL.input); tL.output.connect(sum);
      cOut.connect(m1); m2.connect(m3); m4.connect(tM.input); tM.output.connect(sum);
      cOut.connect(h1); h2.connect(tH.input); tH.output.connect(sum);
      const thud = ctx.createBiquadFilter(), siz = ctx.createBiquadFilter(), o = ctx.createGain();
      thud.type = 'lowshelf'; thud.frequency.value = 100; siz.type = 'highshelf'; siz.frequency.value = 8000;
      sum.connect(thud); thud.connect(siz); siz.connect(o); o.connect(s.wet);
      const p = { punch: 0.5, crunch: 0.25, chunk: 0.4, lowA: 0, lowS: 0, midA: 0, midS: 0, highA: 0, highS: 0, out: 0 };
      function apply() {
        comp.threshold.value = -4 - p.punch * 30; comp.ratio.value = 1.5 + p.punch * 10; mk.gain.value = U.dbToGain(-p.punch * 12) * 0.55; // tarayıcı kompresörünün otomatik makyaj kazancını dengeler
        cIn.gain.value = 1 + p.crunch * 5; cWs.curve = clipCurve('tanh', 1 + p.crunch * 4); cOut.gain.value = 1 / (1 + p.crunch * 2.5);
        tL.set((p.chunk * 0.8 + p.lowA) * 0.5, p.lowS * 0.6); tM.set((p.chunk * 0.8 + p.midA) * 0.5, p.midS * 0.6); tH.set((p.chunk * 0.8 + p.highA) * 0.5, p.highS * 0.6);
        o.gain.value = 0.6 * U.dbToGain(p.out || 0) / (1 + p.chunk * 0.5);
      }
      apply();
      return {
        input: s.input, output: s.output,
        set(id, v) { if (id in p) { p[id] = v; apply(); } if (id === 'thud') thud.gain.value = v; if (id === 'sizzle') siz.gain.value = v; if (id === 'mix') s.mix(v); if (id === 'out') apply(); },
      };
    },
  });
})(window.OS);
