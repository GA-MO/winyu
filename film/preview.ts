import path from "node:path";

const PORT = Number(process.env.BOOTH_PREVIEW_PORT ?? 3230);
const FILM_DIR = import.meta.dir;

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const file = Bun.file(path.join(FILM_DIR, path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "")));
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});
console.log(`Booth films at ${server.url}hybrid.html and ${server.url}isometric.html`);
