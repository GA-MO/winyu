import { LineChart, Megaphone, Package, Sparkles, Store, Target, TrendingUp, TriangleAlert, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const RULES: readonly { match: readonly string[]; icon: LucideIcon }[] = [
  { match: ["ผิดปกติ", "แจ้งเตือน", "ตก", "ลด"], icon: TriangleAlert },
  { match: ["เป้า", "attainment"], icon: Target },
  { match: ["เอเย่นต์", "ร้าน", "ซับ"], icon: Store },
  { match: ["สต๊อก", "สินค้า", "คงเหลือ", "ผลิต"], icon: Package },
  { match: ["แคมเปญ", "โฆษณา", "เสียง", "ความรู้สึก"], icon: Megaphone },
  { match: ["ลูกหนี้", "เงิน", "งบ", "กำไร", "มูลค่า"], icon: Wallet },
  { match: ["พยากรณ์", "คลาดเคลื่อน", "แนวโน้ม"], icon: LineChart },
  { match: ["พนักงาน", "ลาออก", "ทีม"], icon: Users },
  { match: ["ยอด", "ขาย", "ปริมาณ"], icon: TrendingUp },
];

function iconFor(text: string): LucideIcon {
  const found = RULES.find((rule) => rule.match.some((word) => text.includes(word)));
  return found?.icon ?? Sparkles;
}

/** The small lucide icon a quick-action chip carries, picked from the words in its label. */
export function ChipIcon({ text, className }: { text: string; className?: string }) {
  const Icon = iconFor(text);
  return <Icon className={className ?? "size-3.5 shrink-0 text-muted-foreground"} aria-hidden />;
}
