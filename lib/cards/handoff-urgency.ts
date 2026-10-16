import { isPressed } from "@/components/chat/pressed";
import type { Urgency } from "@/lib/contracts";

const URGENT_WORDS = /ด่วน|urgent|asap/i;
const DEFAULT_URGENCY: Urgency = "medium";

/** Whether the person's own words ask for it urgently (ด่วน, urgent, asap). */
export function saysUrgent(text: string): boolean {
  return URGENT_WORDS.test(text);
}

/** The urgency a handoff goes out with: high only when the person's own words ask for it, the urgency a pressed button carried when they pressed one, and medium otherwise; the model never makes a handoff urgent by itself. */
export function handoffUrgency(asked: Urgency | undefined, question: string | null): Urgency {
  if (question && isPressed(question)) return asked ?? DEFAULT_URGENCY;
  if (question && saysUrgent(question)) return "high";
  return asked === "low" ? "low" : DEFAULT_URGENCY;
}
