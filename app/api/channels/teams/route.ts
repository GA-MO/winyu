import { after } from "next/server";
import { handleTeamsWebhook } from "@/lib/server/channels/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request): Promise<Response> {
  return handleTeamsWebhook(request, (task) => after(() => task));
}
