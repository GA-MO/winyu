import { after } from "next/server";
import { handleLineWebhook } from "@/lib/server/channels/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request): Promise<Response> {
  return handleLineWebhook(request, (task) => after(() => task));
}
