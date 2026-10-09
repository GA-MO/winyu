import type { Course, Enrollment, SeatRequest, TrainingRecord } from "@/lib/contracts";

/** The learning system: the course catalogue with seats and dates (`enrolled` counts every seat held), each employee's enrollments, the seat requests it holds and decides, and the training each person has finished and the certificates they hold. */
export type LearningPort = {
  courses(): Promise<readonly Course[]>;
  enrollments(employeeId: string): Promise<readonly Enrollment[]>;
  requestSeat(request: SeatRequest): Promise<Enrollment>;
  decide(enrollmentId: string, approverId: string, approved: boolean): Promise<Enrollment | null>;
  trainingHistory(employeeIds: readonly string[]): Promise<readonly TrainingRecord[]>;
};
