import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const copRoot = path.resolve(root, "..");
const vexaSource = path.resolve(copRoot, "../agentic-ui/src");

const CLIENT_BUILD = path.join(root, "build", "client");

function prerenderedIndex(): Plugin {
  return {
    name: "cop-site-prerendered-index",
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        const [pathname, search = ""] = (request.url ?? "/").split("?");
        if (pathname.endsWith("/") || path.extname(pathname)) return next();
        if (existsSync(path.join(CLIENT_BUILD, pathname, "index.html"))) request.url = `${pathname}/index.html${search ? `?${search}` : ""}`;
        next();
      });
    },
  };
}

const VEXA_ENTRIES = ["protocol", "core", "server", "mock", "admin", "react", "chat"];

export default defineConfig(({ command }) => ({
  base: process.env.COP_SITE_BASE_PATH ?? "/",
  plugins: [fumadocsMdx(), tailwindcss(), reactRouter(), prerenderedIndex()],
  css: { postcss: {} },
  ssr: { noExternal: command === "build" ? true : [/^vexa/] },
  optimizeDeps: { include: ["react", "react-dom", "react/jsx-runtime", "@fuma-translate/react", "@radix-ui/react-direction", "lucide-react", "next-themes"] },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: /^~\//, replacement: `${path.join(root, "app")}/` },
      { find: /^@\//, replacement: `${copRoot}/` },
      { find: /^vexa$/, replacement: path.join(vexaSource, "index.ts") },
      ...VEXA_ENTRIES.map((entry) => ({ find: new RegExp(`^vexa/${entry}$`), replacement: path.join(vexaSource, entry, "index.ts") })),
      { find: /^vexa\/lib\//, replacement: `${path.join(vexaSource, "lib")}/` },
      { find: /^vexa\/ui\//, replacement: `${path.join(vexaSource, "ui")}/` },
      { find: /^vexa\/ai-elements\//, replacement: `${path.join(vexaSource, "ai-elements")}/` },
    ],
  },
}));
