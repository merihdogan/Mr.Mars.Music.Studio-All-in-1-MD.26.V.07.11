/* Mr. Mars Music Studio · MRH DGN — Amfi Rack: canlı gitar / bas işleme
 * Yönlendirme modları: tek yol, 2'li bölücü, 3'lü bölücü (ıslak/kuru/ıslak), paralel stereo.
 * Her yolun kendi pedal / amfi / kabin zinciri ve mikser kanalı (seviye, pan, sessiz, solo, ters faz),
 * paralel DI (direkt) yolu ve gecikmesi, master bus efektleri. Akort cihazı, canlı mod, modülatörler.
 */
(function (OS) {
  const U = OS.U, el = U.el, ui = OS.ui, E = OS.engine;
  const RG = ui.rig = { on: false, g: null };
  const COLORS = { 'pdl.od': '#7bd36b', 'pdl.dist': '#f29b38', 'pdl.fuzz': '#c94b4b', 'pdl.comp': '#5fa8e8', 'pdl.wah': '#555', 'pdl.boost': '#e8e3d0', 'pdl.octave': '#9b6be0', 'pdl.eq': '#cfcfcf', 'fx.chorus': '#6fd0e6', 'fx.delay': '#e8d25f', 'fx.reverb': '#7aa0e8', 'fx.phaser': '#ef8c3a', 'fx.flanger': '#b06de0', 'fx.tremolo': '#e86fb0', 'fx.gate': '#999', 'gtr.pickup': '#d6c38f' };
  const MODES = [['single', 'Tek yol'], ['split2', '2’li bölücü'], ['split3', '3’lü bölücü (ıslak/kuru/ıslak)'], ['stereo', 'Paralel stereo (2 giriş)']];
  const NPATH = { single: 1, split2: 2, split3: 3, stereo: 2 };
  let root, inNode, inGain, outGain, an, tunerEls, histCv;

  // ---------------- Rig grafiği (canlı rack ve parça efekti "gtr.rig" ortak kullanır) ----------------
  const defMix = () => [{ lvl: 0, pan: 0 }, { lvl: 0, pan: 0 }, { lvl: 0, pan: 0 }];
  OS.buildRig = function (ctx, st, fresh) {
    const mk = s => { const c = Object.assign({}, s); if (fresh) delete c.id; return new OS.Device(ctx, s.plugin, c); };
    const g = { input: ctx.createGain(), output: ctx.createGain(), preOut: ctx.createGain(), sum: ctx.createGain(), split: ctx.createChannelSplitter(2) };
    g.pre = (st.pre || []).map(mk); g.post = (st.post || []).map(mk);
    g.paths = [0, 1, 2].map(i => ((st.paths || [])[i] || []).map(mk));
    g.pin = [0, 1, 2].map(() => ctx.createGain()); g.pg = [0, 1, 2].map(() => ctx.createGain()); g.pan = [0, 1, 2].map(() => ctx.createStereoPanner());
    g.di = { d: ctx.createDelay(0.1), g: ctx.createGain(), pan: ctx.createStereoPanner() };
    g.all = () => [...g.pre, ...g.paths.flat(), ...g.post];
    const chain = (from, devs, to) => { devs.forEach(d => { try { d.out.disconnect(); } catch (e) { } }); let p = from; devs.forEach(d => { p.connect(d.in); p = d.out; }); p.connect(to); };
    g.rewire = function (s) {
      [g.input, g.preOut, g.sum, g.split, ...g.pin, ...g.pg, ...g.pan, g.di.d, g.di.g, g.di.pan].forEach(n => { try { n.disconnect(); } catch (e) { } });
      const mode = s.mode || 'single', n = NPATH[mode];
      chain(g.input, g.pre, g.preOut);
      if (mode === 'stereo') { g.preOut.connect(g.split); g.split.connect(g.pin[0], 0); g.split.connect(g.pin[1], 1); }
      else for (let i = 0; i < n; i++) g.preOut.connect(g.pin[i]);
      for (let i = 0; i < n; i++) { chain(g.pin[i], g.paths[i], g.pg[i]); g.pg[i].connect(g.pan[i]); g.pan[i].connect(g.sum); }
      g.input.connect(g.di.d); g.di.d.connect(g.di.g); g.di.g.connect(g.di.pan); g.di.pan.connect(g.sum);
      chain(g.sum, g.post, g.output);
      g.mix(s);
    };
    g.mix = function (s) {
      const n = NPATH[s.mode || 'single'], mx = s.mix || defMix(), di = s.di || {};
      const anySolo = mx.slice(0, n).some(m => m.solo) || di.solo;
      for (let i = 0; i < 3; i++) {
        const m = mx[i] || {};
        g.pg[i].gain.value = i >= n || m.mute || (anySolo && !m.solo) ? 0 : U.dbToGain(m.lvl || 0) * (m.inv ? -1 : 1);
        g.pan[i].pan.value = m.pan || 0;
      }
      g.di.d.delayTime.value = (di.delay || 0) / 1000;
      g.di.g.gain.value = !di.on || di.mute || (anySolo && !di.solo) ? 0 : U.dbToGain(di.lvl == null ? -6 : di.lvl) * (di.inv ? -1 : 1);
      g.di.pan.pan.value = di.pan || 0;
    };
    g.serialize = () => ({ pre: g.pre.map(d => d.serialize()), paths: g.paths.map(p => p.map(d => d.serialize())), post: g.post.map(d => d.serialize()) });
    g.dispose = () => g.all().forEach(d => d.dispose());
    g.rewire(st);
    return g;
  };
  // Rig'i bir parçaya tek efekt olarak takmak için
  OS.plugins.register({
    id: 'gtr.rig', name: 'Amfi Rack Rig’i', category: 'Gitar & Bas',
    params: [{ id: 'level', name: 'Seviye', min: -24, max: 12, def: 0, unit: 'dB' }],
    create(ctx, host) {
      const input = ctx.createGain(), out = ctx.createGain();
      let g = null;
      const load = st => { if (g) { try { input.disconnect(); g.output.disconnect(); } catch (e) { } g.dispose(); } g = OS.buildRig(ctx, st, true); input.connect(g.input); g.output.connect(out); host.device.extra = { rig: JSON.parse(JSON.stringify(st)) }; };
      load((host.device.extra && host.device.extra.rig) || { mode: 'single', paths: [[]] });
      return {
        input, output: out,
        set(id, v) { if (id === 'level') out.gain.value = U.dbToGain(v); },
        save() { return { rig: Object.assign({}, host.device.extra.rig, g.serialize()) }; },
        restore() { this.ready = Promise.all(g.all().map(d => d.inst.ready).filter(Boolean)); },
        load, devices: () => g.all(),
        dispose() { g && g.dispose(); },
      };
    },
    ui(container, dev) {
      const st = (dev.extra && dev.extra.rig) || {};
      const names = (st.paths || []).slice(0, NPATH[st.mode || 'single']).map((p, i) => OS.t('Yol') + ' ' + (i + 1) + ': ' + p.map(d => OS.plugins.get(d.plugin) ? OS.t(OS.plugins.get(d.plugin).name) : d.plugin).join(' → '));
      container.appendChild(el('div', { class: 'muted', style: 'white-space:pre-line;margin-bottom:6px' }, OS.t((MODES.find(m => m[0] === (st.mode || 'single')) || MODES[0])[1]) + '\n' + names.join('\n')));
      container.appendChild(el('div', { class: 'row' },
        el('button', { class: 'btn sm', onclick: () => { RG.loadState(Object.assign({}, st, dev.inst.save().rig)); ui.showView('rig'); } }, 'Amfi Rack’te aç'),
        el('button', { class: 'btn sm', onclick: () => { RG.ensure(); dev.inst.load(Object.assign({}, RG.state, RG.g.serialize())); U.toast(OS.t('Rack’teki rig ile güncellendi')); } }, 'Rack’teki rig ile güncelle')));
    },
  });

  // ---------------- Durum ----------------
  RG.init = function () {
    root = document.getElementById('view-rig');
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('os.rig') || 'null'); } catch (e) { }
    RG.state = Object.assign({ mode: 'single', inputCh: 'L', inGain: 0, outGain: -6, mix: defMix(), di: { on: false, lvl: -6, delay: 0, pan: 0 }, mods: [], cabLink: true, cabBypass: false, tuner: { ref: 440, mute: false }, live: false }, saved || {});
    // eski (tek zincirli) kayıtları yeni yapıya taşı
    if (RG.state.chain && !RG.state.paths) { RG.state.paths = [RG.state.chain, [], []]; RG.state.pre = []; RG.state.post = []; delete RG.state.chain; }
    OS.cabBypass = RG.state.cabBypass;
    OS.midiHooks = OS.midiHooks || [];
    // MIDI program değişimi: canlı listedeki n. ön ayara geç
    OS.midiHooks.push(d => { if ((d[0] & 0xf0) !== 0xc0) return false; const list = presetList(); if (list[d[1]]) { loadPreset(list[d[1]].key); U.toast(list[d[1]].name); } return true; });
  };
  RG.ensure = function () {
    if (inGain) return;
    const ctx = E.init();
    inGain = ctx.createGain(); outGain = ctx.createGain(); an = ctx.createAnalyser(); an.fftSize = 2048;
    inGain.connect(an); outGain.connect(E.monitorBus);
    inGain.gain.value = U.dbToGain(RG.state.inGain); applyOut();
    if (!RG.state.paths) { RG.state.paths = [OS.RIG_PRESETS['Blues Crunch'].map(([id, v]) => ({ plugin: id, values: v })), [], []]; RG.state.pre = []; RG.state.post = []; }
    build(false);
  };
  function build(fresh) {
    if (RG.g) { try { inGain.disconnect(RG.g.input); RG.g.output.disconnect(); } catch (e) { } RG.g.dispose(); }
    RG.g = OS.buildRig(E.ctx, RG.state, fresh);
    inGain.connect(RG.g.input); RG.g.output.connect(outGain);
    RG.g.all().forEach(hookAmp);
    // eski modülatör kayıtları sıra numarasıyla tutuluyordu
    (RG.state.mods || []).forEach(m => { if (m.devId == null && m.dev != null) { const d = RG.g.all()[m.dev]; m.devId = d && d.id; } });
  }
  const applyOut = () => { outGain.gain.value = RG.state.tuner && RG.state.tuner.mute && RG.tuning ? 0 : U.dbToGain(RG.state.outGain); };
  function rewire() { RG.g.rewire(RG.state); save(); }
  function save() {
    if (RG.g) Object.assign(RG.state, RG.g.serialize());
    try { localStorage.setItem('os.rig', JSON.stringify(RG.state)); } catch (e) { }
  }
  RG.allDevices = () => (RG.g ? RG.g.all() : []);
  RG.loadState = function (st) { RG.ensure(); Object.assign(RG.state, JSON.parse(JSON.stringify(st))); build(true); save(); RG.render(); };

  // Kabin bağlama: amfi modeli değişince aynı yoldaki kabin uygun modele geçer
  function cabFor(name) {
    const C = OS.CAB_MODELS.map(c => c.name), f = k => C.findIndex(n => n.includes(k));
    const rules = [[/^Bas Klasik|^Bas Tüp/, '8x10 Bas'], [/^Bas Hi-Fi/, '4x10 Bas Hi-Fi'], [/^Bas/, '4x10 Bas'], [/Jazz/, '2x12 Stereo'], [/^Crunch$|Klasik Crunch/, '4x12 Vintage'], [/Hard Rock|Modern Hi-Gain/, '4x12 Yüksek Güç'], [/Temiz/, '1x12 Açık Combo'], [/Sıcak|Vintage/, '1x12 Sıcak'], [/Ağır Metal|Akıcı Lead/, '4x12 Büyük'], [/Sıkı Metal|Modern Metal|Yüksek Kazanç/, '4x12 Sıkı'], [/Parlak Crunch/, '2x12 Parlak'], [/Overdrive|^Lead$/, '2x12 Açık Vintage']];
    for (const [re, k] of rules) if (re.test(name)) { const i = f(k); if (i >= 0) return i; }
    return 2;
  }
  function hookAmp(d) {
    if (d.pluginId !== 'gtr.amp' || d._hooked) return;
    d._hooked = true;
    const orig = d.setParam.bind(d);
    d.setParam = (id, v) => {
      orig(id, v);
      if (id !== 'model' || !RG.state.cabLink || !RG.g) return;
      const path = RG.g.paths.find(p => p.includes(d)) || RG.g.pre.includes(d) && RG.g.pre || RG.g.post;
      const cab = path && path.find(x => x.pluginId === 'gtr.cab');
      if (cab) { cab.setParam('model', cabFor(OS.AMP_MODELS[Math.round(v)].name)); if (root && root.classList.contains('active')) setTimeout(RG.render, 0); }
    };
  }

  async function power(on) {
    RG.ensure();
    if (on) {
      try { if (!E.inputSource) await E.openInput(OS.settings.inputId); } catch (e) { U.toast(OS.t('Ses girişi açılamadı:') + ' ' + e.message); return; }
      await E.resume();
      if (inNode) try { inNode.disconnect(inGain); } catch (e) { }
      inNode = E.inputNode(RG.state.inputCh === 'stereo' || RG.state.mode === 'stereo' ? 'stereo' : RG.state.inputCh); inNode.connect(inGain);
    } else if (inNode) { try { inNode.disconnect(inGain); } catch (e) { } inNode = null; }
    RG.on = on;
    RG.render();
  }

  // ---------------- Arayüz ----------------
  RG.render = function () {
    RG.ensure();
    root.innerHTML = '';
    const st = RG.state;
    const pw = el('button', { class: 'btn ' + (RG.on ? 'on' : 'primary'), onclick: () => power(!RG.on) }, RG.on ? '⏻ Rack Açık' : '⏻ Rack’i Başlat');
    const chSel = el('select', { onchange: () => { st.inputCh = chSel.value; save(); if (RG.on) power(true); } },
      [['L', 'Giriş 1 (Sol)'], ['R', 'Giriş 2 (Sağ)'], ['stereo', 'Stereo']].map(([v, l]) => el('option', { value: v, selected: st.inputCh === v }, l)));
    const modeSel = el('select', { onchange: () => { st.mode = modeSel.value; if (st.mode === 'split3') st.mix.forEach((m, i) => { if (!m.pan) m.pan = [-0.8, 0, 0.8][i]; }); if (st.mode === 'stereo') { st.mix[0].pan = st.mix[0].pan || -0.8; st.mix[1].pan = st.mix[1].pan || 0.8; } rewire(); if (RG.on) power(true); else RG.render(); } },
      MODES.map(([v, l]) => el('option', { value: v, selected: st.mode === v }, l)));
    const presetSel = el('select', { onchange: () => { if (presetSel.value) loadPreset(presetSel.value); } },
      el('option', { value: '' }, 'Ön ayar seç…'),
      el('optgroup', { label: 'Fabrika' }, Object.keys(OS.RIG_PRESETS).map(k => el('option', { value: 'f:' + k }, k))),
      el('optgroup', { label: 'Kullanıcı' }, Object.keys(userRigs()).map(k => el('option', { value: 'u:' + k }, k))));
    const knIn = U.knob({ label: 'Giriş', min: -24, max: 24, def: 0, value: st.inGain, fmt: v => v.toFixed(1) + ' dB', onchange: v => { st.inGain = v; inGain.gain.value = U.dbToGain(v); save(); } });
    const knOut = U.knob({ label: 'Çıkış', min: -40, max: 12, def: -6, value: st.outGain, fmt: v => v.toFixed(1) + ' dB', onchange: v => { st.outGain = v; applyOut(); save(); } });
    root.append(
      el('div', { class: 'rig-top' }, pw, el('label', { class: 'field' }, 'Giriş kanalı ', chSel), el('label', { class: 'field' }, 'Yönlendirme', modeSel), knIn, knOut, tunerUI(), el('span', { class: 'spacer' }),
        presetSel,
        el('button', { class: 'btn sm', onclick: async () => { const n = await U.prompt(OS.t('Rig ön ayar adı')); if (n) { save(); const u = userRigs(); u[n] = JSON.parse(JSON.stringify({ mode: st.mode, pre: st.pre, paths: st.paths, post: st.post, mix: st.mix, di: st.di })); localStorage.setItem('os.rigs', JSON.stringify(u)); RG.render(); U.toast(OS.t('Kaydedildi')); } } }, 'Rig’i Kaydet'),
        el('button', { class: 'btn sm', onclick: copyToTrack }, 'Seçili ses parçasına kopyala'),
        el('button', { class: 'btn sm' + (st.live ? ' on' : ''), onclick: () => { st.live = !st.live; save(); RG.render(); } }, 'Canlı mod')),
      el('div', { class: 'row' },
        el('label', { class: 'field' }, el('input', { type: 'checkbox', checked: st.cabLink, onchange: e => { st.cabLink = e.target.checked; save(); } }), 'Kabin bağlantısı (amfi değişince uygun kabin)'),
        el('label', { class: 'field' }, el('input', { type: 'checkbox', checked: st.cabBypass, onchange: e => { st.cabBypass = OS.cabBypass = e.target.checked; save(); RG.g.all().filter(d => d.pluginId === 'gtr.cab').forEach(d => d.setParam('model', d.values.model)); } }), 'Tüm kabinleri devre dışı bırak (harici IR / kabin kullanıyorsanız)')),
    );
    if (st.live) { root.appendChild(liveUI()); return; }
    const n = NPATH[st.mode];
    root.appendChild(rowUI('pre', n > 1 ? OS.t('Bölücüden önce') : OS.t('Girişte'), RG.g.pre));
    for (let i = 0; i < n; i++) root.appendChild(rowUI('p' + i, OS.t('Yol') + ' ' + (i + 1) + (st.mode === 'split3' ? ' ' + OS.t(['(ıslak L)', '(kuru)', '(ıslak R)'][i]) : st.mode === 'stereo' ? ' ' + OS.t(['(sol giriş)', '(sağ giriş)'][i]) : ''), RG.g.paths[i], i));
    root.appendChild(diUI());
    root.appendChild(rowUI('post', OS.t('Master bus (son işlem)'), RG.g.post));
    root.appendChild(modsUI());
  };

  const rowArr = k => k === 'pre' ? RG.g.pre : k === 'post' ? RG.g.post : RG.g.paths[+k.slice(1)];
  function rowUI(key, title, arr, pathIdx) {
    const board = el('div', { class: 'pedalboard rig-row' });
    const head = el('div', { class: 'rig-row-head' }, el('b', null, title));
    if (pathIdx != null) head.appendChild(mixStrip(RG.state.mix[pathIdx]));
    arr.forEach((d, i) => board.appendChild(dragWrap(unit(d, key, i), key, i)));
    const add = el('button', { class: 'btn', style: 'align-self:center', onclick: e => ui.pluginMenu(e.clientX, e.clientY, 'effect', id => { const d = new OS.Device(E.ctx, id); hookAmp(d); arr.push(d); rewire(); RG.render(); }) }, '+ Pedal / Efekt / Amfi');
    add.addEventListener('dragover', e => e.preventDefault());
    add.addEventListener('drop', e => { e.preventDefault(); moveTo(e, key, arr.length); });
    board.appendChild(add);
    return el('div', { class: 'rig-row-box' }, head, board);
  }
  function mixStrip(m) {
    const upd = () => { RG.g.mix(RG.state); save(); };
    const tg = (k, label, title) => { const b = el('button', { class: 'mini' + (m[k] ? ' on ' + k : ''), title, onclick: () => { m[k] = !m[k]; b.classList.toggle('on', m[k]); upd(); } }, label); return b; };
    return el('div', { class: 'row mix-strip' },
      U.knob({ label: 'Seviye', size: 30, min: -40, max: 12, def: 0, value: m.lvl || 0, fmt: v => v.toFixed(1), onchange: v => { m.lvl = v; upd(); } }),
      U.knob({ label: 'Pan', size: 30, min: -1, max: 1, def: 0, value: m.pan || 0, fmt: v => v === 0 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100), onchange: v => { m.pan = v; upd(); } }),
      tg('mute', 'M', 'Sessiz'), tg('solo', 'S', 'Solo'), tg('inv', 'Ø', 'Ters faz'));
  }
  function diUI() {
    const di = RG.state.di;
    const upd = () => { RG.g.mix(RG.state); save(); };
    return el('div', { class: 'rig-row-box' }, el('div', { class: 'rig-row-head' },
      el('label', { class: 'field' }, el('input', { type: 'checkbox', checked: di.on, onchange: e => { di.on = e.target.checked; upd(); } }), el('b', null, 'DI (direkt sinyal) yolu')),
      di.on ? el('div', { class: 'row mix-strip' },
        U.knob({ label: 'Seviye', size: 30, min: -40, max: 12, def: -6, value: di.lvl, fmt: v => v.toFixed(1), onchange: v => { di.lvl = v; upd(); } }),
        U.knob({ label: 'Pan', size: 30, min: -1, max: 1, def: 0, value: di.pan || 0, fmt: v => v.toFixed(2), onchange: v => { di.pan = v; upd(); } }),
        U.knob({ label: 'Gecikme', size: 30, min: 0, max: 20, def: 0, value: di.delay || 0, fmt: v => v.toFixed(1) + ' ms', onchange: v => { di.delay = v; upd(); } }),
        el('button', { class: 'mini' + (di.inv ? ' on' : ''), title: 'Ters faz', onclick: e => { di.inv = !di.inv; e.target.classList.toggle('on', di.inv); upd(); } }, 'Ø'),
        el('span', { class: 'muted' }, 'Amfisiz temiz sinyal; gecikme ile amfi yollarıyla faz uyumu sağlanır.')) : null));
  }
  function dragWrap(u, key, i) {
    u.draggable = true;
    u.addEventListener('dragstart', e => { e.dataTransfer.setData('text/rig', JSON.stringify({ key, i })); u.classList.add('dragging'); });
    u.addEventListener('dragend', () => u.classList.remove('dragging'));
    u.addEventListener('dragover', e => { e.preventDefault(); u.classList.add('drop-hint'); });
    u.addEventListener('dragleave', () => u.classList.remove('drop-hint'));
    u.addEventListener('drop', e => { e.preventDefault(); u.classList.remove('drop-hint'); moveTo(e, key, i); });
    return u;
  }
  function moveTo(e, key, i) {
    let src; try { src = JSON.parse(e.dataTransfer.getData('text/rig')); } catch (er) { return; }
    const from = rowArr(src.key), to = rowArr(key), [d] = from.splice(src.i, 1);
    if (!d) return;
    to.splice(from === to && src.i < i ? i - 1 : i, 0, d);
    rewire(); RG.render();
  }

  function unit(d, key, i) {
    const arr = rowArr(key);
    const move = dir => { const j = i + dir; if (j < 0 || j >= arr.length) return; arr.splice(j, 0, arr.splice(i, 1)[0]); rewire(); RG.render(); };
    const remove = () => { arr.splice(i, 1); d.dispose(); rewire(); RG.render(); };
    const ctrls = el('div', { class: 'knobs' });
    d.def.params.forEach(p => ctrls.appendChild(ui.paramControl(d, p)));
    const custom = el('div'); if (d.def.ui) try { d.def.ui(custom, d); } catch (e) { }
    if (/^gtr\.(amp|cab|dualamp)$/.test(d.pluginId)) {
      return el('div', { class: 'amp-unit' + (d.pluginId === 'gtr.cab' ? ' cab' : '') + (d.bypass ? ' byp' : ''), style: d.bypass ? 'opacity:.5' : '' },
        el('div', { class: 'row' }, el('div', { class: 'amp-title' }, OS.t(d.def.name)), el('span', { class: 'spacer' }),
          el('span', { class: 'mv', onclick: () => move(-1) }, '◀'), el('span', { class: 'mv', onclick: () => move(1) }, '▶'),
          el('button', { class: 'btn sm' + (d.bypass ? '' : ' on'), onclick: () => { d.setBypass(!d.bypass); save(); RG.render(); } }, d.bypass ? 'Kapalı' : 'Açık'),
          el('button', { class: 'btn sm', onclick: remove }, '✕')),
        custom, ctrls);
    }
    const led = el('div', { class: 'led' + (d.bypass ? '' : ' on') });
    return el('div', { class: 'pedal', style: '--pc:' + (COLORS[d.pluginId] || '#8aa') },
      el('span', { class: 'x', onclick: remove, title: 'Kaldır' }, '✕'),
      el('div', { class: 'pt' }, OS.t(d.def.name).replace(' Pedalı', '').replace(' Pedal', '')),
      custom, ctrls,
      el('div', { class: 'foot' }, el('span', { class: 'mv', onclick: () => move(-1) }, '◀'), led,
        el('div', { class: 'sw', title: 'Aç / Kapat', onclick: () => { d.setBypass(!d.bypass); led.classList.toggle('on', !d.bypass); save(); } }),
        el('span', { class: 'mv', onclick: () => move(1) }, '▶')));
  }

  // ---------------- Ön ayarlar ve canlı mod ----------------
  function userRigs() { try { return JSON.parse(localStorage.getItem('os.rigs') || '{}'); } catch (e) { return {}; } }
  function presetList() {
    return Object.keys(OS.RIG_PRESETS).map(k => ({ key: 'f:' + k, name: k })).concat(Object.keys(userRigs()).map(k => ({ key: 'u:' + k, name: k })));
  }
  function loadPreset(v) {
    const kind = v.slice(0, 1), name = v.slice(2);
    let st;
    if (kind === 'f') st = { mode: 'single', pre: [], paths: [OS.RIG_PRESETS[name].map(([id, vals]) => ({ plugin: id, values: vals })), [], []], post: [], mix: defMix(), di: { on: false, lvl: -6, delay: 0 } };
    else { st = userRigs()[name]; if (!st) return; if (Array.isArray(st)) st = { mode: 'single', pre: [], paths: [st, [], []], post: [] }; }
    RG.state.currentPreset = v;
    RG.loadState(Object.assign({ mix: defMix(), di: { on: false, lvl: -6, delay: 0 } }, st));
  }
  function liveUI() {
    const list = presetList();
    const grid = el('div', { class: 'live-grid' });
    list.forEach((p, i) => grid.appendChild(el('button', { class: 'live-btn' + (RG.state.currentPreset === p.key ? ' on' : ''), onclick: () => loadPreset(p.key) },
      el('span', { class: 'live-n' }, String(i + 1)), el('span', null, p.name))));
    return el('div', { class: 'mini-box' }, el('div', { class: 'mini-title' }, 'Canlı mod'),
      el('div', { class: 'muted' }, 'Sahne için büyük ön ayar düğmeleri. MIDI ayak kontrolcünüzden Program Change (PC) mesajı gönderirseniz n. ön ayara geçilir (PC 0 = 1. düğme).'), grid);
  }
  function copyToTrack() {
    const t = OS.project.tracks.find(x => x.id === ui.selectedTrack && x.type === 'audio');
    if (!t) { U.toast(OS.t('Önce Aranjman’da bir ses parçası seçin')); return; }
    save();
    OS.history.push();
    t.inserts.forEach(d => d.dispose());
    const d = new OS.Device(E.ctx, 'gtr.rig', { extra: { rig: JSON.parse(JSON.stringify({ mode: RG.state.mode, pre: RG.state.pre, paths: RG.state.paths, post: RG.state.post, mix: RG.state.mix, di: RG.state.di })) } });
    t.inserts = [d];
    E.syncTrack(t); ui.changed(); ui.renderInspector();
    U.toast(OS.t('Rig parçaya kopyalandı') + ': ' + t.name);
  }
  let taps = [];

  // ---------------- Akort cihazı ----------------
  const hist = [];
  function tunerUI() {
    const tn = RG.state.tuner;
    tunerEls = { note: el('div', { class: 'note' }, '–'), ind: el('div', { class: 'ind' }), cents: el('div', { class: 'cents' }, ''), hz: el('div', { class: 'cents' }, '') };
    histCv = el('canvas', { class: 'tuner-hist' });
    return el('div', { class: 'tuner' }, tunerEls.note,
      el('div', null, el('div', { class: 'bar' }, el('div', { class: 'mid' }), tunerEls.ind), el('div', { class: 'row', style: 'margin-top:4px;gap:10px' }, tunerEls.cents, tunerEls.hz)),
      histCv,
      el('div', { style: 'display:flex;flex-direction:column;gap:3px' },
        el('label', { class: 'field', title: 'Referans La (A4) frekansı' }, 'A4', el('input', { type: 'number', min: 415, max: 466, step: 0.5, value: tn.ref, style: 'width:56px', onchange: e => { tn.ref = U.clamp(+e.target.value || 440, 415, 466); save(); } })),
        el('button', { class: 'btn sm' + (RG.tuning ? ' on' : ''), title: 'Akort ederken çıkışı susturur', onclick: e => { RG.tuning = !RG.tuning; tn.mute = true; e.target.classList.toggle('on', RG.tuning); applyOut(); } }, 'Sessiz akort')));
  }
  const mbuf = new Float32Array(1024);
  let envLevel = 0;
  // modülatörler (cihaz kimliğiyle bağlı)
  const MOD_TYPES = ['LFO Sinüs', 'LFO Üçgen', 'LFO Kare', 'Zarf izleyici (çalış gücü)', 'Adım sıralayıcı (8 adım)'];
  const RATES = [['0.25', '1 ölçü'], ['0.5', '1/2'], ['1', '1/4'], ['2', '1/8'], ['4', '1/16'], ['free', 'Serbest (Hz)']];
  function modsUI() {
    RG.state.mods = RG.state.mods || [];
    const all = RG.g.all();
    const box = el('div', { class: 'mini-box' }, el('div', { class: 'mini-title' }, 'Modülatörler'),
      el('div', { class: 'muted' }, 'Bir LFO, zarf izleyici veya adım sıralayıcıyı zincirdeki herhangi bir düğmeye bağlayın (ör. wah pedalı, amfi gain, delay karışımı). Tempoya kilitli çalışır.'));
    RG.state.mods.forEach((m, i) => {
      const dev = all.find(d => d.id === m.devId), params = dev ? dev.def.params.filter(p => p.type !== 'choice' && p.type !== 'bool') : [];
      const devSel = el('select', { onchange: e => { m.devId = e.target.value; m.param = null; save(); RG.render(); } }, el('option', { value: '' }, '—'), all.map((d, k) => el('option', { value: d.id, selected: d.id === m.devId }, (k + 1) + '. ' + OS.t(d.def.name))));
      const parSel = el('select', { onchange: e => { m.param = e.target.value; m.base = dev.values[m.param]; save(); } }, el('option', { value: '' }, '—'), params.map(p => el('option', { value: p.id, selected: p.id === m.param }, p.name)));
      const steps = el('div', { class: 'mod-steps' });
      if (m.type === 4) for (let k = 0; k < 8; k++) { const b = el('div', { class: 'mod-step', style: { height: (8 + m.steps[k] * 30) + 'px' } }); b.addEventListener('mousedown', e => { const r = b.parentNode.getBoundingClientRect(); m.steps[k] = U.clamp(1 - (e.clientY - r.top) / r.height, 0, 1); save(); RG.render(); }); steps.appendChild(b); }
      box.appendChild(el('div', { class: 'row mod-row' },
        el('select', { onchange: e => { m.type = +e.target.value; save(); RG.render(); } }, MOD_TYPES.map((t, k) => el('option', { value: k, selected: k === m.type }, t))),
        el('label', { class: 'field' }, 'Hız', el('select', { onchange: e => { m.rate = e.target.value; save(); } }, RATES.map(([v, l]) => el('option', { value: v, selected: v === m.rate }, l)))),
        U.knob({ label: 'Hz', size: 30, min: 0.05, max: 12, def: 1, value: m.hz, curve: 'log', fmt: v => v.toFixed(2), onchange: v => { m.hz = v; save(); } }),
        U.knob({ label: 'Derinlik', size: 30, min: 0, max: 1, def: 0.5, value: m.depth, fmt: v => Math.round(v * 100) + '%', onchange: v => { m.depth = v; save(); } }),
        el('span', null, '→'), devSel, parSel, steps,
        el('button', { class: 'btn sm', onclick: () => { RG.state.mods.splice(i, 1); save(); RG.render(); } }, '✕')));
    });
    box.appendChild(el('button', { class: 'btn sm', onclick: () => { RG.state.mods.push({ type: 0, rate: '1', hz: 1, depth: 0.5, devId: all[0] && all[0].id, param: null, steps: [1, 0.2, 0.6, 0.2, 1, 0.4, 0.8, 0.1] }); save(); RG.render(); } }, '+ Modülatör'));
    return box;
  }
  setInterval(() => {
    if (!RG.on || !RG.g || !RG.state.mods || !RG.state.mods.length) return;
    const now = E.ctx.currentTime, bps = OS.transport.bpm / 60, all = RG.g.all();
    an.getFloatTimeDomainData(mbuf);
    let rms = 0; for (let i = 0; i < mbuf.length; i++) rms += mbuf[i] * mbuf[i]; rms = Math.sqrt(rms / mbuf.length);
    envLevel = Math.max(rms * 4, envLevel * 0.9);
    RG.state.mods.forEach(m => {
      const d = all.find(x => x.id === m.devId); if (!d || !m.param) return;
      const p = d.def.params.find(x => x.id === m.param); if (!p) return;
      if (m.base == null) m.base = d.values[m.param];
      const hz = m.rate === 'free' ? m.hz : bps * +m.rate, ph = (now * hz) % 1;
      let v;
      if (m.type === 0) v = 0.5 + 0.5 * Math.sin(ph * 2 * Math.PI);
      else if (m.type === 1) v = ph < 0.5 ? ph * 2 : 2 - ph * 2;
      else if (m.type === 2) v = ph < 0.5 ? 1 : 0;
      else if (m.type === 3) v = Math.min(1, envLevel);
      else v = m.steps[Math.floor((now * hz * 8) % 8)];
      d.setParam(m.param, OS.auto.denorm(p, U.clamp(OS.auto.norm(p, m.base) + (v - 0.5) * m.depth, 0, 1)));
    });
  }, 20);

  const tb = new Float32Array(2048);
  setInterval(() => {
    if (!RG.on || !an || !root.classList.contains('active') || !tunerEls) return;
    an.getFloatTimeDomainData(tb);
    const f = U.detectPitch(tb, E.ctx.sampleRate), ref = (RG.state.tuner && RG.state.tuner.ref) || 440;
    if (f <= 0 || f > 1500) { tunerEls.note.style.color = 'var(--fg3)'; hist.push(null); }
    else {
      const n = 69 + 12 * Math.log2(f / ref), r = Math.round(n), c = Math.round((n - r) * 100);
      tunerEls.note.textContent = U.NOTE_NAMES[((r % 12) + 12) % 12];
      tunerEls.note.style.color = Math.abs(c) <= 3 ? '#39c27a' : Math.abs(c) <= 15 ? '#e5d43a' : '#ef4444';
      tunerEls.ind.style.left = (50 + c) + '%';
      tunerEls.cents.textContent = (c > 0 ? '+' : '') + c + ' cent';
      tunerEls.hz.textContent = f.toFixed(1) + ' Hz';
      hist.push(c);
    }
    while (hist.length > 120) hist.shift();
    // perde izleme grafiği (zaman içinde cent sapması)
    if (histCv && histCv.isConnected) {
      const w = histCv.width = histCv.clientWidth, h = histCv.height = histCv.clientHeight, g = histCv.getContext('2d');
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(57,194,122,.18)'; g.fillRect(0, h / 2 - h * 0.05, w, h * 0.1);
      g.strokeStyle = '#eeeeee'; g.beginPath(); let started = false;
      hist.forEach((c, i) => { if (c == null) { started = false; return; } const x = i / 119 * w, y = h / 2 - c / 50 * (h / 2); started ? g.lineTo(x, y) : g.moveTo(x, y); started = true; });
      g.stroke();
    }
  }, 60);
})(window.OS);
