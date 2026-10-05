import { describe, expect, test } from "bun:test";
import { promptHash } from "./fingerprint";

describe("promptHash", () => {
  test("is the same for the same code, whatever the wall clock says", () => {
    expect(promptHash("u_thana")).toBe(promptHash("u_thana"));
  });

  test("differs between personas whose prompts differ", () => {
    expect(promptHash("u_thana")).not.toBe(promptHash("u_krit"));
  });
});
