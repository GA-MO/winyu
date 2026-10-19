const AAC_PRIMING_SAMPLES = 2112;
const EDTS_SIZE = 36;
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

type Box = { type: string; start: number; size: number };

function children(view: DataView, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  for (let at = start; at < end;) {
    const size = view.getUint32(at);
    if (size < 8) throw new Error(`Unsupported MP4 box size ${size} at ${at}`);
    boxes.push({ type: String.fromCharCode(...new Uint8Array(view.buffer, at + 4, 4)), start: at, size });
    at += size;
  }
  return boxes;
}

const child = (view: DataView, box: Box, type: string) => children(view, box.start + 8, box.start + box.size).find((b) => b.type === type);

function path(view: DataView, box: Box, types: string[]): Box {
  return types.reduce((b, type) => {
    const next = child(view, b, type);
    if (!next) throw new Error(`MP4 has no ${type} inside ${b.type}`);
    return next;
  }, box);
}

function chunkOffsetTables(view: DataView, box: Box): Box[] {
  if (box.type === "stco" || box.type === "co64") return [box];
  if (!CONTAINERS.has(box.type)) return [];
  return children(view, box.start + 8, box.start + box.size).flatMap((b) => chunkOffsetTables(view, b));
}

/** Adds an edit list to the audio track that skips the AAC encoder priming, so sound stays on its frames and the loop has no gap. */
export function trimAacPriming(mp4: ArrayBuffer, samples: number): ArrayBuffer {
  const source = new DataView(mp4);
  const top = children(source, 0, mp4.byteLength);
  const moov = top.find((b) => b.type === "moov");
  const mdat = top.find((b) => b.type === "mdat");
  if (!moov || !mdat || mdat.start < moov.start) throw new Error("Expected a fast-start MP4 (moov before mdat)");
  const mvhd = path(source, moov, ["mvhd"]);
  if (source.getUint8(mvhd.start + 8) !== 0) throw new Error("Expected a version 0 mvhd");
  const movieScale = source.getUint32(mvhd.start + 20);
  const audio = children(source, moov.start + 8, moov.start + moov.size)
    .filter((b) => b.type === "trak")
    .find((trak) => {
      const hdlr = path(source, trak, ["mdia", "hdlr"]);
      return String.fromCharCode(...new Uint8Array(mp4, hdlr.start + 16, 4)) === "soun";
    });
  if (!audio) throw new Error("MP4 has no audio track");
  if (child(source, audio, "edts")) throw new Error("Audio track already has an edit list");
  const tkhd = path(source, audio, ["tkhd"]);
  if (source.getUint8(tkhd.start + 8) !== 0) throw new Error("Expected a version 0 tkhd");
  const sampleRate = source.getUint32(path(source, audio, ["mdia", "mdhd"]).start + 20);
  const segment = Math.round((samples / sampleRate) * movieScale);

  const insertAt = tkhd.start + tkhd.size;
  const out = new Uint8Array(mp4.byteLength + EDTS_SIZE);
  out.set(new Uint8Array(mp4, 0, insertAt), 0);
  out.set(new Uint8Array(mp4, insertAt), insertAt + EDTS_SIZE);
  const view = new DataView(out.buffer);
  view.setUint32(insertAt, EDTS_SIZE);
  out.set([..."edts"].map((c) => c.charCodeAt(0)), insertAt + 4);
  view.setUint32(insertAt + 8, EDTS_SIZE - 8);
  out.set([..."elst"].map((c) => c.charCodeAt(0)), insertAt + 12);
  view.setUint32(insertAt + 16, 0);
  view.setUint32(insertAt + 20, 1);
  view.setUint32(insertAt + 24, segment);
  view.setInt32(insertAt + 28, AAC_PRIMING_SAMPLES);
  view.setUint32(insertAt + 32, 0x00010000);

  view.setUint32(moov.start, moov.size + EDTS_SIZE);
  view.setUint32(audio.start, audio.size + EDTS_SIZE);
  view.setUint32(tkhd.start + 28, segment);
  const grown = { type: "moov", start: moov.start, size: moov.size + EDTS_SIZE };
  const durations = children(view, grown.start + 8, grown.start + grown.size)
    .filter((b) => b.type === "trak")
    .map((trak) => view.getUint32(path(view, trak, ["tkhd"]).start + 28));
  view.setUint32(mvhd.start + 24, Math.max(...durations));

  for (const table of chunkOffsetTables(view, grown)) {
    const count = view.getUint32(table.start + 12);
    for (let i = 0; i < count; i++) {
      if (table.type === "stco") view.setUint32(table.start + 16 + i * 4, view.getUint32(table.start + 16 + i * 4) + EDTS_SIZE);
      else view.setBigUint64(table.start + 16 + i * 8, view.getBigUint64(table.start + 16 + i * 8) + BigInt(EDTS_SIZE));
    }
  }
  return out.buffer;
}
