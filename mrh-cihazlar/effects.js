/* Mr. Mars Music Studio · MRH DGN — yerleşik efektler */
(function (OS) {
  const R = OS.plugins.register, U = OS.U;

  // Kuru/ıslak karıştırma iskeleti
  function shell(ctx) {
    const input = ctx.createGain(), output = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
    input.connect(dry); dry.connect(output); wet.connect(output);
    return {
      input, output, dry, wet,
      mix(m) { dry.gain.value = Math.cos(m * Math.PI / 2); wet.gain.value = Math.sin(m * Math.PI / 2); },
    };
  }
  function lfo(ctx, type) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.connect(g); o.start();
    return { osc: o, gain: g, stop() { try { o.stop(); } catch (e) { } } };
  }
  OS.fxShell = shell; OS.fxLfo = lfo;
  const tempo = () => (OS.transport ? OS.transport.bpm : 120);

  R({
    id: 'util.gain', name: 'Kazanç / Yardımcı', category: 'Yardımcı',
    params: [
      { id: 'gain', name: 'Kazanç', min: -48, max: 24, def: 0, unit: 'dB' },
      { id: 'pan', name: 'Pan', min: -1, max: 1, def: 0 },
      { id: 'inv', name: 'Faz Ters', type: 'bool', min: 0, max: 1, def: 0 },
    ],
    create(ctx) {
      const g = ctx.createGain(), p = ctx.createStereoPanner(), inv = ctx.createGain();
      g.connect(inv); inv.connect(p);
      let gain = 1, sign = 1;
      return {
        input: g, output: p,
        set(id, v) {
          if (id === 'gain') gain = U.dbToGain(v);
          if (id === 'inv') sign = v >= 0.5 ? -1 : 1;
          if (id === 'pan') p.pan.value = v;
          g.gain.value = gain; inv.gain.value = sign;
        },
      };
    },
  });

  R({
    id: 'fx.eq', name: 'Parametrik EQ', category: 'Dinamik & EQ',
    params: [
      { id: 'hp', name: 'Alçak Kesim', min: 20, max: 1000, def: 20, unit: 'Hz', curve: 'log' },
      { id: 'lsf', name: 'Bas Frek', min: 30, max: 500, def: 100, unit: 'Hz', curve: 'log' },
      { id: 'lsg', name: 'Bas', min: -18, max: 18, def: 0, unit: 'dB' },
      { id: 'p1f', name: 'Orta 1 Frek', min: 100, max: 4000, def: 500, unit: 'Hz', curve: 'log' },
      { id: 'p1g', name: 'Orta 1', min: -18, max: 18, def: 0, unit: 'dB' },
      { id: 'p1q', name: 'Orta 1 Q', min: 0.2, max: 10, def: 1, curve: 'log' },
      { id: 'p2f', name: 'Orta 2 Frek', min: 500, max: 12000, def: 2500, unit: 'Hz', curve: 'log' },
      { id: 'p2g', name: 'Orta 2', min: -18, max: 18, def: 0, unit: 'dB' },
      { id: 'p2q', name: 'Orta 2 Q', min: 0.2, max: 10, def: 1, curve: 'log' },
      { id: 'hsf', name: 'Tiz Frek', min: 2000, max: 16000, def: 8000, unit: 'Hz', curve: 'log' },
      { id: 'hsg', name: 'Tiz', min: -18, max: 18, def: 0, unit: 'dB' },
      { id: 'lp', name: 'Yüksek Kesim', min: 1000, max: 20000, def: 20000, unit: 'Hz', curve: 'log' },
      { id: 'out', name: 'Çıkış', min: -24, max: 24, def: 0, unit: 'dB' },
    ],
    create(ctx) {
      const mk = (type) => { const f = ctx.createBiquadFilter(); f.type = type; return f; };
      const hp = mk('highpass'), ls = mk('lowshelf'), p1 = mk('peaking'), p2 = mk('peaking'), hs = mk('highshelf'), lp = mk('lowpass'), out = ctx.createGain();
      hp.Q.value = 0.707; lp.Q.value = 0.707;
      hp.connect(ls); ls.connect(p1); p1.connect(p2); p2.connect(hs); hs.connect(lp); lp.connect(out);
      const nodes = { hp, ls, p1, p2, hs, lp };
      return {
        input: hp, output: out, nodes,
        set(id, v) {
          switch (id) {
            case 'hp': hp.frequency.value = v; break;
            case 'lsf': ls.frequency.value = v; break; case 'lsg': ls.gain.value = v; break;
            case 'p1f': p1.frequency.value = v; break; case 'p1g': p1.gain.value = v; break; case 'p1q': p1.Q.value = v; break;
            case 'p2f': p2.frequency.value = v; break; case 'p2g': p2.gain.value = v; break; case 'p2q': p2.Q.value = v; break;
            case 'hsf': hs.frequency.value = v; break; case 'hsg': hs.gain.value = v; break;
            case 'lp': lp.frequency.value = v; break;
            case 'out': out.gain.value = U.dbToGain(v); break;
          }
        },
      };
    },
    ui(container, dev) {
      // Frekans yanıtı eğrisi
      const cv = U.el('canvas', { class: 'eq-curve' });
      container.prepend(cv);
      const freqs = new Float32Array(256), mag = new Float32Array(256), ph = new Float32Array(256), tot = new Float32Array(256);
      for (let i = 0; i < 256; i++) freqs[i] = 20 * Math.pow(1000, i / 255);
      const draw = () => {
        if (!cv.isConnected) return;
        const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight, g = cv.getContext('2d');
        tot.fill(0);
        Object.values(dev.inst.nodes).forEach(n => { n.getFrequencyResponse(freqs, mag, ph); for (let i = 0; i < 256; i++) tot[i] += 20 * Math.log10(mag[i] || 1e-6); });
        g.clearRect(0, 0, w, h);
        g.strokeStyle = 'rgba(255,255,255,.08)';
        [100, 1000, 10000].forEach(f => { const x = Math.log(f / 20) / Math.log(1000) * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); });
        g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
        g.strokeStyle = '#eeeeee'; g.lineWidth = 2; g.beginPath();
        for (let i = 0; i < 256; i++) { const x = i / 255 * w, y = h / 2 - U.clamp(tot[i], -24, 24) / 24 * (h / 2 - 4); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
        requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
    },
  });

  R({
    id: 'fx.comp', name: 'Kompresör', category: 'Dinamik & EQ',
    params: [
      { id: 'th', name: 'Eşik', min: -60, max: 0, def: -18, unit: 'dB' },
      { id: 'ratio', name: 'Oran', min: 1, max: 20, def: 4, unit: ':1' },
      { id: 'att', name: 'Atak', min: 0.0005, max: 0.3, def: 0.01, unit: 's', curve: 'log' },
      { id: 'rel', name: 'Bırakma', min: 0.01, max: 1.5, def: 0.15, unit: 's', curve: 'log' },
      { id: 'knee', name: 'Diz', min: 0, max: 30, def: 6, unit: 'dB' },
      { id: 'makeup', name: 'Telafi', min: 0, max: 30, def: 0, unit: 'dB' },
      { id: 'mix', name: 'Paralel', min: 0, max: 1, def: 1 },
    ],
    create(ctx) {
      const s = shell(ctx), c = ctx.createDynamicsCompressor(), mk = ctx.createGain();
      s.input.connect(c); c.connect(mk); mk.connect(s.wet);
      return {
        input: s.input, output: s.output, comp: c,
        set(id, v) {
          if (id === 'th') c.threshold.value = v; if (id === 'ratio') c.ratio.value = v;
          if (id === 'att') c.attack.value = v; if (id === 'rel') c.release.value = v;
          if (id === 'knee') c.knee.value = v; if (id === 'makeup') mk.gain.value = U.dbToGain(v);
          if (id === 'mix') s.mix(v);
        },
      };
    },
  });

  R({
    id: 'fx.limiter', name: 'Limitleyici', category: 'Dinamik & EQ',
    params: [
      { id: 'in', name: 'Giriş', min: 0, max: 24, def: 0, unit: 'dB' },
      { id: 'ceil', name: 'Tavan', min: -12, max: 0, def: -0.3, unit: 'dB' },
      { id: 'rel', name: 'Bırakma', min: 0.01, max: 1, def: 0.08, unit: 's', curve: 'log' },
    ],
    create(ctx) {
      const ig = ctx.createGain(), c = ctx.createDynamicsCompressor(), og = ctx.createGain(), clip = ctx.createWaveShaper();
      c.ratio.value = 20; c.knee.value = 0; c.attack.value = 0.001; c.threshold.value = -1;
      clip.curve = U.curve('soft', 1.2);
      ig.connect(c); c.connect(og); og.connect(clip);
      let ceil = -0.3;
      return {
        input: ig, output: clip,
        set(id, v) {
          if (id === 'in') ig.gain.value = U.dbToGain(v);
          if (id === 'ceil') { ceil = v; c.threshold.value = v - 0.5; og.gain.value = U.dbToGain(0); }
          if (id === 'rel') c.release.value = v;
        },
      };
    },
  });

  R({
    id: 'fx.gate', name: 'Gürültü Kapısı', category: 'Dinamik & EQ',
    params: [
      { id: 'th', name: 'Eşik', min: -90, max: 0, def: -50, unit: 'dB' },
      { id: 'att', name: 'Açılma', min: 0.0005, max: 0.05, def: 0.002, unit: 's', curve: 'log' },
      { id: 'rel', name: 'Kapanma', min: 0.01, max: 1, def: 0.12, unit: 's', curve: 'log' },
      { id: 'range', name: 'Aralık', min: -90, max: 0, def: -80, unit: 'dB' },
    ],
    create(ctx) {
      // Canlı izlemede seviye takip edilir; çevrimdışı render'da kapı açık kalır.
      const input = ctx.createGain(), vca = ctx.createGain(), an = ctx.createAnalyser();
      an.fftSize = 512; input.connect(an); input.connect(vca);
      const p = { th: -50, att: 0.002, rel: 0.12, range: -80 };
      let open = true, timer = null;
      const buf = new Float32Array(512);
      if (!(ctx instanceof OfflineAudioContext)) {
        timer = setInterval(() => {
          an.getFloatTimeDomainData(buf);
          let rms = 0; for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
          const db = U.gainToDb(Math.sqrt(rms / buf.length));
          const shouldOpen = db > p.th || (open && db > p.th - 6);
          if (shouldOpen !== open) {
            open = shouldOpen;
            const t = ctx.currentTime;
            vca.gain.cancelScheduledValues(t); vca.gain.setValueAtTime(vca.gain.value, t);
            vca.gain.setTargetAtTime(open ? 1 : U.dbToGain(p.range), t, (open ? p.att : p.rel) / 3);
          }
        }, 5);
      }
      return { input, output: vca, set(id, v) { p[id] = v; }, dispose() { clearInterval(timer); } };
    },
  });

  R({
    id: 'fx.reverb', name: 'Reverb (Yankı Odası)', category: 'Uzay',
    params: [
      { id: 'size', name: 'Süre', min: 0.2, max: 10, def: 2.2, unit: 's', curve: 'log' },
      { id: 'decay', name: 'Sönüm', min: 0.5, max: 8, def: 2.5 },
      { id: 'damp', name: 'Sönümleme', min: 0, max: 0.95, def: 0.4 },
      { id: 'pre', name: 'Ön Gecikme', min: 0, max: 0.25, def: 0.02, unit: 's' },
      { id: 'lowcut', name: 'Alçak Kesim', min: 20, max: 1000, def: 120, unit: 'Hz', curve: 'log' },
      { id: 'rev', name: 'Ters', type: 'bool', min: 0, max: 1, def: 0 },
      { id: 'mix', name: 'Karışım', min: 0, max: 1, def: 0.3 },
      { id: 'algo', name: 'Tip', type: 'choice', options: ['Genel', 'Oda (Room)', 'Salon (Hall)', 'Plaka (Plate)', 'Yay (Spring)', 'Katedral'], min: 0, max: 5, def: 0 },
    ],
    create(ctx) {
      const s = shell(ctx), pre = ctx.createDelay(1), hp = ctx.createBiquadFilter(), conv = ctx.createConvolver();
      hp.type = 'highpass';
      s.input.connect(pre); pre.connect(hp); hp.connect(conv); conv.connect(s.wet);
      const p = { size: 2.2, decay: 2.5, damp: 0.4, rev: 0, algo: 0 };
      let h = null, dirty = true;
      const regen = () => { conv.buffer = U.makeReverbIR2(ctx, Math.round(p.algo), p.size, p.decay, p.damp, p.rev >= 0.5); dirty = false; };
      const later = () => { dirty = true; if (ctx instanceof OfflineAudioContext) regen(); else { clearTimeout(h); h = setTimeout(regen, 120); } };
      regen();
      return {
        input: s.input, output: s.output,
        set(id, v) {
          if (id in p) { p[id] = v; later(); }
          if (id === 'pre') pre.delayTime.value = v;
          if (id === 'lowcut') hp.frequency.value = v;
          if (id === 'mix') s.mix(v);
        },
        dispose() { clearTimeout(h); },
      };
    },
  });

  const SYNC = ['Serbest', '1/1', '1/2', '1/4', '1/4.', '1/4T', '1/8', '1/8.', '1/8T', '1/16'];
  const syncBeats = [0, 4, 2, 1, 1.5, 2 / 3, 0.5, 0.75, 1 / 3, 0.25];
  R({
    id: 'fx.delay', name: 'Gecikme (Delay)', category: 'Zaman',
    params: [
      { id: 'time', name: 'Süre', min: 0.01, max: 2, def: 0.35, unit: 's', curve: 'log' },
      { id: 'sync', name: 'Tempo', type: 'choice', options: SYNC, min: 0, max: SYNC.length - 1, def: 3 },
      { id: 'fb', name: 'Geri Besleme', min: 0, max: 0.95, def: 0.4 },
      { id: 'mode', name: 'Mod', type: 'choice', options: ['Stereo', 'Ping-Pong'], min: 0, max: 1, def: 0 },
      { id: 'tone', name: 'Ton', min: 500, max: 20000, def: 6000, unit: 'Hz', curve: 'log' },
      { id: 'mix', name: 'Karışım', min: 0, max: 1, def: 0.3 },
    ],
    create(ctx) {
      const s = shell(ctx);
      const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
      const dl = ctx.createDelay(5), dr = ctx.createDelay(5), fl = ctx.createGain(), fr = ctx.createGain();
      const tl = ctx.createBiquadFilter(), tr = ctx.createBiquadFilter(); tl.type = tr.type = 'lowpass';
      const inL = ctx.createGain(), inR = ctx.createGain();
      s.input.connect(split); split.connect(inL, 0); split.connect(inR, 1);
      dl.connect(tl); dr.connect(tr);
      tl.connect(merge, 0, 0); tr.connect(merge, 0, 1); merge.connect(s.wet);
      const p = { time: 0.35, sync: 3, fb: 0.4, mode: 0 };
      function route() {
        [inL, inR, tl, tr, fl, fr].forEach(n => { try { n.disconnect(); } catch (e) { } });
        tl.connect(merge, 0, 0); tr.connect(merge, 0, 1);
        tl.connect(fl); tr.connect(fr);
        if (p.mode >= 0.5) { // ping-pong
          const mono = ctx.createGain(); mono.gain.value = 0.5;
          inL.connect(dl); inR.connect(dl); fl.connect(dr); fr.connect(dl);
        } else { inL.connect(dl); inR.connect(dr); fl.connect(dl); fr.connect(dr); }
        const t = p.sync > 0 ? syncBeats[Math.round(p.sync)] * 60 / tempo() : p.time;
        dl.delayTime.value = dr.delayTime.value = Math.min(4.9, t);
        fl.gain.value = fr.gain.value = p.fb;
      }
      route();
      return {
        input: s.input, output: s.output,
        set(id, v) {
          if (id in p) { p[id] = v; route(); }
          if (id === 'tone') { tl.frequency.value = tr.frequency.value = v; }
          if (id === 'mix') s.mix(v);
        },
        tempoChanged: route,
      };
    },
  });

  function modDelay(ctx, opts) {
    // chorus / flanger ortak gövdesi
    const s = shell(ctx), split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
    const dl = ctx.createDelay(0.1), dr = ctx.createDelay(0.1), fb = ctx.createGain();
    const L = lfo(ctx), inv = ctx.createGain(); inv.gain.value = -1;
    L.gain.connect(dl.delayTime); L.gain.connect(inv); inv.connect(dr.delayTime);
    s.input.connect(split); split.connect(dl, 0); split.connect(dr, 1);
    dl.connect(merge, 0, 0); dr.connect(merge, 0, 1); merge.connect(s.wet);
    if (opts.feedback) { dl.connect(fb); fb.connect(dl); }
    const p = { rate: 0.8, depth: 0.5, base: opts.base };
    const apply = () => {
      L.osc.frequency.value = p.rate;
      dl.delayTime.value = dr.delayTime.value = p.base;
      L.gain.gain.value = p.depth * p.base * 0.9;
    };
    apply();
    return {
      input: s.input, output: s.output,
      set(id, v) {
        if (id in p) { p[id] = v; apply(); }
        if (id === 'fb') fb.gain.value = v;
        if (id === 'mix') s.mix(v);
      },
      dispose() { L.stop(); },
    };
  }
  R({
    id: 'fx.chorus', name: 'Chorus', category: 'Modülasyon',
    params: [
      { id: 'rate', name: 'Hız', min: 0.05, max: 8, def: 0.8, unit: 'Hz', curve: 'log' },
      { id: 'depth', name: 'Derinlik', min: 0, max: 1, def: 0.5 },
      { id: 'base', name: 'Gecikme', min: 0.005, max: 0.04, def: 0.018, unit: 's' },
      { id: 'mix', name: 'Karışım', min: 0, max: 1, def: 0.5 },
    ],
    create: ctx => modDelay(ctx, { base: 0.018 }),
  });
  R({
    id: 'fx.flanger', name: 'Flanger', category: 'Modülasyon',
    params: [
      { id: 'rate', name: 'Hız', min: 0.02, max: 5, def: 0.25, unit: 'Hz', curve: 'log' },
      { id: 'depth', name: 'Derinlik', min: 0, max: 1, def: 0.8 },
      { id: 'base', name: 'Gecikme', min: 0.0005, max: 0.01, def: 0.003, unit: 's' },
      { id: 'fb', name: 'Geri Besleme', min: 0, max: 0.95, def: 0.6 },
      { id: 'mix', name: 'Karışım', min: 0, max: 1, def: 0.5 },
    ],
    create: ctx => modDelay(ctx, { base: 0.003, feedback: true }),
  });

  R({
    id: 'fx.phaser', name: 'Phaser', category: 'Modülasyon',
    params: [
      { id: 'rate', name: 'Hız', min: 0.02, max: 8, def: 0.5, unit: 'Hz', curve: 'log' },
      { id: 'depth', name: 'Derinlik', min: 0, max: 1, def: 0.7 },
      { id: 'center', name: 'Merkez', min: 200, max: 4000, def: 900, unit: 'Hz', curve: 'log' },
      { id: 'fb', name: 'Rezonans', min: 0, max: 0.9, def: 0.4 },
      { id: 'mix', name: 'Karışım', min: 0, max: 1, def: 0.5 },
    ],
    create(ctx) {
      const s = shell(ctx), L = lfo(ctx), fb = ctx.createGain(), stages = [];
      let prev = s.input;
      const sum = ctx.createGain();
      s.input.connect(sum); prev = sum;
      for (let i = 0; i < 6; i++) { const a = ctx.createBiquadFilter(); a.type = 'allpass'; a.Q.value = 0.6; prev.connect(a); prev = a; stages.push(a); L.gain.connect(a.frequency); }
      prev.connect(s.wet); prev.connect(fb); fb.connect(sum);
      const p = { rate: 0.5, depth: 0.7, center: 900 };
      const apply = () => { L.osc.frequency.value = p.rate; stages.forEach(a => a.frequency.value = p.center); L.gain.gain.value = p.center * 0.9 * p.depth; };
      apply();
      return {
        input: s.input, output: s.output,
        set(id, v) { if (id in p) { p[id] = v; apply(); } if (id === 'fb') fb.gain.value = v; if (id === 'mix') s.mix(v); },
        dispose() { L.stop(); },
      };
    },
  });

  R({
    id: 'fx.tremolo', name: 'Tremolo', category: 'Modülasyon',
    params: [
      { id: 'rate', name: 'Hız', min: 0.1, max: 20, def: 5, unit: 'Hz', curve: 'log' },
      { id: 'depth', name: 'Derinlik', min: 0, max: 1, def: 0.6 },
      { id: 'shape', name: 'Dalga', type: 'choice', options: ['Sinüs', 'Kare', 'Üçgen'], min: 0, max: 2, def: 0 },
    ],
    create(ctx) {
      const vca = ctx.createGain(), L = lfo(ctx);
      L.gain.connect(vca.gain);
      const p = { rate: 5, depth: 0.6 };
      const apply = () => { L.osc.frequency.value = p.rate; L.gain.gain.value = p.depth / 2; vca.gain.value = 1 - p.depth / 2; };
      apply();
      return {
        input: vca, output: vca,
        set(id, v) { if (id in p) { p[id] = v; apply(); } if (id === 'shape') L.osc.type = ['sine', 'square', 'triangle'][Math.round(v)]; },
        dispose() { L.stop(); },
      };
    },
  });

  R({
    id: 'fx.autopan', name: 'Oto Pan', category: 'Modülasyon',
    params: [
      { id: 'rate', name: 'Hız', min: 0.05, max: 10, def: 1, unit: 'Hz', curve: 'log' },
      { id: 'depth', name: 'Derinlik', min: 0, max: 1, def: 0.8 },
    ],
    create(ctx) {
      const p = ctx.createStereoPanner(), L = lfo(ctx);
      L.gain.connect(p.pan);
      return {
        input: p, output: p,
        set(id, v) { if (id === 'rate') L.osc.frequency.value = v; if (id === 'depth') L.gain.gain.value = v; },
        dispose() { L.stop(); },
      };
    },
  });

  const DTYPES = ['Yumuşak', 'Sert', 'Tüp', 'Fuzz', 'Katlama', 'Asimetrik'];
  const DKEYS = ['soft', 'hard', 'tube', 'fuzz', 'fold', 'asym'];
  R({
    id: 'fx.dist', name: 'Distorsiyon / Satürasyon', category: 'Bozulma',
    params: [
      { id: 'drive', name: 'Sürüş', min: 1, max: 50, def: 5, curve: 'log' },
      { id: 'type', name: 'Tip', type: 'choice', options: DTYPES, min: 0, max: DTYPES.length - 1, def: 0 },
      { id: 'tone', name: 'Ton', min: 500, max: 16000, def: 6000, unit: 'Hz', curve: 'log' },
      { id: 'out', name: 'Çıkış', min: -30, max: 6, def: -6, unit: 'dB' },
      { id: 'mix', name: 'Karışım', min: 0, max: 1, def: 1 },
    ],
    create(ctx) {
      const s = shell(ctx), ws = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), og = ctx.createGain();
      ws.oversample = '4x'; lp.type = 'lowpass';
      s.input.connect(ws); ws.connect(lp); lp.connect(og); og.connect(s.wet);
      const p = { drive: 5, type: 0 };
      const apply = () => { ws.curve = U.curve(DKEYS[Math.round(p.type)], p.drive); };
      apply();
      return {
        input: s.input, output: s.output,
        set(id, v) { if (id in p) { p[id] = v; apply(); } if (id === 'tone') lp.frequency.value = v; if (id === 'out') og.gain.value = U.dbToGain(v); if (id === 'mix') s.mix(v); },
      };
    },
  });

  R({
    id: 'fx.crusher', name: 'Bit Ezici', category: 'Bozulma',
    params: [
      { id: 'bits', name: 'Bit', min: 1, max: 16, def: 6, step: 1 },
      { id: 'tone', name: 'Ton', min: 500, max: 20000, def: 20000, unit: 'Hz', curve: 'log' },
      { id: 'mix', name: 'Karışım', min: 0, max: 1, def: 1 },
    ],
    create(ctx) {
      const s = shell(ctx), ws = ctx.createWaveShaper(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; s.input.connect(ws); ws.connect(lp); lp.connect(s.wet);
      return {
        input: s.input, output: s.output,
        set(id, v) { if (id === 'bits') ws.curve = U.curve('crush', v, 65536); if (id === 'tone') lp.frequency.value = v; if (id === 'mix') s.mix(v); },
      };
    },
  });

  const FTYPES = ['Alçak Geçiren', 'Yüksek Geçiren', 'Bant Geçiren', 'Çentik'];
  R({
    id: 'fx.filter', name: 'Filtre + LFO', category: 'Filtre',
    params: [
      { id: 'type', name: 'Tip', type: 'choice', options: FTYPES, min: 0, max: 3, def: 0 },
      { id: 'freq', name: 'Kesim', min: 20, max: 20000, def: 2000, unit: 'Hz', curve: 'log' },
      { id: 'q', name: 'Rezonans', min: 0.1, max: 25, def: 1, curve: 'log' },
      { id: 'rate', name: 'LFO Hız', min: 0.02, max: 20, def: 1, unit: 'Hz', curve: 'log' },
      { id: 'depth', name: 'LFO Miktar', min: 0, max: 1, def: 0 },
    ],
    create(ctx) {
      const f = ctx.createBiquadFilter(), L = lfo(ctx);
      L.gain.connect(f.frequency);
      const p = { freq: 2000, depth: 0 };
      const apply = () => { f.frequency.value = p.freq; L.gain.gain.value = p.freq * 0.9 * p.depth; };
      return {
        input: f, output: f,
        set(id, v) {
          if (id === 'type') f.type = ['lowpass', 'highpass', 'bandpass', 'notch'][Math.round(v)];
          if (id === 'q') f.Q.value = v; if (id === 'rate') L.osc.frequency.value = v;
          if (id in p) { p[id] = v; apply(); }
        },
        dispose() { L.stop(); },
      };
    },
  });

  R({
    id: 'fx.width', name: 'Stereo Genişlik', category: 'Uzay',
    params: [{ id: 'width', name: 'Genişlik', min: 0, max: 2, def: 1 }],
    create(ctx) {
      const input = ctx.createGain(), sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2);
      input.connect(sp);
      // M = (L+R)/2 ; S = (L-R)/2 * w ; L' = M+S ; R' = M-S
      const mL = ctx.createGain(), mR = ctx.createGain(), sL = ctx.createGain(), sR = ctx.createGain();
      const mid = ctx.createGain(), side = ctx.createGain(), sideInv = ctx.createGain();
      mL.gain.value = mR.gain.value = 0.5; sL.gain.value = 0.5; sR.gain.value = -0.5; sideInv.gain.value = -1;
      sp.connect(mL, 0); sp.connect(mR, 1); sp.connect(sL, 0); sp.connect(sR, 1);
      mL.connect(mid); mR.connect(mid); sL.connect(side); sR.connect(side);
      mid.connect(mg, 0, 0); mid.connect(mg, 0, 1);
      side.connect(mg, 0, 0); side.connect(sideInv); sideInv.connect(mg, 0, 1);
      return { input, output: mg, set(id, v) { if (id === 'width') side.gain.value = v; } };
    },
  });
})(window.OS);
