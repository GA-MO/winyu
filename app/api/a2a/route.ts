import { handleA2aRequest } from "@/lib/server/a2a";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleA2aRequest(request);
}
