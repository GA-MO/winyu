const LOOPBACK_SWAP: Record<string, string> = { localhost: "127.0.0.1", "127.0.0.1": "localhost" };
const SIGN_IN_AS_PATH = "/dev/as";
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);
const HREF = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const ENTITY_DECODE: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" };
const ENTITY_ENCODE: Record<string, string> = { "&": "&amp;", '"': "&quot;", "'": "&#39;", "<": "&lt;", ">": "&gt;" };

/** The page a demo screen runs on, as `window.location` or the request's host describes it. */
export type LoopbackPage = { protocol: string; hostname: string; port: string };

/** Where a demo screen opens a link: a link into this Winyu (a loopback host on the page's port) opens on the other loopback host through /dev/as signed in as `userId`, so the presenter's own tab keeps its session; any other http(s) link opens as it is; anything else (javascript:, data:, unparseable) is null and must not open. */
export function signInAsLinkOf(link: string, page: LoopbackPage, userId: string): string | null {
  const url = URL.canParse(link) ? new URL(link) : null;
  if (!url || !WEB_PROTOCOLS.has(url.protocol)) return null;
  const other = LOOPBACK_SWAP[page.hostname];
  if (!other || !LOOPBACK_SWAP[url.hostname] || url.port !== page.port) return link;
  const query = new URLSearchParams({ user: userId, next: `${url.pathname}${url.search}${url.hash}` });
  return `${page.protocol}//${other}:${page.port}${SIGN_IN_AS_PATH}?${query.toString()}`;
}

/** A mail's HTML with every link passed through `signInAsLinkOf`: links that must not open lose their href. */
export function rewriteMailLinks(html: string, page: LoopbackPage, userId: string): string {
  return html.replace(HREF, (_match, doubleQuoted: string | undefined, singleQuoted: string | undefined) => {
    const link = (doubleQuoted ?? singleQuoted ?? "").replace(/&(?:amp|quot|#39|lt|gt);/g, (entity) => ENTITY_DECODE[entity]);
    const target = signInAsLinkOf(link.trim(), page, userId);
    return target === null ? "" : ` href="${target.replace(/[&"'<>]/g, (char) => ENTITY_ENCODE[char])}"`;
  });
}
