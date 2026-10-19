import { streamText } from "ai";
import { agentModel } from "@/lib/server/models";

const TIERS = ["chat", "chatFallback"] as const;
const QUESTION = "ยอดขายเบียร์ภาคเหนือตกลง 12% ในไตรมาสนี้ ขณะที่ภาคใต้โต 8% ช่วยคิดว่าควรตรวจสอบอะไรก่อนเป็นลำดับ 3 ข้อ พร้อมเหตุผลสั้นๆ";

type Tier = (typeof TIERS)[number];

/** When each kind of chunk first arrived (ms after the call) and the longest silence between two chunks. */
async function firstChunks(tier: Tier): Promise<Record<string, number>> {
  const configured = agentModel();
  if (!configured) throw new Error("OPENROUTER_API_KEY is not set");
  const started = Date.now();
  const seen: Record<string, number> = { longestGap: 0 };
  let last = started;
  const result = streamText({ model: configured[tier](), prompt: QUESTION });
  for await (const part of result.fullStream) {
    const now = Date.now();
    seen.longestGap = Math.max(seen.longestGap, now - last);
    last = now;
    seen[part.type] ??= now - started;
  }
  return seen;
}

for (const tier of TIERS) console.log(tier, await firstChunks(tier));
