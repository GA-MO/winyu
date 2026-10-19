import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { waitFor, withHeadlessPage } from "./chrome";

const PORT = Number(process.env.BOOTH_CONTINUITY_PORT ?? 3234);
const FILM_DIR = import.meta.dir;

const [filmName, outDir = "out/continuity", mp4] = process.argv.slice(2);
if (!filmName) throw new Error("Usage: bun run continuity <film.html> [out dir] [film.mp4]  (momentary loudness of the mix and of the music alone, every drop, and a chart; without an MP4 it reads the film's own rendered score)");

const probe = `async (HAS_MP4) => {
  const film = window.film, length = film.length, rate = 48000, HOP = 0.05, BLOCK = 0.4;
  const DROP_DB = 6, DROP_WITHIN = 0.25, HOLE_DB = 15, HOLE_MIN = 0.03, FRAME = 0.01;
  const decoded = HAS_MP4 ? await new OfflineAudioContext(2, 1, rate).decodeAudioData(await (await fetch("/film.mp4")).arrayBuffer()) : await film.audio();
  const n = Math.round(length * rate);
  const mix = [0, 1].map((c) => decoded.getChannelData(Math.min(c, decoded.numberOfChannels - 1)).slice(0, n));
  const stem = await Sound.musicStem(film.score, length);
  const sections = Sound.sections(film.score, length);
  const cues = film.score.cues.filter((c) => c.sfx !== "key");
  const windows = Sound.windowStarts(length);
  const g = Sound.grid(film.score, length);
  const bars = Array.from({ length: g.bars }, (_, b) => g.at(4 * b));
  const near = (t) => {
    const hits = [...sections.map((s) => ({ t: s.joins, what: "section " + s.mix })), ...cues.map((c) => ({ t: c.at, what: c.sfx })), ...windows.map((w) => ({ t: w, what: "window" }))];
    return hits.filter((h) => Math.abs(h.t - t) < 0.3).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t)).slice(0, 3).map((h) => h.what + "@" + h.t.toFixed(2));
  };
  const drops = (L) => {
    const w = Math.round(DROP_WITHIN / HOP), out = [];
    for (let i = 0; i < L.length; i++) {
      let lo = Infinity, at = i;
      for (let j = 1; j <= w; j++) { const v = L[(i + j) % L.length]; if (v < lo) { lo = v; at = (i + j) % L.length; } }
      const depth = L[i] - lo;
      if (depth <= DROP_DB) continue;
      const t = +((i * HOP + BLOCK / 2) % length).toFixed(2), bottom = +((at * HOP + BLOCK / 2) % length).toFixed(2);
      const last = out[out.length - 1];
      if (last && (i - last.i) <= w) { if (depth > last.depth) Object.assign(last, { depth: +depth.toFixed(1), bottom, toLufs: +lo.toFixed(1) }); last.i = i; continue; }
      out.push({ i, t, bottom, depth: +depth.toFixed(1), fromLufs: +L[i].toFixed(1), toLufs: +lo.toFixed(1), near: near(t) });
    }
    return out.map(({ i, ...d }) => d);
  };
  const frames = (chs) => {
    const f = Math.round(FRAME * rate), out = new Float32Array(Math.floor(n / f));
    for (let k = 0; k < out.length; k++) { let s = 0; for (let i = k * f; i < (k + 1) * f; i++) { const m = (chs[0][i] + chs[1][i]) / 2; s += m * m; } out[k] = 10 * Math.log10(s / f + 1e-12); }
    return out;
  };
  const holes = (F) => {
    const out = [], ctx = Math.round(1 / FRAME), min = Math.round(HOLE_MIN / FRAME);
    let run = 0;
    for (let k = 0; k < F.length + 1; k++) {
      const prev = Array.from({ length: ctx }, (_, j) => F[(k - 1 - j + F.length) % F.length]).sort((a, b) => a - b);
      const median = prev[ctx >> 1];
      if (k < F.length && F[k] < median - HOLE_DB) { run++; continue; }
      if (run >= min) { const t = (k - run) * FRAME; out.push({ t: +t.toFixed(2), ms: run * FRAME * 1000, belowDb: +(median - F[k - 1]).toFixed(1), near: near(t) }); }
      run = 0;
    }
    return out;
  };
  const seamSteps = (F, at) => at.map((t) => { const k = Math.round(t / FRAME); return Math.abs(F[(k + 1) % F.length] - F[(k - 1 + F.length) % F.length]); });
  const median = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
  const M = Sound.momentary(mix, HOP), S = Sound.momentary(stem, HOP);
  const barSwing = (L) => median(bars.map((b, i) => { const from = Math.round(b / HOP), to = Math.round((b + 4 * g.beat) / HOP); const v = Array.from({ length: to - from }, (_, j) => L[(from + j) % L.length]); return Math.max(...v) - Math.min(...v); }));
  const FS = frames(stem);
  const random = Array.from({ length: 400 }, (_, i) => (i + 0.5) * length / 400);
  const report = {
    length, bars: g.bars, beat: +g.beat.toFixed(4), phase: +g.phase.toFixed(3),
    source: HAS_MP4 ? "mp4" : "score",
    mix: { medianLufs: +median(M).toFixed(1), minLufs: +Math.min(...M).toFixed(1), barSwingDb: +barSwing(M).toFixed(1), drops: drops(M) },
    music: { medianLufs: +median(S).toFixed(1), minLufs: +Math.min(...S).toFixed(1), barSwingDb: +barSwing(S).toFixed(1), drops: drops(S), holes: holes(FS) },
    windowSeams: { count: windows.length, medianStepDb: +median(seamSteps(FS, windows)).toFixed(2), maxStepDb: +Math.max(...seamSteps(FS, windows)).toFixed(2), randomMedianStepDb: +median(seamSteps(FS, random)).toFixed(2) },
    sections,
  };

  const W = 3600, H = 900, padL = 70, padR = 20, top = 70, bottom = 120, lo = -50, hi = -5;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  const X = (t) => padL + (t / length) * (W - padL - padR), Y = (db) => top + (1 - (Math.max(lo, Math.min(hi, db)) - lo) / (hi - lo)) * (H - top - bottom);
  c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
  c.font = "20px sans-serif"; c.fillStyle = "#555";
  for (let db = lo; db <= hi; db += 5) { c.strokeStyle = "#eee"; c.beginPath(); c.moveTo(padL, Y(db)); c.lineTo(W - padR, Y(db)); c.stroke(); c.fillText(db, 10, Y(db) + 6); }
  for (let s = 0; s <= length; s += 5) c.fillText(s + "s", X(s) - 12, H - bottom + 26);
  c.strokeStyle = "#f2f2f2"; bars.forEach((b) => { c.beginPath(); c.moveTo(X(b), top); c.lineTo(X(b), H - bottom); c.stroke(); });
  c.setLineDash([6, 6]); c.strokeStyle = "#9ca3af"; windows.forEach((w) => { c.beginPath(); c.moveTo(X(w), top); c.lineTo(X(w), H - bottom); c.stroke(); }); c.setLineDash([]);
  const PAL = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#65a30d", "#b45309", "#4f46e5", "#dc2626", "#0f766e", "#7c3aed"];
  sections.forEach((s, i) => { c.strokeStyle = c.fillStyle = PAL[i % PAL.length]; c.lineWidth = 3; c.beginPath(); c.moveTo(X(s.joins), 40); c.lineTo(X(s.joins), H - bottom); c.stroke(); c.lineWidth = 1; c.font = "bold 22px sans-serif"; c.fillText(s.mix, X(s.joins) + 4, 34 + (i % 2) * 22); });
  const CUE = { hit: "#dc2626", whoosh: "#2563eb", memory: "#9333ea", echo: "#9333ea", sting: "#ea580c" };
  cues.forEach((q) => { c.strokeStyle = CUE[q.sfx] ?? "#9ca3af"; c.lineWidth = CUE[q.sfx] ? 3 : 1.5; const h = CUE[q.sfx] ? 40 : 18; c.beginPath(); c.moveTo(X(q.at), H - bottom + 34); c.lineTo(X(q.at), H - bottom + 34 + h); c.stroke(); c.lineWidth = 1; });
  const plot = (L, color, shift = 0, width = 2.5) => { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); L.forEach((v, i) => { const x = X((i * HOP + BLOCK / 2) % length); if (i === 0 || x < X(0.3)) c.moveTo(x, Y(v + shift)); else c.lineTo(x, Y(v + shift)); }); c.stroke(); c.lineWidth = 1; };
  const shift = median(M) - median(S) - 8;
  plot(S, "#8b5cf6", shift, 2.5);
  plot(M, "#111827", 0, 2.5);
  [[report.mix.drops, "#111827"], [report.music.drops, "#8b5cf6"]].forEach(([ds, col]) => ds.forEach((d) => { c.strokeStyle = "#dc2626"; c.lineWidth = 3; c.beginPath(); c.arc(X(d.bottom), Y(d.toLufs + (col === "#111827" ? 0 : shift)), 14, 0, 2 * Math.PI); c.stroke(); c.lineWidth = 1; }));
  report.music.holes.forEach((h) => { c.fillStyle = "rgba(220,38,38,.25)"; c.fillRect(X(h.t), top, Math.max(4, X(h.t + h.ms / 1000) - X(h.t)), H - top - bottom); });
  c.font = "22px sans-serif"; c.fillStyle = "#111827"; c.fillText("mix momentary LUFS (black) · music alone, shifted " + shift.toFixed(1) + " dB (violet) · dashed: 4 s render windows · thin gray: bar lines · ticks: cues (red hit, blue whoosh, violet memory, orange sting) · red circles: drops > 6 dB in 250 ms · red bands: music holes", padL, H - 14);
  return { report, png: cv.toDataURL("image/png").split(",")[1] };
}`;

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/film.mp4" && mp4) return new Response(Bun.file(path.resolve(mp4)));
    const file = Bun.file(path.join(FILM_DIR, path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "")));
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});

try {
  await withHeadlessPage({ width: 1920, height: 1080, scale: 1 }, async ({ send, evaluate }) => {
    await send("Page.navigate", { url: `http://localhost:${PORT}/${filmName}?capture` });
    await waitFor("the film", async () => ((await evaluate("Boolean(window.film && window.film.ready)")) ? true : null));
    const { report, png } = (await evaluate(`(${probe})(${Boolean(mp4)})`)) as { report: Record<string, unknown>; png: string };
    mkdirSync(outDir, { recursive: true });
    const base = path.join(outDir, path.basename(mp4 ?? filmName, mp4 ? ".mp4" : ".html"));
    writeFileSync(`${base}-continuity.png`, Buffer.from(png, "base64"));
    writeFileSync(`${base}-continuity.json`, JSON.stringify({ file: mp4 ?? filmName, ...report }, null, 2));
    console.log(JSON.stringify({ file: mp4 ?? filmName, chart: `${base}-continuity.png`, ...report }, null, 2));
  });
} finally {
  server.stop(true);
}
