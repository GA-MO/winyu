import { describe, expect, test } from "bun:test";
import { ROLE_IDS } from "@/lib/contracts";
import { DocumentFormatError, MAX_CHUNK_CHARS, parseDocument, searchableText } from "./chunk";

function source(audience: string, body: string): string {
  return ["---", "id: sample-policy", "title: ระเบียบตัวอย่าง", "version: 2.0", "owner: ฝ่ายทรัพยากรบุคคล", `audience: ${audience}`, "effective: 2026-01-01", "---", body].join("\n");
}

const BODY = [
  "# ระเบียบตัวอย่าง",
  "",
  "## 1. การทำงานล่วงเวลา",
  "บทนำของหมวดนี้",
  "",
  "### 1.1 อัตราค่าล่วงเวลา",
  "วันทำงานปกติได้ 1.5 เท่า",
  "",
  "### 1.2 การขออนุมัติ",
  "ต้องขออนุมัติล่วงหน้า",
  "",
  "## 2. การเดินทาง",
  "เบี้ยเลี้ยง 350 บาทต่อวัน",
].join("\n");

describe("parseDocument", () => {
  test("one chunk per subsection, a section's own text before its first subsection, and a section without subsections, headings kept without their numbers", () => {
    const document = parseDocument(source("all", BODY));
    expect(document.chunks.map((chunk) => [chunk.id, chunk.section, chunk.text])).toEqual([
      ["sample-policy#1", "การทำงานล่วงเวลา", "บทนำของหมวดนี้"],
      ["sample-policy#2", "การทำงานล่วงเวลา › อัตราค่าล่วงเวลา", "วันทำงานปกติได้ 1.5 เท่า"],
      ["sample-policy#3", "การทำงานล่วงเวลา › การขออนุมัติ", "ต้องขออนุมัติล่วงหน้า"],
      ["sample-policy#4", "การเดินทาง", "เบี้ยเลี้ยง 350 บาทต่อวัน"],
    ]);
    expect(searchableText(document.chunks[1])).toBe("ระเบียบตัวอย่าง › การทำงานล่วงเวลา › อัตราค่าล่วงเวลา\nวันทำงานปกติได้ 1.5 เท่า");
  });

  test("audience all means every role; a list means exactly those roles, on the document and on every chunk", () => {
    expect(parseDocument(source("all", BODY)).readers).toEqual(ROLE_IDS);
    const restricted = parseDocument(source("hr_manager, ceo", BODY));
    expect(restricted.readers).toEqual(["hr_manager", "ceo"]);
    expect(restricted.chunks.every((chunk) => chunk.readers.join() === "hr_manager,ceo")).toBe(true);
  });

  test("a section longer than the limit is split at paragraph breaks under the same headings, losing no text", () => {
    const paragraphs = Array.from({ length: 6 }, (_, index) => `ย่อหน้าที่ ${index} ${"ก".repeat(400)}`);
    const document = parseDocument(source("all", ["## 1. ยาว", ...paragraphs.flatMap((paragraph) => [paragraph, ""])].join("\n")));
    expect(document.chunks.length).toBeGreaterThan(1);
    expect(document.chunks.every((chunk) => chunk.section === "ยาว" && chunk.text.length <= MAX_CHUNK_CHARS)).toBe(true);
    expect(document.chunks.map((chunk) => chunk.text).join("\n\n")).toBe(paragraphs.join("\n\n"));
  });

  test("the hash changes when a section's text or the document's audience changes, and only then", () => {
    const [first] = parseDocument(source("all", BODY)).chunks;
    expect(parseDocument(source("all", BODY)).chunks[0].hash).toBe(first.hash);
    expect(parseDocument(source("all", BODY.replace("บทนำของหมวดนี้", "บทนำใหม่"))).chunks[0].hash).not.toBe(first.hash);
    expect(parseDocument(source("hr_manager", BODY)).chunks[0].hash).not.toBe(first.hash);
  });

  test("a missing header, an unknown role or a bad date is refused with the field named", () => {
    expect(() => parseDocument(BODY)).toThrow(DocumentFormatError);
    expect(() => parseDocument(source("sales_rep, janitor", BODY))).toThrow(/audience/);
    expect(() => parseDocument(source("all", BODY).replace("2026-01-01", "1 ม.ค. 2569"))).toThrow(/effective/);
  });
});
