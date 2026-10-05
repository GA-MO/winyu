const DEFAULT_WEB_ORIGIN = "http://localhost:3200";
const TRAILING_SLASH = /\/+$/;

/** The address people open mascop's web app at, for the "continue in the web" links a chat app shows (`MASCOP_PUBLIC_URL`, e.g. https://mascop.example.com). */
export function channelWebOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return (env.MASCOP_PUBLIC_URL ?? DEFAULT_WEB_ORIGIN).replace(TRAILING_SLASH, "");
}
