import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

const resolveAlias = {
  ai: "./node_modules/ai",
  "ai/test": "./node_modules/ai/dist/test/index.mjs",
  "@ai-sdk/react": "./node_modules/@ai-sdk/react",
};

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(appDir, ".."),
  turbopack: { resolveAlias },
};

export default nextConfig;
