import type { Course, Enrollment, SeatRequest } from "@/lib/contracts";

/** The learning system: the course catalogue with seats and dates (`enrolled` counts every seat held), each employee's enrollments, and the seat requests it holds and decides. */
export type LearningPort = {
  courses(): Promise<readonly Course[]>;
  enrollments(employeeId: string): Promise<readonly Enrollment[]>;
  requestSeat(request: SeatRequest): Promise<Enrollment>;
  decide(enrollmentId: string, approverId: string, approved: boolean): Promise<Enrollment | null>;
};
