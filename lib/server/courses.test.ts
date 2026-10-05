import { describe, expect, test } from "bun:test";
import { accessFor } from "@/lib/access/policies";
import { findUser } from "@/lib/data/entities/users";
import { listCourses } from "./courses";

const SALES_LICENCE_COURSE = "crs_sales_licence";

async function courseIdsFor(userId: string, query: string): Promise<string[]> {
  const user = findUser(userId);
  if (!user) throw new Error(`missing ${userId}`);
  const result = await listCourses(accessFor(user), { month: null, query });
  return result.data.map((course) => course.id);
}

describe("course search matches what a course is for", () => {
  test("HR asking what to send the sales team to finds the alcohol licence renewal the sales staff hold, not only titles with ขาย", async () => {
    const found = await courseIdsFor("u_may", "ขาย");
    expect(found).toContain(SALES_LICENCE_COURSE);
    expect(found).toContain("crs_consultative");
  });

  test("a team or role phrased in full finds the same courses", async () => {
    for (const query of ["ทีมขาย", "พนักงานขาย", "sales"]) expect(await courseIdsFor("u_may", query)).toContain(SALES_LICENCE_COURSE);
  });

  test("a team named with ทีม or ฝ่าย finds the courses of its department", async () => {
    for (const query of ["ทีมผลิต", "ฝ่ายผลิต"]) expect(await courseIdsFor("u_may", query)).toEqual(["crs_forklift_kk", "crs_gmp", "crs_lab"]);
  });

  test("a sales search leaves out courses that are not for sales", async () => {
    const found = await courseIdsFor("u_may", "ขาย");
    for (const unrelated of ["crs_lab", "crs_gmp", "crs_forklift_kk"]) expect(found).not.toContain(unrelated);
  });

  test("a renewal course is found by the roles of the people who hold the certificate it renews", async () => {
    expect(await courseIdsFor("u_may", "นักวางแผน")).toEqual(["crs_gmp"]);
    expect(await courseIdsFor("u_may", "ผู้จัดการขายภาค")).toContain(SALES_LICENCE_COURSE);
  });
});
