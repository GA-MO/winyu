import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { waitFor, withHeadlessPage } from "./chrome";

const PORT = Number(process.env.BOOTH_SHOTS_PORT ?? 3232);
const FILM_DIR = import.meta.dir;

const [filmName, timesArg, outDir = "out/shots", sizeArg] = process.argv.slice(2);
if (!filmName || !timesArg) throw new Error("Usage: bun run shots <film.html> <t1,t2,...> [out dir] [1920x1080]");
const [width, height] = (sizeArg ?? "1920x1080").split("x").map(Number);

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const file = Bun.file(path.join(FILM_DIR, path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "")));
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});

try {
  await withHeadlessPage({ width, height, scale: 1 }, async ({ send, evaluate }) => {
    await send("Page.navigate", { url: `http://localhost:${PORT}/${filmName}?capture` });
    await waitFor("the film", async () => ((await evaluate("Boolean(window.film && window.film.ready)")) ? true : null));
    mkdirSync(outDir, { recursive: true });
    for (const t of timesArg.split(",").map(Number)) {
      await evaluate(`window.film.render(${t})`);
      const { data } = (await send("Page.captureScreenshot", { format: "png" })) as { data: string };
      const out = path.join(outDir, `${path.basename(filmName, ".html")}-${t.toFixed(2)}.png`);
      writeFileSync(out, Buffer.from(data, "base64"));
      console.log(out);
    }
  });
} finally {
  server.stop(true);
}
