import { TH } from "./th";

/** What an audit code means to the admin, in Thai: the code's own label, else the reason the tool gave, else a plain "not done"; never the raw code. */
export function auditCodeLabel(code: string, reason?: string | null): string {
  return TH.adminAudit.codes[code] ?? (reason || TH.adminAudit.otherCode);
}
