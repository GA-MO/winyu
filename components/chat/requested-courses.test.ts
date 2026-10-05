import { describe, expect, test } from "bun:test";
import type { ComposedSurface } from "@/lib/compose/catalog";
import { readRecordings, turnOf } from "@/lib/eval/recording";
import { TH } from "@/lib/i18n/th";
import { requestedCoursesOf, withRequestedCourses } from "./requested-courses";
import type { Exchange, ToolStep } from "./timeline";

const REQUESTED = TH.courses.badge.requested;

function recordedSurface(): ComposedSurface {
  const recording = readRecordings().get("courses-rep");
  const composed = recording ? turnOf(recording).composed : null;
  if (!composed) throw new Error("courses-rep has no composed card");
  return { surfaceId: "s1", components: composed.components, dataModel: composed.dataModel, done: true };
}

function rowsOf(surface: ComposedSurface): { id: string; badges: { label: string }[] }[] {
  return (surface.dataModel.list_courses as { data: { id: string; badges: { label: string }[] }[] }).data;
}

function enroll(id: string, result: unknown): ToolStep {
  return { kind: "tool", toolCallId: id, name: "enroll_course", args: { courseId: "crs_data_promo" }, outcome: { state: "returned", result } };
}

function pressed(steps: ToolStep[]): Exchange[] {
  return [{ id: "e2", question: { kind: "pressed", tool: "enroll_course", input: { courseId: "crs_data_promo" } }, steps }];
}

describe("course card after an enrolment", () => {
  test("the course the approved receipt names reads as requested on the card drawn before it; every other row and every seat count stays as drawn", () => {
    const surface = recordedSurface();
    const updated = withRequestedCourses(surface, requestedCoursesOf(pressed([enroll("c1", { ok: true })])));
    const before = rowsOf(surface);
    const after = rowsOf(updated);
    expect(after.find((row) => row.id === "crs_data_promo")?.badges.map((badge) => badge.label)).toEqual([REQUESTED]);
    expect(after.filter((row) => row.id !== "crs_data_promo")).toEqual(before.filter((row) => row.id !== "crs_data_promo"));
    expect(updated.components).toEqual(surface.components);
    expect(before.find((row) => row.id === "crs_data_promo")?.badges).toEqual([]);
  });

  test("a declined or failed enrolment changes nothing", () => {
    const surface = recordedSurface();
    for (const result of [{ approved: false }, { ok: false, error: "เต็มแล้ว" }]) {
      expect(withRequestedCourses(surface, requestedCoursesOf(pressed([enroll("c1", result)])))).toBe(surface);
    }
  });
});
