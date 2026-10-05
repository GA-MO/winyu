import { handleAgentCardRequest } from "@/lib/server/a2a";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleAgentCardRequest;
