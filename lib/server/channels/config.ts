const DEFAULT_WEB_ORIGIN = "http://localhost:3100";
const TRAILING_SLASH = /\/+$/;

/** The address people open Winyu's web app at, for the "continue in the web" links a chat app shows (`WINYU_PUBLIC_URL`, e.g. https://winyu.example.com). */
export function channelWebOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return (env.WINYU_PUBLIC_URL ?? DEFAULT_WEB_ORIGIN).replace(TRAILING_SLASH, "");
}
