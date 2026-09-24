import type { Course } from "@/lib/contracts";

/** The learning system: the course catalogue with seats and dates. */
export type LearningPort = { courses(): Promise<readonly Course[]> };
