import type { LeaveBalance, LeavePolicy, LeaveRequest, LeaveSubmission } from "@/lib/contracts";

/** The HR leave system: its published rules, each employee's balances as it counts them, and the requests it holds and decides. */
export type LeavePort = {
  policy(): Promise<LeavePolicy>;
  balances(employeeId: string): Promise<readonly LeaveBalance[]>;
  requests(employeeId: string): Promise<readonly LeaveRequest[]>;
  submit(submission: LeaveSubmission): Promise<LeaveRequest>;
  decide(requestId: string, approverId: string, approved: boolean): Promise<LeaveRequest | null>;
};
