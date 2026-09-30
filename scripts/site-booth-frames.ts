import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sleep, waitFor, withHeadlessPage } from "./booth/chrome";

const SITE_URL = "http://localhost:3200";
const CSS_STAGE_GRACE_MS = 2500;
const [cut, outDir, ...times] = process.argv.slice(2);

if (!cut || !outDir || times.length === 0) throw new Error("Usage: bun run scripts/site-booth-frames.ts <cut> <out-dir> <t> [t…]  (BOOTH_DEBUG_PORT picks the Chrome port)");
mkdirSync(outDir, { recursive: true });

await withHeadlessPage({ width: 1920, height: 1080, scale: Number(process.env.BOOTH_FRAME_SCALE ?? 0.5) }, async (page) => {
  for (const t of times) {
    await page.navigate(`${SITE_URL}/booth?cut=${cut}&t=${t}`);
    await page.evaluate("document.fonts.ready.then(() => Promise.all([...document.images].map((image) => image.decode().catch(() => 0))))");
    const shownAt = Date.now();
    await waitFor(`frame ${t}`, async () => {
      if (await page.evaluate(`document.body.dataset.boothFrame === ${JSON.stringify(String(Number(t)))}`)) return true;
      return Date.now() - shownAt > CSS_STAGE_GRACE_MS && !(await page.evaluate(`Boolean(document.querySelector("canvas"))`)) ? true : null;
    });
    await sleep(250);
    const { data } = (await page.send("Page.captureScreenshot", { format: "jpeg", quality: 85 })) as { data: string };
    const file = path.join(outDir, `${cut}-${t}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(file);
  }
});
