import { FEED_ACTIONS, type FeedAction } from "@/lib/contracts";
import { badRequest, notFound, readBody, requireAccess, unauthenticated } from "../_guard";
import { actOnFeedItem } from "@/lib/server/feed";

type ActionBody = { key?: unknown; action?: unknown };

function isAction(value: unknown): value is FeedAction {
  return typeof value === "string" && FEED_ACTIONS.includes(value as FeedAction);
}

/** The user opened, finished, put off or disowned one item of their own feed; items outside it do not exist for them. */
export async function POST(req: Request) {
  const access = await requireAccess();
  if (!access) return unauthenticated();
  const body = await readBody<ActionBody>(req);
  if (!body || typeof body.key !== "string" || !isAction(body.action)) return badRequest();
  const result = await actOnFeedItem(access, body.key, body.action);
  if (result.ok) return Response.json({ ok: true });
  return result.status === 404 ? notFound() : badRequest();
}
