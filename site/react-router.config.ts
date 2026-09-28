import type { Config } from "@react-router/dev/config";
import { createGetUrl, getSlugs } from "fumadocs-core/source";
import { glob } from "node:fs/promises";

const DOCS_BASE_URL = "/docs";
const DOCS_CONTENT_DIR = "content/docs";

const getDocsUrl = createGetUrl(DOCS_BASE_URL);

async function docsPaths() {
  const paths = new Set<string>([DOCS_BASE_URL]);
  for await (const entry of glob("**/*.mdx", { cwd: DOCS_CONTENT_DIR })) paths.add(getDocsUrl(getSlugs(entry)));
  return paths;
}

export default {
  ssr: false,
  basename: process.env.WINYU_SITE_BASE_PATH ?? "/",
  async prerender({ getStaticPaths }) {
    return [...new Set([...getStaticPaths(), ...(await docsPaths())])];
  },
} satisfies Config;
