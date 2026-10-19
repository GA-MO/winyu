import path from "node:path";
import { waitFor, withHeadlessPage } from "./chrome";

const PORT = Number(process.env.BOOTH_CHECK_PORT ?? 3233);
const FILM_DIR = import.meta.dir;

const [mp4, onsetsArg] = process.argv.slice(2);
if (!mp4) throw new Error("Usage: bun run check-audio <film.mp4> [t1,t2,...]  (times to look for an audio onset near)");
const onsets = onsetsArg ? onsetsArg.split(",").map(Number) : [];

const probe = `
import { ALL_FORMATS, Input, UrlSource } from "mediabunny";
window.__probe = async (onsets) => {
  const input = new Input({ source: new UrlSource("/film.mp4"), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  const report = {
    video: video ? { codec: video.codec, duration: await video.computeDuration(), frames: (await video.computePacketStats()).packetCount } : null,
    audio: audio ? { codec: audio.codec, sampleRate: audio.sampleRate, channels: audio.numberOfChannels, duration: await audio.computeDuration() } : null,
  };
  if (!audio) return report;
  const rate = audio.sampleRate;
  const bytes = await (await fetch("/film.mp4")).arrayBuffer();
  const decoded = await new OfflineAudioContext(2, 1, rate).decodeAudioData(bytes);
  const n = report.video ? Math.min(decoded.length, Math.round(report.video.duration * rate)) : decoded.length;
  const chs = [0, 1].map((c) => decoded.getChannelData(Math.min(c, decoded.numberOfChannels - 1)));
  report.decodedSeconds = decoded.length / rate;
  report.loopSeconds = n / rate;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (chs[0][i] + chs[1][i]) / 2;
  const db = (v) => 20 * Math.log10(v);
  const rms = (d, a, b) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / (b - a)); };
  let peak = 0;
  for (const d of chs) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const w = Math.round(0.05 * rate);
  const steps = new Float32Array(n - 1);
  for (let i = 0; i < n - 1; i++) steps[i] = Math.abs(mono[i + 1] - mono[i]);
  const sorted = Float32Array.from(steps).sort();
  const hop = Math.round(0.001 * rate);
  const env = [];
  for (let i = 0; i + hop <= n; i += hop) { let hp = 0; for (let k = i; k < i + hop; k++) hp += (mono[k] - (k ? mono[k - 1] : 0)) ** 2; env.push(hp); }
  const biquad = (x, type, f) => {
    const w = 2 * Math.PI * f / rate, al = Math.sin(w) / (2 * Math.SQRT1_2), cw = Math.cos(w);
    const [b0, b1, b2] = type === "high" ? [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2] : [(1 - cw) / 2, 1 - cw, (1 - cw) / 2];
    const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al, y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
    return y;
  };
  const band = (type, f) => +(db(rms(biquad(biquad(mono, type, f), type, f), 0, n)) - db(rms(mono, 0, n))).toFixed(1);
  const onsetNear = (t) => {
    const a = Math.max(1, Math.floor((t - 0.05) * rate / hop)), b = Math.min(env.length - 1, Math.ceil((t + 0.05) * rate / hop));
    let best = a, rise = -Infinity;
    for (let k = a; k <= b; k++) { const r = Math.log10(env[k] + 1e-12) - Math.log10(env[k - 1] + 1e-12); if (r > rise) { rise = r; best = k; } }
    return { cue: t, onset: +(best * hop / rate).toFixed(3), riseDb: +(10 * rise).toFixed(1) };
  };
  report.signal = {
    samples: n,
    peakDbfs: +db(peak).toFixed(2),
    integratedLufs: +window.Sound.lufs(chs).toFixed(2),
    rmsDbfs: +db(rms(mono, 0, n)).toFixed(2),
    bandsDbRelative: { below90Hz: band("low", 90), above6kHz: band("high", 6000) },
    seam: {
      firstMsRmsDb: +db(rms(mono, 0, w)).toFixed(2),
      lastMsRmsDb: +db(rms(mono, n - w, n)).toFixed(2),
      wrapStep: +Math.abs(mono[0] - mono[n - 1]).toFixed(5),
      localMaxStep: +Math.max(...Array.from({ length: 96 }, (_, k) => k < 48 ? steps[n - 50 + k] : steps[k - 48])).toFixed(5),
      p999Step: +sorted[Math.floor(sorted.length * 0.999)].toFixed(5),
      maxStep: +sorted[sorted.length - 1].toFixed(5),
    },
    onsets: onsets.map(onsetNear),
  };
  return report;
};
`;

const built = await Bun.build({
  entrypoints: ["probe.js"],
  target: "browser",
  format: "esm",
  plugins: [{ name: "probe", setup: (b) => { b.onResolve({ filter: /^probe\.js$/ }, () => ({ path: "probe.js", namespace: "probe" })); b.onLoad({ filter: /.*/, namespace: "probe" }, () => ({ contents: probe, loader: "js", resolveDir: FILM_DIR })); } }],
});
if (!built.success) throw new Error(built.logs.map(String).join("\n"));
const script = await built.outputs[0].text();

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/film.mp4") return new Response(Bun.file(path.resolve(mp4)));
    if (pathname === "/probe.js") return new Response(script, { headers: { "content-type": "text/javascript" } });
    if (pathname === "/sound.js") return new Response(Bun.file(path.join(FILM_DIR, "sound.js")));
    return new Response(`<!doctype html><script src="/sound.js"></script><script type="module" src="/probe.js"></script>`, { headers: { "content-type": "text/html" } });
  },
});

try {
  await withHeadlessPage({ width: 400, height: 300, scale: 1 }, async ({ navigate, evaluate }) => {
    await navigate(`http://localhost:${PORT}/`);
    await waitFor("the probe", async () => ((await evaluate("typeof window.__probe === 'function'")) ? true : null));
    const report = await evaluate(`window.__probe(${JSON.stringify(onsets)})`) as Record<string, unknown>;
    console.log(JSON.stringify({ file: mp4, ...report }, null, 2));
  });
} finally {
  server.stop(true);
}
