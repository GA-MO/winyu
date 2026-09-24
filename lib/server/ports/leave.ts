import type { LeaveKind, LeavePolicy } from "@/lib/contracts";

/** The HR leave system: its rules and how much of each kind an employee has taken this year. */
export type LeavePort = {
  policy(): Promise<LeavePolicy>;
  usedThisYear(employeeId: string): Promise<Readonly<Record<LeaveKind, number>>>;
};
