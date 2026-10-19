(() => {
  const RATE = 48000;
  const PRE = 2;
  const TAIL = 6;
  const CONTROL_RATE = 400;
  const CEILING_DB = -1.5;
  const TARGET_LUFS = -16;
  const LUFS_TOLERANCE = 0.05;
  const COMPRESSOR_LOOKAHEAD = 0.006;
  const TAU = Math.PI * 2;
  const TOP = { shelfDb: -6, lowpassHz: 11000, maxHz: 6500 };

  const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
  const dbGain = (db) => 10 ** (db / 20);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const wrap = (x, n) => ((x % n) + n) % n;

  function rng(seed) {
    let a = Math.floor(seed * 2654435761) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Times in [from, to) where fn(t) changes value, scanned at 1 ms, at least minGap apart. */
  function steps(fn, from, to, minGap = 0) {
    const out = [];
    let prev = fn(from);
    for (let t = from + 0.001; t < to; t += 0.001) {
      const v = fn(t);
      if (v !== prev && (!out.length || t - out[out.length - 1] >= minGap)) out.push(Math.round(t * 1000) / 1000);
      prev = v;
    }
    return out;
  }

  function grid(score, length, preset) {
    const want = score.tempo?.beat ?? 60 / preset.bpm;
    const bars = Math.max(1, Math.round(length / (4 * want)));
    const beat = length / (bars * 4);
    const phase = wrap(score.tempo?.on ?? 0, beat);
    return { bars, beat, phase, bpm: 60 / beat, at: (beatIndex) => phase + beatIndex * beat };
  }

  function noiseBuffer(ctx, seconds, seed) {
    const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
    const d = buf.getChannelData(0), r = rng(seed);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    return buf;
  }

  function impulse(ctx, seconds, damp, seed) {
    const n = Math.ceil(seconds * ctx.sampleRate), pre = Math.round(0.012 * ctx.sampleRate);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c), r = rng(seed + c * 17);
      let lp = 0;
      for (let i = pre; i < n; i++) {
        const x = (i - pre) / (n - pre);
        const k = clamp(0.5 - damp * x, 0.03, 0.9);
        lp += k * ((r() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - x, 3) * Math.exp(-4 * x);
      }
    }
    return buf;
  }

  function voiceKit(ctx, buses, key, top) {
    const noise = noiseBuffer(ctx, 4, 7);
    const T = (t) => t + PRE;

    function envelope(param, t, { a = 0.005, h = 0, d = 0.2, peak = 1 }) {
      param.setValueAtTime(0, t);
      param.linearRampToValueAtTime(peak, t + a);
      if (h > 0) param.setValueAtTime(peak, t + a + h);
      param.exponentialRampToValueAtTime(Math.max(peak * 0.001, 1e-6), t + a + h + d);
      param.linearRampToValueAtTime(0, t + a + h + d + 0.02);
      return t + a + h + d + 0.03;
    }

    /** A voice's gain, panner and reverb send; once `source` has ended they leave the graph, so finished voices cost nothing to render. */
    function chain(out, pan, send, source) {
      const g = ctx.createGain();
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p).connect(out);
      const s = send ? ctx.createGain() : null;
      if (s) {
        s.gain.value = send;
        p.connect(s).connect(buses.verb);
      }
      if (source) source.onended = () => [g, p, s].forEach((node) => node?.disconnect());
      return g;
    }

    function tone({ t, f, from, glide = 0.03, type = "sine", a, h, d, gain = 0.2, out = buses.sfx, pan = 0, send = 0.2, detune = 0 }) {
      if (f > top.maxHz) return;
      const at = T(t);
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      o.frequency.setValueAtTime(from ?? f, at);
      if (from) o.frequency.exponentialRampToValueAtTime(f, at + glide);
      const g = chain(out, pan, send, o);
      const end = envelope(g.gain, at, { a, h, d, peak: gain });
      o.connect(g);
      o.start(at);
      o.stop(end);
    }

    function hiss({ t, f, to, q = 1, type = "bandpass", a, h = 0, d, gain = 0.1, out = buses.sfx, pan = 0, send = 0.15, seed = 0 }) {
      const at = T(t);
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bq = ctx.createBiquadFilter();
      bq.type = type;
      bq.Q.value = q;
      bq.frequency.setValueAtTime(Math.min(f, top.maxHz), at);
      if (to) bq.frequency.exponentialRampToValueAtTime(Math.min(to, top.maxHz), at + (a ?? 0.005) + h + d);
      const g = chain(out, pan, send, src);
      const end = envelope(g.gain, at, { a, h, d, peak: gain });
      src.connect(bq).connect(g);
      src.start(at, rng(seed + t * 1000)() * 3);
      src.stop(end);
    }

    function struck({ t, f, partials, d = 0.6, gain = 0.2, out = buses.sfx, pan = 0, send = 0.25, a = 0.003 }) {
      partials.forEach(([ratio, level, decay]) => tone({ t, f: f * ratio, a, d: d * decay, gain: gain * level, out, pan, send }));
    }

    return { ctx, buses, key, top, tone, hiss, struck, hz, T, envelope, chain };
  }

  function automate(param, fn, length) {
    const span = PRE + length + TAIL, n = Math.ceil(span * CONTROL_RATE) + 1;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = fn(i / CONTROL_RATE - PRE);
    param.setValueCurveAtTime(curve, 0, span);
  }

  function sectionLevel(sections, mixes, layer, length) {
    if (!sections.length) return () => 1;
    const sorted = [...sections].sort((p, q) => p.at - q.at);
    const level = (s) => mixes[s.mix]?.[layer] ?? 0;
    return (x) => {
      const u = wrap(x, length);
      const next = sorted.findIndex((s) => s.at > u);
      const i = (next <= 0 ? sorted.length : next) - 1;
      const cur = sorted[i], prev = sorted[(i - 1 + sorted.length) % sorted.length];
      const since = wrap(u - cur.at, length), fade = cur.fade ?? 0.05;
      return since < fade ? level(prev) + (level(cur) - level(prev)) * (since / fade) : level(cur);
    };
  }

  /** Which section each bar plays, read one beat after its downbeat, with how many bars of that section came before and remain. */
  function barSections(sections, g, length) {
    const sorted = [...sections].sort((p, q) => p.at - q.at);
    const indexAt = (x) => sorted.reduce((found, s, i) => (s.at <= wrap(x, length) ? i : found), sorted.length - 1);
    const index = Array.from({ length: g.bars }, (_, bar) => indexAt(g.at(bar * 4 + 1)));
    const since = [], left = [];
    index.forEach((s, b) => (since[b] = b && index[b - 1] === s ? since[b - 1] + 1 : 0));
    for (let b = g.bars - 1; b >= 0; b--) left[b] = b < g.bars - 1 && index[b + 1] === index[b] ? left[b + 1] + 1 : 1;
    return index.map((s, b) => ({ mix: sorted[s]?.mix, since: since[b], left: left[b] }));
  }

  function duckCurve(cues, sfx, length) {
    const dips = cues.map((c) => ({ at: c.at, depth: sfx[c.sfx]?.duck ?? 0.3 }));
    return (x) => {
      let g = 1;
      for (const k of [-1, 0, 1]) for (const d of dips) {
        const dt = x - (d.at + k * length);
        if (dt < -0.02 || dt > 0.45) continue;
        const shape = dt < 0 ? 1 + dt / 0.02 : Math.exp(-dt / 0.12);
        g = Math.min(g, 1 - d.depth * clamp(shape));
      }
      return g;
    };
  }

  async function renderPass(score, length) {
    const preset = MUSIC[score.music];
    if (!preset) throw new Error(`Unknown music preset "${score.music}"`);
    const kit = { ...SFX, ...preset.sfx };
    const unknown = score.cues.filter((c) => !kit[c.sfx]).map((c) => c.sfx);
    if (unknown.length) throw new Error(`Unknown sfx: ${[...new Set(unknown)].join(", ")}`);
    const sections = score.sections ?? [];
    const noMix = sections.filter((s) => !preset.mixes[s.mix]).map((s) => s.mix);
    if (noMix.length) throw new Error(`Music preset "${score.music}" has no mix ${[...new Set(noMix)].join(", ")}`);
    const top = { ...TOP, ...preset.top };

    const span = PRE + length + TAIL;
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(span * RATE), sampleRate: RATE });
    const master = ctx.createGain();
    const hp1 = ctx.createBiquadFilter(), hp2 = ctx.createBiquadFilter(), shelf = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter();
    hp1.type = hp2.type = "highpass";
    hp1.frequency.value = hp2.frequency.value = 90;
    hp1.Q.value = hp2.Q.value = 0.6;
    shelf.type = "highshelf";
    shelf.frequency.value = 6000;
    shelf.gain.value = top.shelfDb;
    lp.type = "lowpass";
    lp.frequency.value = top.lowpassHz;
    lp.Q.value = 0.5;
    master.connect(hp1).connect(hp2).connect(shelf).connect(lp).connect(ctx.destination);

    const music = ctx.createGain(), sfx = ctx.createGain(), verb = ctx.createGain();
    const room = ctx.createConvolver();
    room.normalize = true;
    room.buffer = impulse(ctx, preset.room.seconds, preset.room.damp, 3);
    const wet = ctx.createGain();
    wet.gain.value = preset.room.wet;
    verb.connect(room).connect(wet).connect(master);
    music.gain.value = dbGain(preset.musicDb);
    sfx.gain.value = dbGain(preset.sfxDb);
    const duck = ctx.createGain();
    duck.gain.value = 0;
    automate(duck.gain, duckCurve(score.cues, kit, length), length);
    music.connect(duck).connect(master);
    sfx.connect(master);

    const g = grid(score, length, preset);
    const layers = {};
    for (const name of Object.keys(preset.layers)) {
      const bus = ctx.createGain();
      bus.gain.value = 0;
      const level = sectionLevel(sections, preset.mixes, name, length);
      automate(bus.gain, level, length);
      bus.connect(music);
      layers[name] = { bus, level };
    }

    const v = voiceKit(ctx, { music, sfx, verb }, preset.key, top);
    const sixteenth = g.beat / 4;
    const totalSteps = g.bars * 16;
    const barSection = barSections(sections, g, length);
    for (let s = 0; s < totalSteps; s++) {
      const t = g.phase + s * sixteenth;
      const bar = Math.floor(s / 16);
      const place = { bar, bars: g.bars, ...barSection[bar] };
      const chord = preset.chord(place);
      for (const [name, play] of Object.entries(preset.layers)) {
        const { bus, level } = layers[name];
        if (level(t) <= 0.001 && level(t + g.beat) <= 0.001) continue;
        play({ ...v, out: bus }, { ...place, t, step: s % 16, chord, beat: g.beat, seed: s });
      }
    }
    score.cues.forEach((cue, i) => {
      if (cue.at < 0 || cue.at >= length) throw new Error(`Cue ${cue.sfx} at ${cue.at} is outside the film`);
      kit[cue.sfx].play(v, { ...cue, step: cue.step ?? 0, seed: i, beat: g.beat });
    });

    return ctx.startRendering();
  }

  function fold(raw, length) {
    const n = Math.round(length * RATE), pre = Math.round(PRE * RATE);
    return [0, 1].map((c) => {
      const src = raw.getChannelData(c), out = new Float32Array(n);
      for (let j = 0; j < src.length; j++) out[wrap(j - pre, n)] += src[j];
      return out;
    });
  }

  async function compress(chs, preset) {
    const n = chs[0].length, lookahead = Math.round(COMPRESSOR_LOOKAHEAD * RATE);
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: n * 2 + lookahead, sampleRate: RATE });
    const buf = ctx.createBuffer(2, n, RATE);
    chs.forEach((d, c) => buf.copyToChannel(d, c));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const comp = ctx.createDynamicsCompressor();
    Object.entries(preset.glue).forEach(([k, val]) => (comp[k].value = val));
    src.connect(comp).connect(ctx.destination);
    src.start(0);
    const out = await ctx.startRendering();
    return [0, 1].map((c) => out.getChannelData(c).slice(n + lookahead, 2 * n + lookahead));
  }

  const K_SHELF = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] };
  const K_HIGH = { b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] };
  function biquadPeriodic(x, { b, a }) {
    const n = x.length, y = new Float32Array(n);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
      const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
      if (pass) y[i] = v;
    }
    return y;
  }

  /** Integrated loudness per ITU-R BS.1770-4 (48 kHz K-weighting, 400 ms blocks, absolute and relative gates), treating the buffer as a loop. */
  function lufs(chs) {
    const n = chs[0].length, block = Math.round(0.4 * RATE), hop = Math.round(0.1 * RATE);
    const prefix = chs.map((d) => {
      const k = biquadPeriodic(biquadPeriodic(d, K_SHELF), K_HIGH), sum = new Float64Array(2 * n + 1);
      for (let i = 0; i < 2 * n; i++) sum[i + 1] = sum[i] + k[i % n] * k[i % n];
      return sum;
    });
    const powers = [];
    for (let start = 0; start < n; start += hop) powers.push(prefix.reduce((p, sum) => p + (sum[start + block] - sum[start]) / block, 0));
    const loud = (p) => -0.691 + 10 * Math.log10(p);
    const mean = (ps) => ps.reduce((a, b) => a + b, 0) / ps.length;
    const abs = powers.filter((p) => loud(p) > -70);
    if (!abs.length) return -Infinity;
    const rel = loud(mean(abs)) - 10;
    return loud(mean(abs.filter((p) => loud(p) > rel)));
  }

  function limit(chs, ceilingDb) {
    const n = chs[0].length, ceiling = dbGain(ceilingDb), L = Math.round(0.005 * RATE), rel = Math.exp(-1 / (0.12 * RATE));
    const need = new Float32Array(n);
    for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(chs[0][i]), Math.abs(chs[1][i])); need[i] = p > ceiling ? ceiling / p : 1; }
    const total = 2 * n, r = new Float32Array(total), dq = new Int32Array(total + L);
    let head = 0, tail = 0, g = 1;
    for (let j = 0; j < total + L; j++) {
      const v = need[j % n];
      while (tail > head && need[dq[tail - 1] % n] >= v) tail--;
      dq[tail++] = j;
      const i = j - L;
      if (i < 0) continue;
      while (dq[head] < i) head++;
      const m = need[dq[head] % n];
      g = Math.min(m, g + (1 - g) * (1 - rel));
      r[i] = g;
    }
    const out = chs.map(() => new Float32Array(n));
    let acc = 0;
    for (let i = 0; i < total; i++) {
      acc += r[i];
      if (i > L) acc -= r[i - L - 1];
      if (i < n) continue;
      const gain = acc / (L + 1), k = i - n;
      chs.forEach((d, c) => (out[c][k] = d[k] * gain));
    }
    return out;
  }

  const peakDb = (chs) => 20 * Math.log10(Math.max(...chs.map((d) => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0))));

  /** Renders a score to one seamless loop of `length` seconds: 48 kHz stereo, about −16 LUFS, peaks below −1 dBFS. */
  async function renderScore(score, length) {
    const preset = MUSIC[score.music];
    const raw = await renderPass(score, length);
    let chs = await compress(fold(raw, length), preset);
    for (let pass = 0, miss = TARGET_LUFS - lufs(chs); pass < 4 && Math.abs(miss) > LUFS_TOLERANCE; pass++, miss = TARGET_LUFS - lufs(chs)) {
      const gain = dbGain(miss);
      chs = limit(chs.map((d) => d.map((s) => s * gain)), CEILING_DB);
    }
    const buffer = new AudioBuffer({ length: chs[0].length, numberOfChannels: 2, sampleRate: RATE });
    chs.forEach((d, c) => buffer.copyToChannel(d, c));
    return buffer;
  }

  const PIANO = [[1, 1, 1], [2.002, 0.42, 0.7], [3.006, 0.2, 0.45], [4.012, 0.1, 0.3], [5.02, 0.05, 0.2]];
  const CELESTA = [[1, 1, 1], [4.01, 0.18, 0.35], [8.03, 0.04, 0.15]];
  const GLASS = [[1, 1, 1], [2.76, 0.28, 0.5], [5.4, 0.08, 0.25]];

  const SUITE_CHORDS = [
    { root: 39, pad: [55, 58, 62, 65] },
    { root: 43, pad: [58, 62, 65, 67] },
    { root: 44, pad: [56, 60, 62, 67] },
    { root: 46, pad: [56, 60, 63, 65] },
  ];

  function piano(v, { t, f, gain, pan = 0, out, d = 2.6 }) {
    v.struck({ t, f, partials: PIANO, d, gain, out, pan, send: 0.35, a: 0.004 });
    v.hiss({ t, f: 900, type: "lowpass", a: 0.001, d: 0.02, gain: gain * 0.15, out, pan, send: 0.05, seed: t * 7 });
  }

  const SUITE = {
    bpm: 79,
    key: { root: 63, scale: [0, 2, 4, 7, 9] },
    room: { seconds: 3.2, damp: 0.5, wet: 0.75 },
    musicDb: -2,
    sfxDb: 0,
    glue: { threshold: -22, knee: 14, ratio: 2, attack: 0.02, release: 0.35 },
    chord: ({ bar, bars }) => (bar >= bars - 2 ? SUITE_CHORDS[2 + bar - (bars - 2)] : SUITE_CHORDS[bar % 4]),
    mixes: {
      open: { pad: 0.9, piano: 0.7, air: 0.6 },
      flow: { pad: 0.7, piano: 0.85, bass: 0.9, pulse: 0.7, brush: 0.6 },
      lift: { pad: 0.7, piano: 0.85, bass: 0.9, pulse: 0.8, brush: 0.7, shimmer: 0.7 },
      calm: { pad: 0.8, piano: 0.6, bass: 0.7, air: 0.4 },
      hold: { pad: 0.45 },
      end: { pad: 0.9, piano: 0.6, shimmer: 0.6, air: 0.5 },
    },
    layers: {
      pad(v, n) {
        if (n.step !== 0) return;
        const dur = n.beat * 4;
        n.chord.pad.forEach((m, i) => [-9, 9].forEach((cents) => {
          const at = v.T(n.t), o = v.ctx.createOscillator(), f = v.ctx.createBiquadFilter();
          o.type = i % 2 ? "triangle" : "sawtooth";
          o.frequency.value = hz(m);
          o.detune.value = cents;
          f.type = "lowpass";
          f.frequency.setValueAtTime(600, at);
          f.frequency.linearRampToValueAtTime(1500, at + dur * 0.55);
          f.frequency.linearRampToValueAtTime(700, at + dur + 1.2);
          f.Q.value = 0.3;
          const g = v.chain(v.out, Math.sign(cents) * (0.35 + 0.12 * i), 0.6);
          g.gain.setValueAtTime(0, at);
          g.gain.linearRampToValueAtTime(0.018, at + 0.9);
          g.gain.setValueAtTime(0.018, at + dur - 0.1);
          g.gain.linearRampToValueAtTime(0, at + dur + 1.2);
          o.connect(f).connect(g);
          o.start(at);
          o.stop(at + dur + 1.25);
        }));
      },
      piano(v, n) {
        const pattern = { 0: [0, 1], 4: [2, 0.7], 6: [3, 0.6], 10: [1, 0.65], 12: [2, 0.55] };
        const p = pattern[n.step];
        if (!p) return;
        const m = n.chord.pad[p[0]] + 12;
        piano(v, { t: n.t, f: hz(m), gain: 0.085 * p[1], pan: (p[0] - 1.5) * 0.18, out: v.out });
      },
      bass(v, n) {
        const hits = { 0: 0.95, 10: 0.5 };
        const level = hits[n.step];
        if (!level) return;
        const at = v.T(n.t), dur = n.step === 0 ? n.beat * 2.4 : n.beat * 1.2;
        const o = v.ctx.createOscillator(), f = v.ctx.createBiquadFilter();
        o.type = "triangle";
        o.frequency.value = hz(n.chord.root);
        f.type = "lowpass";
        f.frequency.value = 520;
        const g = v.chain(v.out, 0, 0);
        const end = v.envelope(g.gain, at, { a: 0.03, h: dur * 0.5, d: dur, peak: 0.2 * level });
        o.connect(f).connect(g);
        o.start(at);
        o.stop(end);
      },
      pulse(v, n) {
        if (n.step % 2) return;
        const m = n.chord.pad[(n.step / 2) % 2 ? 1 : 0];
        const at = v.T(n.t), o = v.ctx.createOscillator(), f = v.ctx.createBiquadFilter();
        o.type = "square";
        o.frequency.value = hz(m);
        f.type = "lowpass";
        f.frequency.setValueAtTime(1100, at);
        f.frequency.exponentialRampToValueAtTime(380, at + 0.12);
        const g = v.chain(v.out, n.step % 4 ? 0.25 : -0.25, 0.2);
        const end = v.envelope(g.gain, at, { a: 0.004, d: 0.16, peak: n.step % 8 ? 0.016 : 0.024 });
        o.connect(f).connect(g);
        o.start(at);
        o.stop(end);
      },
      brush(v, n) {
        if (n.step !== 4 && n.step !== 12) return;
        v.hiss({ t: n.t, f: 2600, type: "bandpass", q: 0.6, a: 0.02, d: 0.22, gain: 0.03, out: v.out, pan: 0.15, send: 0.3, seed: n.seed });
      },
      shimmer(v, n) {
        if (n.step !== 0 && n.step !== 8) return;
        const m = n.chord.pad[n.step ? 3 : 2] + 24;
        v.struck({ t: n.t, f: hz(m), partials: CELESTA, d: 1.8, gain: 0.035, out: v.out, pan: n.step ? 0.4 : -0.4, send: 0.6 });
      },
      air(v, n) {
        if (n.step !== 0) return;
        v.hiss({ t: n.t, f: 2400, to: 3400, q: 0.5, a: n.beat * 2, h: 0, d: n.beat * 2.5, gain: 0.012, out: v.out, pan: 0, send: 0.4, seed: n.seed });
      },
    },
  };

  const degree = (key, step, octave = 0) => hz(key.root + 12 * (octave + Math.floor(step / key.scale.length)) + key.scale[wrap(step, key.scale.length)]);

  const SFX = {
    key: { duck: 0, play: (v, c) => {
      const r = rng(c.seed + 5);
      v.hiss({ t: c.at, f: 1300 + 500 * r(), q: 1.4, a: 0.002, d: 0.022, gain: 0.04 + 0.02 * r(), pan: (r() - 0.5) * 0.5, send: 0.05, seed: c.seed });
      v.tone({ t: c.at, f: 210 + 30 * r(), a: 0.002, d: 0.018, gain: 0.03, send: 0 });
    } },
    send: { duck: 0.25, play: (v, c) => {
      v.hiss({ t: c.at, f: 700, to: 2600, q: 0.9, a: 0.05, d: 0.2, gain: 0.05, pan: 0.15, send: 0.3, seed: c.seed });
      piano(v, { t: c.at + 0.04, f: degree(v.key, 3, 1), gain: 0.08, pan: 0.15 });
    } },
    click: { duck: 0.08, play: (v, c) => {
      v.hiss({ t: c.at, f: 2200, q: 1.8, a: 0.001, d: 0.01, gain: 0.05, send: 0.03, seed: c.seed });
    } },
    air: { duck: 0, play: (v, c) => {
      v.hiss({ t: c.at, f: 1800, to: 3600, q: 0.6, a: 1.2, d: 1.4, gain: 0.045, send: 0.6, seed: c.seed });
      [4, 7].forEach((s, i) => v.struck({ t: c.at + 0.5 + i * 0.35, f: degree(v.key, s, 1), partials: CELESTA, d: 1.6, gain: 0.025, pan: i ? 0.4 : -0.4, send: 0.7 }));
    } },
    notify: { duck: 0.35, play: (v, c) => {
      [[4, 0], [7, 0.13]].forEach(([s, dt]) => v.struck({ t: c.at + dt, f: degree(v.key, s, 0), partials: GLASS, d: 1.3, gain: 0.12, pan: 0.2, send: 0.45 }));
    } },
    memory: { duck: 0.45, play: (v, c) => {
      [3, 5, 7].forEach((s, i) => v.struck({ t: c.at + i * c.beat / 2, f: degree(v.key, s, 0), partials: CELESTA, d: 1.8, gain: 0.13, pan: (i - 1) * 0.25, send: 0.55 }));
      piano(v, { t: c.at + c.beat, f: degree(v.key, 0, -1), gain: 0.07, d: 3 });
    } },
    echo: { duck: 0.2, play: (v, c) => {
      [5, 7].forEach((s, i) => v.struck({ t: c.at + i * c.beat / 2, f: degree(v.key, s, 0), partials: CELESTA, d: 1.4, gain: 0.06, pan: 0.3, send: 0.6 }));
    } },
    dawn: { duck: 0.15, play: (v, c) => {
      v.hiss({ t: c.at - 0.3, f: 1200, to: 3200, q: 0.7, a: 0.3, d: 0.6, gain: 0.04, send: 0.5, seed: c.seed });
      v.struck({ t: c.at, f: degree(v.key, 2, 1), partials: GLASS, d: 1.6, gain: 0.05, pan: -0.2, send: 0.6 });
    } },
    pop: { duck: 0.06, play: (v, c) => {
      const f = degree(v.key, c.step, 1);
      v.tone({ t: c.at, f, from: f * 0.75, glide: 0.03, a: 0.003, d: 0.12, gain: 0.05, pan: ((c.step % 3) - 1) * 0.25, send: 0.3 });
    } },
    glow: { duck: 0.1, play: (v, c) => {
      v.struck({ t: c.at, f: degree(v.key, c.step % 2 ? 2 : 0, 0), partials: GLASS, d: 1.1, gain: 0.05, send: 0.5 });
    } },
    whoosh: { duck: 0.25, play: (v, c) => {
      v.hiss({ t: c.at - 0.45, f: 320, to: 2200, q: 0.7, a: 0.4, d: 0.3, gain: 0.1, pan: 0.3, send: 0.35, seed: c.seed });
    } },
    bell: { duck: 0.4, play: (v, c) => {
      v.struck({ t: c.at, f: degree(v.key, 0, 1), partials: [[1, 1, 1], [2.4, 0.35, 0.6], [3.9, 0.15, 0.35], [5.1, 0.06, 0.2]], d: 1.8, gain: 0.15, pan: 0.25, send: 0.5 });
      v.struck({ t: c.at + 0.12, f: degree(v.key, 2, 1), partials: GLASS, d: 1.2, gain: 0.06, pan: 0.25, send: 0.5 });
    } },
    lock: { duck: 0.3, play: (v, c) => {
      v.hiss({ t: c.at, f: 2600, q: 2.2, a: 0.001, d: 0.008, gain: 0.09, send: 0.1, seed: c.seed });
      v.hiss({ t: c.at + 0.045, f: 1900, q: 2.2, a: 0.001, d: 0.012, gain: 0.1, send: 0.1, seed: c.seed + 3 });
      v.tone({ t: c.at + 0.045, f: 175, from: 230, glide: 0.02, a: 0.002, d: 0.07, gain: 0.12, send: 0.05 });
    } },
    plug: { duck: 0.3, play: (v, c) => {
      v.tone({ t: c.at, f: 95, from: 140, glide: 0.04, a: 0.002, d: 0.1, gain: 0.2, send: 0.05 });
      v.hiss({ t: c.at, f: 1500, q: 1.5, a: 0.001, d: 0.014, gain: 0.1, send: 0.08, seed: c.seed });
      v.tone({ t: c.at + 0.01, f: degree(v.key, 4, 0), a: 0.002, d: 0.09, gain: 0.04, send: 0.2 });
    } },
    toggle: { duck: 0.25, play: (v, c) => {
      v.hiss({ t: c.at, f: 2400, q: 2, a: 0.001, d: 0.01, gain: 0.07, send: 0.05, seed: c.seed });
      [[2, 0.02], [4, 0.09]].forEach(([s, dt]) => v.tone({ t: c.at + dt, f: degree(v.key, s, 1), a: 0.003, d: 0.12, gain: 0.06, send: 0.3 }));
    } },
    sting: { duck: 0.6, play: (v, c) => {
      [0, 2, 4, 1].forEach((s, i) => piano(v, { t: c.at + i * 0.012, f: degree(v.key, s, i === 3 ? 1 : 0), gain: 0.1, d: 3.5, pan: (i - 1.5) * 0.2 }));
      v.struck({ t: c.at + c.beat / 2, f: degree(v.key, 0, 2), partials: GLASS, d: 2.2, gain: 0.06, send: 0.7 });
      v.hiss({ t: c.at - 0.6, f: 900, to: 3000, q: 0.6, a: 0.58, d: 0.5, gain: 0.04, send: 0.5, seed: c.seed });
    } },
  };

  const SPARKLE = [[1, 1, 1], [2.01, 0.3, 0.5], [3.02, 0.12, 0.3], [5.4, 0.05, 0.15]];
  const GLASS_BRIGHT = [[1, 1, 1], [2.76, 0.35, 0.5], [5.4, 0.15, 0.3], [8.9, 0.06, 0.15]];
  const GLOCK = [[1, 1, 1], [2.76, 0.32, 0.45], [5.4, 0.12, 0.22], [8.93, 0.05, 0.1]];
  const EP = [[1, 1, 1], [2, 0.32, 0.45], [3, 0.1, 0.25], [7.02, 0.04, 0.08]];
  const BRIGHT_TOP = { shelfDb: 0, lowpassHz: 15000, maxHz: 12000 };

  function synth(v, { t, f, type = "sawtooth", detune = 0, a = 0.003, h = 0, d = 0.2, gain = 0.1, pan = 0, send = 0.2, cut = 4000, cutTo, cutIn = 0.1, q = 0.7, out = v.out ?? v.buses.sfx }) {
    const at = v.T(t), o = v.ctx.createOscillator(), fl = v.ctx.createBiquadFilter();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    fl.type = "lowpass";
    fl.Q.value = q;
    fl.frequency.setValueAtTime(cut, at);
    if (cutTo) fl.frequency.exponentialRampToValueAtTime(cutTo, at + cutIn);
    const g = v.chain(out, pan, send, o);
    const end = v.envelope(g.gain, at, { a, h, d, peak: gain });
    o.connect(fl).connect(g);
    o.start(at);
    o.stop(end);
  }

  function pumpedChord(v, { t, notes, beat, gain, cut, depth, send = 0.25 }) {
    const at = v.T(t), end = at + 4 * beat;
    [-1, 1].forEach((side) => {
      const fl = v.ctx.createBiquadFilter();
      fl.type = "lowpass";
      fl.frequency.value = cut;
      fl.Q.value = 0.8;
      const oscs = notes.map((m, i) => {
        const o = v.ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = hz(m);
        o.detune.value = side * (9 + 3 * i);
        o.connect(fl);
        o.start(at);
        o.stop(end + 0.03);
        return o;
      });
      const g = v.chain(v.out, side * 0.55, send, oscs[0]);
      g.gain.setValueAtTime(0, at);
      for (let k = 0; k < 4; k++) {
        const b = at + k * beat;
        if (k) g.gain.setValueAtTime(gain, b - 0.01);
        g.gain.linearRampToValueAtTime(gain * (1 - depth), b + 0.012);
        g.gain.linearRampToValueAtTime(gain, b + beat * 0.55);
      }
      g.gain.setValueAtTime(gain, end - 0.01);
      g.gain.linearRampToValueAtTime(0, end + 0.012);
      fl.connect(g);
    });
  }

  /** Each section plays its own progression from its first bar; a build is aligned to its last bar so it always lands on the dominant. */
  const progression = (chords, table) => ({ mix, since, left }) => {
    const names = table[mix] ?? Object.values(table)[0];
    const i = mix === "build" ? names.length - 1 - ((left - 1) % names.length) : since % names.length;
    return chords[names[i]];
  };
  const hook = (notes) => new Map(notes.map(([step, m, len]) => [step, { m, len }]));
  const hookNote = (phrase, n, fromBar = 0) => phrase.get(((n.since + fromBar) % 4) * 16 + n.step);
  const rise = (n) => (n.since + n.step / 16) / (n.since + n.left);

  const BRIGHT = {
    key: { duck: 0, play: (v, c) => {
      const r = rng(c.seed + 5);
      v.hiss({ t: c.at, f: 3600 + 1200 * r(), q: 1.6, a: 0.0006, d: 0.012, gain: 0.05 + 0.02 * r(), pan: (r() - 0.5) * 0.5, send: 0.04, seed: c.seed });
      v.hiss({ t: c.at, f: 9000, q: 1, a: 0.0004, d: 0.004, gain: 0.03, pan: (r() - 0.5) * 0.5, send: 0, seed: c.seed + 1 });
      v.tone({ t: c.at, f: 420 + 60 * r(), a: 0.001, d: 0.014, gain: 0.03, send: 0 });
    } },
    click: { duck: 0.1, play: (v, c) => {
      v.hiss({ t: c.at, f: 3400, q: 2, a: 0.0005, d: 0.007, gain: 0.1, send: 0.05, seed: c.seed });
      v.hiss({ t: c.at, f: 9000, q: 1, a: 0.0004, d: 0.004, gain: 0.04, send: 0, seed: c.seed + 1 });
      v.tone({ t: c.at, f: degree(v.key, 0, 1), a: 0.001, d: 0.03, gain: 0.045, send: 0.05 });
    } },
    send: { duck: 0.25, play: (v, c) => {
      v.hiss({ t: c.at - 0.04, f: 1200, to: 7000, q: 1.2, a: 0.05, d: 0.16, gain: 0.08, pan: 0.2, send: 0.3, seed: c.seed });
      v.tone({ t: c.at + 0.06, f: degree(v.key, 4, 1), from: degree(v.key, 2, 1), glide: 0.04, a: 0.002, d: 0.12, gain: 0.05, pan: 0.25, send: 0.3 });
    } },
    air: { duck: 0.2, play: (v, c) => {
      [0, 1, 2, 3, 4].forEach((s, i) => v.struck({ t: c.at + i * 0.045, f: degree(v.key, s, 1), partials: SPARKLE, d: 0.7, gain: 0.05, pan: (i - 2) * 0.18, send: 0.45 }));
      v.hiss({ t: c.at, f: 8500, q: 0.8, a: 0.12, d: 0.5, gain: 0.025, send: 0.5, seed: c.seed });
    } },
    notify: { duck: 0.3, play: (v, c) => {
      [[4, 0], [7, 0.1]].forEach(([s, dt]) => v.struck({ t: c.at + dt, f: degree(v.key, s, 0), partials: GLASS_BRIGHT, d: 0.9, gain: 0.11, pan: 0.2, send: 0.35 }));
    } },
    dawn: { duck: 0.15, play: (v, c) => {
      v.hiss({ t: c.at - 0.3, f: 1500, to: 7000, q: 0.8, a: 0.3, d: 0.5, gain: 0.045, send: 0.45, seed: c.seed });
      v.struck({ t: c.at, f: degree(v.key, 2, 1), partials: GLASS_BRIGHT, d: 1.2, gain: 0.06, pan: -0.2, send: 0.5 });
    } },
    whoosh: { duck: 0.3, play: (v, c) => {
      v.hiss({ t: c.at - 0.35, f: 500, to: 8000, q: 0.9, a: 0.3, d: 0.22, gain: 0.12, pan: -0.25, send: 0.3, seed: c.seed });
      v.hiss({ t: c.at - 0.3, f: 700, to: 8000, q: 1.4, a: 0.28, d: 0.18, gain: 0.06, pan: 0.35, send: 0.3, seed: c.seed + 4 });
    } },
    bell: { duck: 0.45, play: (v, c) => {
      v.struck({ t: c.at, f: degree(v.key, 0, 1), partials: [[1, 1, 1], [2.4, 0.4, 0.6], [3.9, 0.2, 0.4], [5.1, 0.1, 0.25], [8.2, 0.05, 0.15]], d: 1.5, gain: 0.15, pan: 0.25, send: 0.45 });
      [4, 5, 6, 7, 9].forEach((s, i) => v.struck({ t: c.at + 0.06 + i * 0.04, f: degree(v.key, s, 1), partials: SPARKLE, d: 0.5, gain: 0.03, pan: 0.4 - i * 0.15, send: 0.5 }));
      v.hiss({ t: c.at + 0.02, f: 9000, q: 0.9, a: 0.01, d: 0.6, gain: 0.018, send: 0.5, seed: c.seed });
    } },
    glow: { duck: 0.25, play: (v, c) => {
      [[2, 0], [4, 0.09]].forEach(([s, dt]) => v.struck({ t: c.at + dt, f: degree(v.key, s, 1), partials: GLASS_BRIGHT, d: 0.9, gain: 0.08, pan: 0.15, send: 0.4 }));
    } },
    lock: { duck: 0.3, play: (v, c) => {
      v.hiss({ t: c.at, f: 3600, q: 2, a: 0.0005, d: 0.006, gain: 0.12, send: 0.08, seed: c.seed });
      v.hiss({ t: c.at + 0.045, f: 2400, q: 2, a: 0.0005, d: 0.01, gain: 0.12, send: 0.08, seed: c.seed + 3 });
      v.tone({ t: c.at + 0.045, f: 150, from: 260, glide: 0.02, a: 0.001, d: 0.08, gain: 0.18, send: 0.05 });
      v.hiss({ t: c.at + 0.045, f: 8500, q: 1, a: 0.0005, d: 0.01, gain: 0.035, send: 0.05, seed: c.seed + 6 });
    } },
    plug: { duck: 0.3, play: (v, c) => {
      v.tone({ t: c.at, f: 110, from: 180, glide: 0.04, a: 0.001, d: 0.1, gain: 0.25, send: 0.05 });
      v.hiss({ t: c.at, f: 3000, q: 1.5, a: 0.0005, d: 0.01, gain: 0.1, send: 0.08, seed: c.seed });
      synth(v, { t: c.at + 0.01, f: degree(v.key, 4, 1), type: "square", a: 0.002, d: 0.12, gain: 0.04, cut: 6000, cutTo: 1500, cutIn: 0.1, send: 0.25 });
    } },
    toggle: { duck: 0.3, play: (v, c) => {
      v.hiss({ t: c.at, f: 3200, q: 2, a: 0.0005, d: 0.008, gain: 0.09, send: 0.05, seed: c.seed });
      [2, 3, 4, 5].forEach((s, i) => v.struck({ t: c.at + 0.02 + i * 0.055, f: degree(v.key, s, 1), partials: GLASS_BRIGHT, d: 0.5, gain: 0.06, pan: (i - 1.5) * 0.2, send: 0.35 }));
    } },
    hit: { duck: 0.6, play: (v, c) => {
      const big = !c.step, swell = 2 * c.beat;
      v.hiss({ t: c.at - swell, f: 600, to: 6000, q: 1.2, a: swell - 0.02, d: 0.05, gain: big ? 0.05 : 0.03, send: 0.35, seed: c.seed });
      v.tone({ t: c.at, f: 62, from: 200, glide: 0.08, a: 0.001, h: 0.04, d: 0.35, gain: big ? 0.45 : 0.28, send: 0.1 });
      v.hiss({ t: c.at, f: 2500, type: "lowpass", a: 0.001, d: 0.1, gain: big ? 0.2 : 0.12, send: 0.35, seed: c.seed + 1 });
      v.hiss({ t: c.at, f: 7500, q: 0.6, a: 0.004, d: big ? 0.9 : 0.4, gain: big ? 0.022 : 0.014, pan: 0.1, send: 0.5, seed: c.seed + 2 });
    } },
  };

  const POP_CHORDS = {
    A: { root: 45, pad: [57, 61, 64, 69] },
    E: { root: 52, pad: [56, 59, 64, 68] },
    Fsm: { root: 42, pad: [57, 61, 66, 69] },
    D: { root: 50, pad: [57, 62, 66, 69] },
    Csm: { root: 49, pad: [56, 61, 64, 68] },
    Bm: { root: 47, pad: [54, 59, 62, 66] },
    Dmaj7: { root: 50, pad: [54, 57, 61, 62] },
    Csm7: { root: 49, pad: [56, 59, 61, 64] },
    Bm7: { root: 47, pad: [54, 57, 59, 62] },
    Esus: { root: 52, pad: [57, 59, 64, 71] },
  };
  const POP_PROG = {
    intro: ["A", "E", "Fsm", "D"],
    drive: ["D", "A", "E", "Fsm"],
    hold: ["A", "D"],
    full: ["D", "E", "Csm", "Fsm"],
    break: ["Dmaj7", "Csm7", "Bm7", "Esus"],
    build: ["Bm", "Csm", "D", "E"],
    peak: ["D", "E", "Csm", "Fsm"],
    end: ["D", "E"],
  };
  const POP_HOOK = hook([
    [0, 81, 2], [2, 78, 2], [4, 81, 1], [6, 83, 2], [8, 81, 2], [11, 78, 2], [14, 76, 2],
    [16, 80, 3], [19, 76, 2], [22, 78, 2], [24, 80, 6],
    [32, 80, 2], [34, 76, 2], [36, 73, 2], [38, 76, 2], [40, 80, 2], [43, 81, 2], [46, 83, 2],
    [48, 85, 4], [52, 81, 2], [54, 78, 6],
  ]);
  const POP_ARP = [0, 1, 2, 3, 4, 3, 2, 1];
  const POP_EIGHTHS = new Set(["intro", "break"]);
  const POP_CUT = { intro: 2000, drive: 3000, hold: 1300, full: 3800, break: 1400, peak: 4200, end: 4200 };
  const POP_PUMP = { intro: 0.6, drive: 0.7, full: 0.8, build: 0.7, peak: 0.8, end: 0.8 };

  function popLead(v, { t, f, dur, gain = 0.05, pan = 0, send = 0.3 }) {
    [["sawtooth", -8, -0.2], ["square", 8, 0.2]].forEach(([type, detune, side]) => synth(v, { t, f, type, detune, a: 0.006, h: dur * 0.6, d: 0.2, gain, cut: 6000, cutTo: 2400, cutIn: dur + 0.1, q: 1.2, pan: pan + side, send }));
  }

  const POP = {
    bpm: 120,
    key: { root: 69, scale: [0, 2, 4, 7, 9] },
    room: { seconds: 1.5, damp: 0.38, wet: 0.45 },
    top: BRIGHT_TOP,
    musicDb: -3,
    sfxDb: 0,
    glue: { threshold: -18, knee: 10, ratio: 2.5, attack: 0.008, release: 0.18 },
    chord: progression(POP_CHORDS, POP_PROG),
    mixes: {
      intro: { kick: 0.9, hat: 0.7, bass: 0.85, chords: 0.6, arp: 0.75 },
      drive: { kick: 1, clap: 0.9, hat: 0.9, bass: 0.95, chords: 0.8, arp: 0.8 },
      hold: { chords: 0.7, arp: 0.4, hat: 0.3 },
      full: { kick: 1, clap: 1, hat: 1, open: 0.8, bass: 1, chords: 0.85, arp: 0.6, lead: 1 },
      break: { clap: 0.5, hat: 0.45, bass: 0.6, chords: 0.75, arp: 0.85 },
      build: { kick: 1, hat: 1, bass: 0.9, chords: 0.8, arp: 0.8, roll: 1 },
      peak: { kick: 1, clap: 1, hat: 1, open: 0.9, bass: 1, chords: 0.9, arp: 0.6, lead: 1, sparkle: 0.8 },
      end: { kick: 1, clap: 1, hat: 1, open: 0.9, bass: 1, chords: 0.9, lead: 1, sparkle: 0.8, roll: 0.8 },
    },
    layers: {
      kick(v, n) {
        if (n.step % 4) return;
        v.tone({ t: n.t, f: 78, from: 250, glide: 0.05, a: 0.001, h: 0.015, d: 0.2, gain: 0.62, out: v.out, send: 0 });
        v.tone({ t: n.t, f: 140, from: 200, glide: 0.02, type: "triangle", a: 0.001, d: 0.07, gain: 0.16, out: v.out, send: 0 });
        v.hiss({ t: n.t, f: 4500, q: 0.7, a: 0.0005, d: 0.007, gain: 0.12, out: v.out, send: 0, seed: n.seed });
      },
      clap(v, n) {
        if (n.step !== 4 && n.step !== 12) return;
        [0, 0.008, 0.017].forEach((dt, i) => v.hiss({ t: n.t + dt, f: 1350, q: 0.9, a: 0.001, d: i === 2 ? 0.13 : 0.012, gain: 0.2, out: v.out, pan: -0.05, send: 0.3, seed: n.seed + i }));
        v.hiss({ t: n.t + 0.017, f: 5200, q: 0.8, a: 0.001, d: 0.07, gain: 0.07, out: v.out, pan: 0.05, send: 0.3, seed: n.seed + 5 });
      },
      hat(v, n) {
        const off = n.step % 4 === 2;
        v.hiss({ t: n.t, f: 9000, q: 0.9, a: 0.0008, d: off ? 0.04 : 0.022, gain: off ? 0.045 : n.step % 2 ? 0.018 : 0.026, out: v.out, pan: off ? 0.28 : -0.18, send: 0.05, seed: n.seed });
      },
      open(v, n) {
        if (n.step % 4 !== 2) return;
        v.hiss({ t: n.t, f: 8000, q: 0.7, a: 0.002, d: 0.16, gain: 0.032, out: v.out, pan: 0.3, send: 0.12, seed: n.seed + 9 });
      },
      bass(v, n) {
        if (n.step % 4 !== 2) return;
        const f = hz(n.chord.root + (n.step === 14 ? 12 : 0));
        synth(v, { t: n.t, f, type: "sawtooth", a: 0.004, h: n.beat * 0.2, d: 0.1, gain: 0.15, cut: 1500, cutTo: 320, cutIn: 0.12, q: 3, send: 0 });
        synth(v, { t: n.t, f, type: "square", detune: 6, a: 0.004, h: n.beat * 0.2, d: 0.1, gain: 0.05, cut: 700, send: 0 });
      },
      chords(v, n) {
        if (n.step) return;
        const cut = n.mix === "build" ? 1500 + 3000 * (n.since + 1) / (n.since + n.left) : POP_CUT[n.mix] ?? 3000;
        pumpedChord(v, { t: n.t, notes: n.chord.pad, beat: n.beat, gain: 0.022, cut, depth: POP_PUMP[n.mix] ?? 0 });
      },
      arp(v, n) {
        if (POP_EIGHTHS.has(n.mix) && n.step % 2) return;
        const pool = [...n.chord.pad.map((m) => m + 12), n.chord.pad[0] + 24];
        synth(v, { t: n.t, f: hz(pool[POP_ARP[n.step % 8]]), type: "square", a: 0.002, d: 0.11, gain: 0.03, cut: 5500, cutTo: 900, cutIn: 0.08, q: 2.5, pan: n.step % 2 ? 0.45 : -0.45, send: 0.22 });
      },
      lead(v, n) {
        const note = hookNote(POP_HOOK, n);
        if (note) popLead(v, { t: n.t, f: hz(note.m), dur: note.len * n.beat / 4 });
      },
      sparkle(v, n) {
        if (n.step % 4) return;
        v.struck({ t: n.t, f: hz(n.chord.pad[(n.step / 4 + n.since) % 4] + 24), partials: SPARKLE, d: 0.7, gain: 0.03, out: v.out, pan: (n.step / 4) % 2 ? 0.45 : -0.45, send: 0.4 });
      },
      roll(v, n) {
        if (n.step % (n.left === 1 ? 1 : 2)) return;
        const r = rise(n);
        v.hiss({ t: n.t, f: 1700, q: 0.9, a: 0.001, d: 0.05, gain: 0.03 + 0.08 * r, out: v.out, send: 0.25, seed: n.seed });
        v.hiss({ t: n.t, f: 6000 + 3000 * r, q: 0.9, a: 0.001, d: 0.03, gain: 0.02 + 0.03 * r, out: v.out, send: 0.2, seed: n.seed + 3 });
      },
    },
    sfx: {
      ...BRIGHT,
      pop: { duck: 0.08, play: (v, c) => {
        const f = degree(v.key, c.step, 1), pan = ((c.step % 3) - 1) * 0.3;
        synth(v, { t: c.at, f, type: "square", a: 0.002, d: 0.09, gain: 0.05, cut: 7000, cutTo: 1500, cutIn: 0.07, q: 3, pan, send: 0.25 });
        v.tone({ t: c.at, f: f * 2, from: f, glide: 0.025, a: 0.001, d: 0.06, gain: 0.04, pan, send: 0.2 });
        v.hiss({ t: c.at, f: 7500, q: 1, a: 0.0005, d: 0.01, gain: 0.035, send: 0, seed: c.seed });
      } },
      memory: { duck: 0.5, play: (v, c) => {
        const notes = [degree(v.key, 2, 1), degree(v.key, 3, 1), degree(v.key, 0, 2)];
        notes.forEach((f, i) => {
          popLead(v, { t: c.at + i * c.beat / 2, f, dur: i === 2 ? c.beat : c.beat / 2, gain: 0.07, pan: (i - 1) * 0.2, send: 0.4 });
          v.struck({ t: c.at + i * c.beat / 2, f: f * 2, partials: SPARKLE, d: 0.8, gain: 0.03, pan: (1 - i) * 0.3, send: 0.5 });
        });
      } },
      echo: { duck: 0.25, play: (v, c) => {
        [degree(v.key, 3, 1), degree(v.key, 0, 2)].forEach((f, i) => popLead(v, { t: c.at + i * c.beat / 2, f, dur: c.beat / 2, gain: 0.04, pan: 0.25, send: 0.5 }));
      } },
      sting: { duck: 0.4, play: (v, c) => {
        [0, 1, 2, 3, 4, 5].forEach((s, i) => v.struck({ t: c.at + i * 0.05, f: degree(v.key, s, 1), partials: SPARKLE, d: 1.0, gain: 0.05, pan: (i - 2.5) * 0.15, send: 0.5 }));
        popLead(v, { t: c.at + c.beat / 2, f: degree(v.key, 0, 2), dur: c.beat, gain: 0.05, send: 0.5 });
      } },
    },
  };

  const BOUNCE_CHORDS = {
    F: { root: 41, pad: [57, 60, 65, 69] },
    Bb9: { root: 46, pad: [58, 62, 65, 72] },
    Am: { root: 45, pad: [57, 60, 64, 69] },
    Bb: { root: 46, pad: [58, 62, 65, 70] },
    C: { root: 48, pad: [55, 60, 64, 67] },
    D7: { root: 50, pad: [57, 60, 62, 66] },
    Gm7: { root: 43, pad: [55, 58, 62, 65] },
    C7: { root: 48, pad: [58, 60, 64, 67] },
    Bbmaj7: { root: 46, pad: [58, 62, 65, 69] },
    Am7: { root: 45, pad: [55, 57, 60, 64] },
    C7sus: { root: 48, pad: [58, 60, 65, 67] },
  };
  const BOUNCE_PROG = {
    intro: ["F", "Bb9"],
    drive: ["F", "Am", "Bb", "C"],
    hold: ["F", "Bb9"],
    full: ["F", "D7", "Gm7", "C7"],
    break: ["Bbmaj7", "Am7", "Gm7", "C7sus"],
    build: ["Gm7", "Am7", "Bb", "C"],
    peak: ["F", "D7", "Gm7", "C7"],
    end: ["Bb", "C7"],
  };
  const BOUNCE_HOOK = hook([
    [0, 84, 1], [2, 81, 1], [3, 84, 1], [6, 86, 2], [8, 84, 1], [10, 81, 2], [12, 77, 2], [14, 79, 1],
    [16, 78, 2], [18, 81, 1], [19, 84, 2], [22, 86, 2], [24, 84, 1], [26, 81, 4],
    [32, 79, 1], [34, 82, 1], [35, 86, 2], [38, 82, 1], [40, 79, 2], [43, 77, 1], [44, 79, 2], [46, 82, 1],
    [48, 84, 2], [51, 82, 1], [52, 79, 2], [54, 76, 2], [56, 79, 1], [58, 82, 1], [60, 84, 4],
  ]);
  const BOUNCE_HOOK_FROM = { end: 2 };
  const BOUNCE_KICK = { groove: { 0: 1, 3: 0.5, 8: 0.9, 10: 0.65 }, break: { 0: 0.8, 10: 0.45 } };
  const BOUNCE_SLAP = { 0: [0, 1], 3: [12, 0.75, true], 6: [0, 0.55], 8: [7, 0.7], 10: [12, 0.85, true], 13: [0, 0.5], 14: [7, 0.45] };
  const BOUNCE_CHANK = { 2: 1, 6: 0.75, 9: 0.5, 10: 1, 14: 0.75 };
  const BOUNCE_KEYS = { 0: 1, 6: 0.7 };
  const SWING = 0.24;
  const swung = (n) => n.t + (n.step % 2 ? SWING * n.beat / 4 : 0);

  const BOUNCE = {
    bpm: 108,
    key: { root: 65, scale: [0, 2, 4, 7, 9] },
    room: { seconds: 1.3, damp: 0.4, wet: 0.4 },
    top: BRIGHT_TOP,
    musicDb: -3,
    sfxDb: 0,
    glue: { threshold: -22, knee: 8, ratio: 3, attack: 0.004, release: 0.14 },
    chord: progression(BOUNCE_CHORDS, BOUNCE_PROG),
    mixes: {
      intro: { kick: 0.85, snap: 0.75, jingle: 0.6, bass: 0.9, chank: 0.75 },
      drive: { kick: 1, snap: 0.9, jingle: 0.85, bass: 1, chank: 0.85, keys: 0.6 },
      hold: { keys: 0.75, jingle: 0.3 },
      full: { kick: 1, snap: 1, jingle: 1, bass: 1, chank: 0.85, keys: 0.55, glock: 1, bubbles: 0.8 },
      break: { kick: 0.7, snap: 0.7, jingle: 0.4, bass: 0.75, chank: 0.5, keys: 0.85 },
      build: { kick: 1, snap: 0.9, jingle: 1, bass: 1, chank: 0.8, keys: 0.5, roll: 1 },
      peak: { kick: 1, snap: 1, jingle: 1, bass: 1, chank: 0.9, keys: 0.55, glock: 1, bubbles: 1 },
      end: { kick: 1, snap: 1, jingle: 1, bass: 1, chank: 0.9, glock: 1, bubbles: 0.8, roll: 0.8 },
    },
    layers: {
      kick(v, n) {
        const l = (BOUNCE_KICK[n.mix] ?? BOUNCE_KICK.groove)[n.step];
        if (!l) return;
        const t = swung(n);
        v.tone({ t, f: 95, from: 230, glide: 0.035, a: 0.001, h: 0.01, d: 0.14, gain: 0.36 * l, out: v.out, send: 0 });
        v.tone({ t, f: 170, from: 260, glide: 0.015, type: "triangle", a: 0.001, d: 0.045, gain: 0.14 * l, out: v.out, send: 0 });
        v.hiss({ t, f: 3000, q: 1.2, a: 0.0005, d: 0.006, gain: 0.07 * l, out: v.out, send: 0, seed: n.seed });
      },
      snap(v, n) {
        if (n.step !== 4 && n.step !== 12) return;
        v.hiss({ t: n.t, f: 2700, q: 2.4, a: 0.0008, d: 0.03, gain: 0.24, out: v.out, pan: 0.12, send: 0.3, seed: n.seed });
        v.hiss({ t: n.t + 0.002, f: 6200, q: 1.4, a: 0.0005, d: 0.014, gain: 0.05, out: v.out, pan: 0.12, send: 0.2, seed: n.seed + 1 });
        v.tone({ t: n.t, f: 1500, from: 2300, glide: 0.006, a: 0.0005, d: 0.012, gain: 0.03, out: v.out, pan: 0.12, send: 0.1 });
      },
      jingle(v, n) {
        const accent = n.step % 4 === 2 ? 1 : n.step % 2 ? 0.3 : 0.45;
        v.hiss({ t: swung(n), f: 8600, q: 2.2, a: 0.001, d: accent === 1 ? 0.07 : 0.032, gain: 0.03 * accent, out: v.out, pan: -0.35, send: 0.08, seed: n.seed });
      },
      bass(v, n) {
        const h = BOUNCE_SLAP[n.step];
        if (!h) return;
        const [interval, l, slap] = h, t = swung(n), f = hz(n.chord.root + interval);
        synth(v, { t, f, type: "sawtooth", a: 0.002, h: 0.035, d: 0.13, gain: 0.15 * l, cut: slap ? 3400 : 1900, cutTo: 260, cutIn: 0.08, q: 3, send: 0.02 });
        synth(v, { t, f, type: "square", a: 0.002, h: 0.035, d: 0.13, gain: 0.06 * l, cut: 800, send: 0 });
        if (slap) v.hiss({ t, f: 2600, q: 1.5, a: 0.0005, d: 0.006, gain: 0.07 * l, out: v.out, send: 0, seed: n.seed });
      },
      chank(v, n) {
        const l = BOUNCE_CHANK[n.step];
        if (!l) return;
        const t = swung(n);
        n.chord.pad.slice(1).forEach((m, i) => synth(v, { t: t + i * 0.005, f: hz(m + 12), a: 0.001, d: 0.05, gain: 0.032 * l, cut: 3000, cutTo: 900, cutIn: 0.04, q: 1.6, pan: 0.32, send: 0.1 }));
        v.hiss({ t, f: 3800, q: 1.2, a: 0.0005, d: 0.008, gain: 0.03 * l, out: v.out, pan: 0.32, send: 0.05, seed: n.seed });
      },
      keys(v, n) {
        const l = BOUNCE_KEYS[n.step];
        if (!l) return;
        n.chord.pad.forEach((m, i) => v.struck({ t: swung(n) + i * 0.003, f: hz(m), partials: EP, d: 0.5, gain: 0.045 * l, out: v.out, pan: -0.25 + i * 0.05, send: 0.25 }));
      },
      glock(v, n) {
        const note = hookNote(BOUNCE_HOOK, n, BOUNCE_HOOK_FROM[n.mix]);
        if (note) v.struck({ t: swung(n), f: hz(note.m), partials: GLOCK, d: 0.9, gain: 0.075, out: v.out, pan: 0.15, send: 0.35 });
      },
      bubbles(v, n) {
        const r = rng(n.seed + 101);
        if (n.step % 4 === 0 || r() > 0.22) return;
        const f = degree(v.key, Math.floor(r() * 6), 1);
        v.tone({ t: swung(n), f, from: f * 0.5, glide: 0.035, a: 0.002, d: 0.07, gain: 0.045, out: v.out, pan: r() - 0.5, send: 0.25 });
      },
      roll(v, n) {
        if (n.step % (n.left === 1 ? 1 : 2)) return;
        const r = rise(n), f = 140 + 260 * r;
        v.tone({ t: swung(n), f, from: f * 1.5, glide: 0.03, type: "triangle", a: 0.001, d: 0.09, gain: 0.07 + 0.1 * r, out: v.out, pan: r - 0.5, send: 0.2 });
        v.hiss({ t: swung(n), f: 2700, q: 2, a: 0.0008, d: 0.02, gain: 0.04 + 0.08 * r, out: v.out, send: 0.2, seed: n.seed });
      },
    },
    sfx: {
      ...BRIGHT,
      pop: { duck: 0.08, play: (v, c) => {
        const f = degree(v.key, c.step, 1), pan = ((c.step % 3) - 1) * 0.3;
        v.tone({ t: c.at, f, from: f * 0.45, glide: 0.03, a: 0.002, d: 0.08, gain: 0.08, pan, send: 0.2 });
        v.struck({ t: c.at + 0.015, f: f * 2, partials: GLOCK, d: 0.25, gain: 0.025, pan, send: 0.3 });
      } },
      memory: { duck: 0.5, play: (v, c) => {
        [degree(v.key, 2, 1), degree(v.key, 3, 1), degree(v.key, 0, 2)].forEach((f, i) => {
          v.struck({ t: c.at + i * c.beat / 2, f, partials: GLOCK, d: i === 2 ? 1.6 : 0.9, gain: 0.13, pan: (i - 1) * 0.25, send: 0.45 });
          v.struck({ t: c.at + i * c.beat / 2, f: f / 2, partials: EP, d: 0.8, gain: 0.06, pan: (i - 1) * 0.25, send: 0.3 });
        });
        v.tone({ t: c.at + c.beat, f: degree(v.key, 0, 2), from: degree(v.key, 0, 1), glide: 0.06, a: 0.003, d: 0.12, gain: 0.04, send: 0.3 });
      } },
      echo: { duck: 0.25, play: (v, c) => {
        [degree(v.key, 3, 1), degree(v.key, 0, 2)].forEach((f, i) => v.struck({ t: c.at + i * c.beat / 2, f, partials: GLOCK, d: 0.9, gain: 0.07, pan: 0.25, send: 0.5 }));
      } },
      sting: { duck: 0.4, play: (v, c) => {
        [0, 1, 2, 3, 4, 5].forEach((s, i) => v.struck({ t: c.at + i * 0.06, f: degree(v.key, s, 1), partials: GLOCK, d: 1.0, gain: 0.07, pan: (i - 2.5) * 0.15, send: 0.45 }));
        v.tone({ t: c.at + 0.4, f: degree(v.key, 0, 2), from: degree(v.key, 0, 0), glide: 0.12, a: 0.003, d: 0.15, gain: 0.05, send: 0.3 });
      } },
    },
  };

  const MUSIC = { suite: SUITE, pop: POP, bounce: BOUNCE };

  const tempoOf = (score, length) => { const g = grid(score, length, MUSIC[score.music]); return { bpm: g.bpm, bars: g.bars, phase: g.phase }; };

  /** Plays a film's rendered score in step with its clock: start from t, restart on seek, stop on pause, loop with the film. */
  function speaker(film) {
    let ctx = null, buffer = null, src = null, origin = 0, on = false;
    film.audio();
    return {
      async toggle() {
        on = !on;
        if (on) {
          ctx ??= new AudioContext({ sampleRate: RATE });
          await ctx.resume();
          buffer ??= await film.audio();
        }
        return on;
      },
      sync(t, playing) {
        src?.stop();
        src = null;
        if (!on || !playing || !buffer) return;
        src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(ctx.destination);
        origin = ctx.currentTime - t;
        src.start(ctx.currentTime, t);
      },
      clock: () => (src ? (ctx.currentTime - origin) % film.length : null),
    };
  }

  window.Sound = { renderScore, steps, tempoOf, lufs, peakDb, speaker };
})();
