(() => {
  const RATE = 48000;
  const PRE = 2;
  const TAIL = 6;
  const WINDOW = 4;
  const VOICE_TAIL = 4;
  const CONTROL_RATE = 400;
  const HIGHPASS_HZ = 90;
  const SHELF_HZ = 6000;
  const SHELF_DB = -5;
  const LOWPASS_HZ = 15000;
  const MAX_HZ = 12000;
  const CEILING_DB = -1.5;
  const TARGET_LUFS = -16;
  const LUFS_TOLERANCE = 0.05;
  const COMPRESSOR_LOOKAHEAD = 0.006;

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

  function grid(score, length) {
    const bars = Math.max(1, Math.round(length / (4 * 60 / BOUNCE.bpm)));
    const beat = length / (bars * 4);
    const phase = wrap(score.tempo.on, beat);
    return { bars, beat, phase, at: (beatIndex) => phase + beatIndex * beat };
  }

  function noiseBuffer(seconds, seed) {
    const buf = new AudioBuffer({ length: Math.ceil(seconds * RATE), numberOfChannels: 1, sampleRate: RATE });
    const d = buf.getChannelData(0), r = rng(seed);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    return buf;
  }

  function impulse(seconds, damp, seed) {
    const n = Math.ceil(seconds * RATE), pre = Math.round(0.012 * RATE);
    const buf = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: RATE });
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

  /** The voices of one render window: a voice builds its nodes only when it starts inside [from, from + WINDOW). */
  function voiceKit(ctx, buses, from, noise) {
    const T = (t) => t + PRE - from;
    const ours = (at) => at >= 0 && at < WINDOW;

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
      source.onended = () => [g, p, s].forEach((node) => node?.disconnect());
      return g;
    }

    function tone({ t, f, from: start, glide = 0.03, type = "sine", a, h, d, gain = 0.2, out = buses.sfx, pan = 0, send = 0.2, detune = 0 }) {
      const at = T(t);
      if (f > MAX_HZ || !ours(at)) return;
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      o.frequency.setValueAtTime(start ?? f, at);
      if (start) o.frequency.exponentialRampToValueAtTime(f, at + glide);
      const g = chain(out, pan, send, o);
      const end = envelope(g.gain, at, { a, h, d, peak: gain });
      o.connect(g);
      o.start(at);
      o.stop(end);
    }

    function synth({ t, f, type = "sawtooth", detune = 0, a = 0.003, h = 0, d = 0.2, gain = 0.1, pan = 0, send = 0.2, cut = 4000, cutTo, cutIn = 0.1, q = 0.7, out = buses.sfx }) {
      const at = T(t);
      if (!ours(at)) return;
      const o = ctx.createOscillator(), fl = ctx.createBiquadFilter();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      fl.type = "lowpass";
      fl.Q.value = q;
      fl.frequency.setValueAtTime(cut, at);
      if (cutTo) fl.frequency.exponentialRampToValueAtTime(cutTo, at + cutIn);
      const g = chain(out, pan, send, o);
      const end = envelope(g.gain, at, { a, h, d, peak: gain });
      o.connect(fl).connect(g);
      o.start(at);
      o.stop(end);
    }

    function hiss({ t, f, to, q = 1, type = "bandpass", a, h = 0, d, gain = 0.1, out = buses.sfx, pan = 0, send = 0.15, seed = 0 }) {
      const at = T(t);
      if (!ours(at)) return;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bq = ctx.createBiquadFilter();
      bq.type = type;
      bq.Q.value = q;
      bq.frequency.setValueAtTime(Math.min(f, MAX_HZ), at);
      if (to) bq.frequency.exponentialRampToValueAtTime(Math.min(to, MAX_HZ), at + (a ?? 0.005) + h + d);
      const g = chain(out, pan, send, src);
      const end = envelope(g.gain, at, { a, h, d, peak: gain });
      src.connect(bq).connect(g);
      src.start(at, rng(seed + t * 1000)() * 3);
      src.stop(end);
    }

    /** A struck note: its partials share one panner and send, and each decays at its own rate. The first partial rings longest. */
    function struck({ t, f, partials, d = 0.6, gain = 0.2, out = buses.sfx, pan = 0, send = 0.25, a = 0.003 }) {
      const at = T(t);
      const audible = partials.filter(([ratio]) => f * ratio <= MAX_HZ);
      if (!ours(at) || !audible.length) return;
      const oscs = audible.map(() => ctx.createOscillator());
      const bus = chain(out, pan, send, oscs[0]);
      audible.forEach(([ratio, level, decay], i) => {
        const o = oscs[i], g = ctx.createGain();
        o.frequency.value = f * ratio;
        const end = envelope(g.gain, at, { a, d: d * decay, peak: gain * level });
        o.connect(g).connect(bus);
        if (i) o.onended = () => g.disconnect();
        o.start(at);
        o.stop(end);
      });
    }

    return { key: BOUNCE.key, tone, synth, hiss, struck };
  }

  function automate(param, fn, from, seconds) {
    const n = Math.ceil(seconds * CONTROL_RATE) + 1;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = fn(from + i / CONTROL_RATE - PRE);
    param.setValueCurveAtTime(curve, 0, (n - 1) / CONTROL_RATE);
  }

  function sectionLevel(sections, layer, length) {
    const sorted = [...sections].sort((p, q) => p.at - q.at);
    const level = (s) => BOUNCE.mixes[s.mix][layer] ?? 0;
    return (x) => {
      const u = wrap(x, length);
      const next = sorted.findIndex((s) => s.at > u);
      const i = (next <= 0 ? sorted.length : next) - 1;
      const cur = sorted[i], prev = sorted[(i - 1 + sorted.length) % sorted.length];
      const since = wrap(u - cur.at, length), fade = cur.fade ?? 0.05;
      return since < fade ? level(prev) + (level(cur) - level(prev)) * (since / fade) : level(cur);
    };
  }

  /**
   * Which section each bar plays, read one beat after its downbeat, with how many bars of that section came before and remain.
   * A section that starts inside a bar enters on its first beat: `next` names the step it joins on, and its first bar counts as `since: -1`.
   */
  function barSections(sections, g, length) {
    const sorted = [...sections].sort((p, q) => p.at - q.at);
    const indexAt = (x) => sorted.reduce((found, s, i) => (s.at <= wrap(x, length) ? i : found), sorted.length - 1);
    const index = Array.from({ length: g.bars }, (_, bar) => indexAt(g.at(bar * 4 + 1)));
    const since = [], left = [];
    index.forEach((s, b) => (since[b] = b && index[b - 1] === s ? since[b - 1] + 1 : 0));
    for (let b = g.bars - 1; b >= 0; b--) left[b] = b < g.bars - 1 && index[b + 1] === index[b] ? left[b + 1] + 1 : 1;
    const joinStep = (s, bar) => Math.round(4 * Math.ceil(wrap(s.at - g.at(bar * 4), length) / g.beat - 1e-6));
    return index.map((s, b) => {
      const n = (s + 1) % sorted.length, step = joinStep(sorted[n], b);
      const next = step > 0 && step < 16 ? { section: n, mix: sorted[n].mix, step, left: (index[(b + 1) % g.bars] === n ? left[(b + 1) % g.bars] : 0) + 1 } : null;
      return { section: s, mix: sorted[s].mix, since: since[b], left: left[b], next };
    });
  }

  function duckCurve(cues, length) {
    const dips = cues.map((c) => ({ at: c.at, depth: SFX[c.sfx].duck }));
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

  function checkScore(score, length) {
    const unknown = score.cues.filter((c) => !SFX[c.sfx]).map((c) => c.sfx);
    if (unknown.length) throw new Error(`Unknown sfx: ${[...new Set(unknown)].join(", ")}`);
    const noMix = score.sections.filter((s) => !BOUNCE.mixes[s.mix]).map((s) => s.mix);
    if (noMix.length) throw new Error(`No mix ${[...new Set(noMix)].join(", ")}`);
    const outside = score.cues.find((c) => c.at < 0 || c.at >= length);
    if (outside) throw new Error(`Cue ${outside.sfx} at ${outside.at} is outside the film`);
  }

  /** Renders the voices that start in [from, from + WINDOW), with their tails, through the whole mix. The mix is linear, so the windows sum to the full score. */
  function renderWindow(score, plan, from, seconds) {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(seconds * RATE), sampleRate: RATE });
    const master = ctx.createGain();
    const hp1 = ctx.createBiquadFilter(), hp2 = ctx.createBiquadFilter(), shelf = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter();
    hp1.type = hp2.type = "highpass";
    hp1.frequency.value = hp2.frequency.value = HIGHPASS_HZ;
    hp1.Q.value = hp2.Q.value = 0.6;
    shelf.type = "highshelf";
    shelf.frequency.value = SHELF_HZ;
    shelf.gain.value = SHELF_DB;
    lp.type = "lowpass";
    lp.frequency.value = LOWPASS_HZ;
    lp.Q.value = 0.5;
    master.connect(hp1).connect(hp2).connect(shelf).connect(lp).connect(ctx.destination);

    const music = ctx.createGain(), sfx = ctx.createGain(), verb = ctx.createGain();
    const room = ctx.createConvolver();
    room.normalize = true;
    room.buffer = plan.room;
    const wet = ctx.createGain();
    wet.gain.value = BOUNCE.room.wet;
    verb.connect(room).connect(wet).connect(master);
    music.gain.value = dbGain(BOUNCE.musicDb);
    sfx.gain.value = dbGain(BOUNCE.sfxDb);
    const duck = ctx.createGain();
    duck.gain.value = 0;
    automate(duck.gain, plan.duck, from, seconds);
    music.connect(duck).connect(master);
    sfx.connect(master);

    const buses = {};
    for (const [name, level] of Object.entries(plan.levels)) {
      const bus = ctx.createGain();
      bus.gain.value = 0;
      automate(bus.gain, level, from, seconds);
      bus.connect(music);
      buses[name] = bus;
    }

    const v = voiceKit(ctx, { sfx, verb }, from, plan.noise);
    const { g } = plan;
    const sixteenth = g.beat / 4;
    for (let s = 0; s < g.bars * 16; s++) {
      const t = g.phase + s * sixteenth;
      const bar = Math.floor(s / 16);
      const { next, section, ...own } = plan.bars[bar];
      const chord = BOUNCE.chord(own);
      const place = { bar, bars: g.bars, ...(next && s % 16 >= next.step ? { mix: next.mix, since: -1, left: next.left } : own) };
      for (const [name, play] of Object.entries(BOUNCE.layers)) {
        const level = plan.levels[name];
        if (!BOUNCE.mixes[place.mix][name] || (level(t) <= 0.001 && level(t + g.beat) <= 0.001)) continue;
        play({ ...v, out: buses[name] }, { ...place, t, step: s % 16, chord, beat: g.beat, seed: s });
      }
    }
    score.cues.forEach((cue, i) => SFX[cue.sfx].play(v, { ...cue, step: cue.step ?? 0, seed: i, beat: g.beat, phase: g.phase }));
    return ctx.startRendering();
  }

  async function renderPass(score, length) {
    checkScore(score, length);
    const span = PRE + length + TAIL;
    const g = grid(score, length);
    const plan = {
      g,
      bars: barSections(score.sections, g, length),
      levels: Object.fromEntries(Object.keys(BOUNCE.layers).map((name) => [name, sectionLevel(score.sections, name, length)])),
      duck: duckCurve(score.cues, length),
      noise: noiseBuffer(4, 7),
      room: impulse(BOUNCE.room.seconds, BOUNCE.room.damp, 3),
    };
    const froms = Array.from({ length: Math.ceil(span / WINDOW) }, (_, i) => i * WINDOW);
    const parts = await Promise.all(froms.map((from) => renderWindow(score, plan, from, Math.min(WINDOW + VOICE_TAIL, span - from))));
    const n = Math.ceil(span * RATE);
    return [0, 1].map((c) => {
      const out = new Float32Array(n);
      parts.forEach((part, i) => {
        const d = part.getChannelData(c), at = froms[i] * RATE, end = Math.min(d.length, n - at);
        for (let j = 0; j < end; j++) out[at + j] += d[j];
      });
      return out;
    });
  }

  function fold(raw, length) {
    const n = Math.round(length * RATE), pre = Math.round(PRE * RATE);
    return raw.map((src) => {
      const out = new Float32Array(n);
      for (let j = 0; j < src.length; j++) out[wrap(j - pre, n)] += src[j];
      return out;
    });
  }

  async function compress(chs) {
    const n = chs[0].length, lookahead = Math.round(COMPRESSOR_LOOKAHEAD * RATE);
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: n * 2 + lookahead, sampleRate: RATE });
    const buf = ctx.createBuffer(2, n, RATE);
    chs.forEach((d, c) => buf.copyToChannel(d, c));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const comp = ctx.createDynamicsCompressor();
    Object.entries(BOUNCE.glue).forEach(([k, val]) => (comp[k].value = val));
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

  /** Renders a score to one seamless loop of `length` seconds: 48 kHz stereo, about −16 LUFS, peaks below −1 dBFS. */
  async function renderScore(score, length) {
    let chs = await compress(fold(await renderPass(score, length), length));
    for (let pass = 0, miss = TARGET_LUFS - lufs(chs); pass < 4 && Math.abs(miss) > LUFS_TOLERANCE; pass++, miss = TARGET_LUFS - lufs(chs)) {
      const gain = dbGain(miss);
      chs = limit(chs.map((d) => d.map((s) => s * gain)), CEILING_DB);
    }
    const buffer = new AudioBuffer({ length: chs[0].length, numberOfChannels: 2, sampleRate: RATE });
    chs.forEach((d, c) => buffer.copyToChannel(d, c));
    return buffer;
  }

  /** Each section in time order with the moment its layers start playing: its first beat, or `at` itself when a bar line already passed it. */
  function sections(score, length) {
    const g = grid(score, length), bars = barSections(score.sections, g, length);
    return [...score.sections].sort((p, q) => p.at - q.at).map((s, i) => {
      const early = bars.findIndex((bar) => bar.next?.section === i);
      const joins = early >= 0 ? g.at(early * 4 + bars[early].next.step / 4) : Math.max(s.at, g.at(4 * bars.findIndex((bar) => bar.section === i)));
      return { mix: s.mix, at: +s.at.toFixed(3), joins: +wrap(joins, length).toFixed(3) };
    });
  }

  const degree = (key, step, octave = 0) => hz(key.root + 12 * (octave + Math.floor(step / key.scale.length)) + key.scale[wrap(step, key.scale.length)]);

  const SPARKLE = [[1, 1, 1], [2.01, 0.3, 0.5], [3.02, 0.12, 0.3], [5.4, 0.05, 0.15]];
  const GLASS = [[1, 1, 1], [2.76, 0.35, 0.5], [5.4, 0.15, 0.3], [8.9, 0.06, 0.15]];
  const BELL = [[1, 1, 1], [2.4, 0.4, 0.6], [3.9, 0.2, 0.4], [5.1, 0.1, 0.25], [8.2, 0.05, 0.15]];
  const GLOCK = [[1, 1, 1], [2.76, 0.32, 0.45], [5.4, 0.12, 0.22], [8.93, 0.05, 0.1]];
  const EP = [[1, 1, 1], [2, 0.32, 0.45], [3, 0.1, 0.25], [7.02, 0.04, 0.08]];

  /** Each section plays its own progression from its first bar; a build is aligned to its last bar so it always lands on the dominant. */
  const progression = (chords, table) => ({ mix, since, left }) => {
    const names = table[mix];
    const i = mix === "build" ? names.length - 1 - ((left - 1) % names.length) : since % names.length;
    return chords[names[i]];
  };
  const hook = (notes) => new Map(notes.map(([step, m, len]) => [step, { m, len }]));
  const hookNote = (phrase, n, fromBar = 0) => phrase.get(wrap(n.since + fromBar, 4) * 16 + n.step);
  const rise = (n) => clamp((n.since + n.step / 16) / (n.since + n.left));
  /** A motif's note times: the first on its cue, each next on the first eighth of the beat grid at least an eighth after the one before. */
  const eighths = (c, count) => {
    const eighth = c.beat / 2, times = [c.at];
    while (times.length < count) times.push(c.phase + Math.ceil((times[times.length - 1] + eighth - c.phase) / eighth - 1e-6) * eighth);
    return times;
  };

  const SFX = {
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
      [[4, 0], [7, 0.1]].forEach(([s, dt]) => v.struck({ t: c.at + dt, f: degree(v.key, s, 0), partials: GLASS, d: 0.9, gain: 0.11, pan: 0.2, send: 0.35 }));
    } },
    dawn: { duck: 0.15, play: (v, c) => {
      v.hiss({ t: c.at - 0.3, f: 1500, to: 7000, q: 0.8, a: 0.3, d: 0.5, gain: 0.045, send: 0.45, seed: c.seed });
      v.struck({ t: c.at, f: degree(v.key, 2, 1), partials: GLASS, d: 1.2, gain: 0.06, pan: -0.2, send: 0.5 });
    } },
    whoosh: { duck: 0.3, play: (v, c) => {
      v.hiss({ t: c.at - 0.35, f: 500, to: 8000, q: 0.9, a: 0.3, d: 0.22, gain: 0.12, pan: -0.25, send: 0.3, seed: c.seed });
      v.hiss({ t: c.at - 0.3, f: 700, to: 8000, q: 1.4, a: 0.28, d: 0.18, gain: 0.06, pan: 0.35, send: 0.3, seed: c.seed + 4 });
    } },
    bell: { duck: 0.45, play: (v, c) => {
      v.struck({ t: c.at, f: degree(v.key, 0, 1), partials: BELL, d: 1.5, gain: 0.15, pan: 0.25, send: 0.45 });
      [4, 5, 6, 7, 9].forEach((s, i) => v.struck({ t: c.at + 0.06 + i * 0.04, f: degree(v.key, s, 1), partials: SPARKLE, d: 0.5, gain: 0.03, pan: 0.4 - i * 0.15, send: 0.5 }));
      v.hiss({ t: c.at + 0.02, f: 9000, q: 0.9, a: 0.01, d: 0.6, gain: 0.018, send: 0.5, seed: c.seed });
    } },
    glow: { duck: 0.25, play: (v, c) => {
      [[2, 0], [4, 0.09]].forEach(([s, dt]) => v.struck({ t: c.at + dt, f: degree(v.key, s, 1), partials: GLASS, d: 0.9, gain: 0.08, pan: 0.15, send: 0.4 }));
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
      v.synth({ t: c.at + 0.01, f: degree(v.key, 4, 1), type: "square", a: 0.002, d: 0.12, gain: 0.04, cut: 6000, cutTo: 1500, cutIn: 0.1, send: 0.25 });
    } },
    toggle: { duck: 0.3, play: (v, c) => {
      v.hiss({ t: c.at, f: 3200, q: 2, a: 0.0005, d: 0.008, gain: 0.09, send: 0.05, seed: c.seed });
      [2, 3, 4, 5].forEach((s, i) => v.struck({ t: c.at + 0.02 + i * 0.055, f: degree(v.key, s, 1), partials: GLASS, d: 0.5, gain: 0.06, pan: (i - 1.5) * 0.2, send: 0.35 }));
    } },
    hit: { duck: 0.6, play: (v, c) => {
      const big = !c.step, swell = 2 * c.beat;
      v.hiss({ t: c.at - swell, f: 600, to: 6000, q: 1.2, a: swell - 0.02, d: 0.05, gain: big ? 0.05 : 0.03, send: 0.35, seed: c.seed });
      v.tone({ t: c.at, f: 62, from: 200, glide: 0.08, a: 0.001, h: 0.04, d: 0.35, gain: big ? 0.36 : 0.22, send: 0.1 });
      v.hiss({ t: c.at, f: 2500, type: "lowpass", a: 0.001, d: 0.1, gain: big ? 0.15 : 0.09, send: 0.35, seed: c.seed + 1 });
      v.hiss({ t: c.at, f: 7500, q: 0.6, a: 0.004, d: big ? 0.9 : 0.4, gain: big ? 0.022 : 0.014, pan: 0.1, send: 0.5, seed: c.seed + 2 });
    } },
    pop: { duck: 0.08, play: (v, c) => {
      const f = degree(v.key, c.step, 1), pan = ((c.step % 3) - 1) * 0.3;
      v.tone({ t: c.at, f, from: f * 0.45, glide: 0.03, a: 0.002, d: 0.08, gain: 0.08, pan, send: 0.2 });
      v.struck({ t: c.at + 0.015, f: f * 2, partials: GLOCK, d: 0.25, gain: 0.025, pan, send: 0.3 });
    } },
    memory: { duck: 0.5, play: (v, c) => {
      const at = eighths(c, 3);
      [degree(v.key, 2, 1), degree(v.key, 3, 1), degree(v.key, 0, 2)].forEach((f, i) => {
        v.struck({ t: at[i], f, partials: GLOCK, d: i === 2 ? 1.6 : 0.9, gain: 0.13, pan: (i - 1) * 0.25, send: 0.45 });
        v.struck({ t: at[i], f: f / 2, partials: EP, d: 0.8, gain: 0.06, pan: (i - 1) * 0.25, send: 0.3 });
      });
      v.tone({ t: at[2], f: degree(v.key, 0, 2), from: degree(v.key, 0, 1), glide: 0.06, a: 0.003, d: 0.12, gain: 0.04, send: 0.3 });
    } },
    echo: { duck: 0.25, play: (v, c) => {
      const at = eighths(c, 2);
      [degree(v.key, 3, 1), degree(v.key, 0, 2)].forEach((f, i) => v.struck({ t: at[i], f, partials: GLOCK, d: 0.9, gain: 0.07, pan: 0.25, send: 0.5 }));
    } },
    sting: { duck: 0.4, play: (v, c) => {
      [0, 1, 2, 3, 4, 5].forEach((s, i) => v.struck({ t: c.at + i * 0.06, f: degree(v.key, s, 1), partials: GLOCK, d: 1.0, gain: 0.07, pan: (i - 2.5) * 0.15, send: 0.45 }));
      v.tone({ t: c.at + 0.4, f: degree(v.key, 0, 2), from: degree(v.key, 0, 0), glide: 0.12, a: 0.003, d: 0.15, gain: 0.05, send: 0.3 });
    } },
  };

  const CHORDS = {
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
  const PROGRESSIONS = {
    intro: ["F", "Bb9"],
    drive: ["F", "Am", "Bb", "C"],
    hold: ["F", "Bb9"],
    full: ["F", "D7", "Gm7", "C7"],
    break: ["Bbmaj7", "Am7", "Gm7", "C7sus"],
    build: ["Gm7", "Am7", "Bb", "C"],
    peak: ["F", "D7", "Gm7", "C7"],
    end: ["Bb", "C7"],
  };
  const HOOK = hook([
    [0, 84, 1], [2, 81, 1], [3, 84, 1], [6, 86, 2], [8, 84, 1], [10, 81, 2], [12, 77, 2], [14, 79, 1],
    [16, 78, 2], [18, 81, 1], [19, 84, 2], [22, 86, 2], [24, 84, 1], [26, 81, 4],
    [32, 79, 1], [34, 82, 1], [35, 86, 2], [38, 82, 1], [40, 79, 2], [43, 77, 1], [44, 79, 2], [46, 82, 1],
    [48, 84, 2], [51, 82, 1], [52, 79, 2], [54, 76, 2], [56, 79, 1], [58, 82, 1], [60, 84, 4],
  ]);
  const HOOK_FROM = { end: 2 };
  const KICK = { groove: { 0: 1, 3: 0.5, 8: 0.9, 10: 0.65 }, break: { 0: 0.8, 10: 0.45 } };
  const SNAP = { groove: new Set([4, 12]), break: new Set([8]) };
  const SLAP = { 0: [0, 1], 3: [12, 0.75, true], 6: [0, 0.55], 8: [7, 0.7], 10: [12, 0.85, true], 13: [0, 0.5], 14: [7, 0.45] };
  const CHANK = { 2: 1, 6: 0.75, 9: 0.5, 10: 1, 14: 0.75 };
  const KEYS = { 0: 1, 6: 0.7 };
  const SWING = 0.24;
  const swung = (n) => n.t + (n.step % 2 ? SWING * n.beat / 4 : 0);

  const BOUNCE = {
    bpm: 108,
    key: { root: 65, scale: [0, 2, 4, 7, 9] },
    room: { seconds: 1.3, damp: 0.4, wet: 0.4 },
    musicDb: -3,
    sfxDb: 0,
    glue: { threshold: -26, knee: 8, ratio: 4, attack: 0.002, release: 0.12 },
    chord: progression(CHORDS, PROGRESSIONS),
    mixes: {
      intro: { kick: 0.8, snap: 0.7, bass: 0.85, chank: 0.6 },
      drive: { kick: 1, snap: 0.9, jingle: 0.85, bass: 1, chank: 0.85, keys: 0.6 },
      hold: { pad: 1, keys: 0.3 },
      full: { kick: 1, snap: 1, jingle: 0.9, bass: 1, chank: 0.85, keys: 0.55, glock: 0.85 },
      break: { kick: 0.7, snap: 0.7, jingle: 0.4, bass: 0.75, chank: 0.5, keys: 0.85 },
      build: { kick: 1, snap: 0.9, jingle: 1, bass: 1, chank: 0.8, keys: 0.5, roll: 1 },
      peak: { kick: 1, snap: 1, jingle: 1, bass: 1, chank: 0.9, keys: 0.55, glock: 1, bubbles: 1 },
      end: { kick: 1, snap: 1, jingle: 1, bass: 1, chank: 0.9, glock: 1, bubbles: 0.8, roll: 0.8 },
    },
    layers: {
      kick(v, n) {
        const l = (KICK[n.mix] ?? KICK.groove)[n.step];
        if (!l) return;
        const t = swung(n);
        v.tone({ t, f: 95, from: 230, glide: 0.035, a: 0.001, h: 0.01, d: 0.14, gain: 0.36 * l, out: v.out, send: 0 });
        v.tone({ t, f: 170, from: 260, glide: 0.015, type: "triangle", a: 0.001, d: 0.045, gain: 0.14 * l, out: v.out, send: 0 });
        v.hiss({ t, f: 3000, q: 1.2, a: 0.0005, d: 0.006, gain: 0.07 * l, out: v.out, send: 0, seed: n.seed });
      },
      snap(v, n) {
        if (!(SNAP[n.mix] ?? SNAP.groove).has(n.step)) return;
        v.hiss({ t: n.t, f: 2700, q: 2.4, a: 0.0008, d: 0.03, gain: 0.24, out: v.out, pan: 0.12, send: 0.3, seed: n.seed });
        v.hiss({ t: n.t + 0.002, f: 6200, q: 1.4, a: 0.0005, d: 0.014, gain: 0.05, out: v.out, pan: 0.12, send: 0.2, seed: n.seed + 1 });
        v.tone({ t: n.t, f: 1500, from: 2300, glide: 0.006, a: 0.0005, d: 0.012, gain: 0.03, out: v.out, pan: 0.12, send: 0.1 });
      },
      jingle(v, n) {
        const accent = n.step % 4 === 2 ? 1 : n.step % 2 ? 0.3 : 0.45;
        v.hiss({ t: swung(n), f: 8600, q: 2.2, a: 0.001, d: accent === 1 ? 0.07 : 0.032, gain: 0.03 * accent, out: v.out, pan: -0.35, send: 0.08, seed: n.seed });
      },
      bass(v, n) {
        const h = SLAP[n.step];
        if (!h) return;
        const [interval, l, slap] = h, t = swung(n), f = hz(n.chord.root + interval);
        v.synth({ t, f, type: "sawtooth", a: 0.002, h: 0.035, d: 0.13, gain: 0.15 * l, cut: slap ? 3400 : 1900, cutTo: 260, cutIn: 0.08, q: 3, send: 0.02, out: v.out });
        v.synth({ t, f, type: "square", a: 0.002, h: 0.035, d: 0.13, gain: 0.06 * l, cut: 800, send: 0, out: v.out });
        if (slap) v.hiss({ t, f: 2600, q: 1.5, a: 0.0005, d: 0.006, gain: 0.07 * l, out: v.out, send: 0, seed: n.seed });
      },
      chank(v, n) {
        const l = CHANK[n.step];
        if (!l) return;
        const t = swung(n);
        n.chord.pad.slice(1).forEach((m, i) => v.synth({ t: t + i * 0.005, f: hz(m + 12), a: 0.001, d: 0.05, gain: 0.032 * l, cut: 3000, cutTo: 900, cutIn: 0.04, q: 1.6, pan: 0.32, send: 0.1, out: v.out }));
        v.hiss({ t, f: 3800, q: 1.2, a: 0.0005, d: 0.008, gain: 0.03 * l, out: v.out, pan: 0.32, send: 0.05, seed: n.seed });
      },
      pad(v, n) {
        if (n.step) return;
        const h = 4 * n.beat - 0.7;
        n.chord.pad.forEach((m, i) => v.synth({ t: n.t + i * 0.012, f: hz(m), type: "triangle", a: 0.35, h, d: 0.9, gain: 0.012, cut: 1800, pan: -0.3 + i * 0.2, send: 0.45, out: v.out }));
        v.tone({ t: n.t, f: hz(n.chord.root + 12), a: 0.3, h, d: 0.8, gain: 0.022, send: 0.1, out: v.out });
      },
      keys(v, n) {
        const l = KEYS[n.step];
        if (!l) return;
        n.chord.pad.forEach((m, i) => v.struck({ t: swung(n) + i * 0.003, f: hz(m), partials: EP, d: 0.5, gain: 0.045 * l, out: v.out, pan: -0.25 + i * 0.05, send: 0.25 }));
      },
      glock(v, n) {
        const note = hookNote(HOOK, n, HOOK_FROM[n.mix]);
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
  };

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

  window.Sound = { renderScore, sections, steps, lufs, speaker };
})();
