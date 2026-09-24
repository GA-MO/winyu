import type { Candidate } from "@/lib/contracts";

/** The applicant tracking system: every candidate for every open position. */
export type RecruitingPort = { candidates(): Promise<readonly Candidate[]> };
