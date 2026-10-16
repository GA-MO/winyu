import { describe, expect, test } from "bun:test";
import { loadDictionary } from "@/lib/server/master-data";
import { excludedIn } from "./exclusion";

describe("what a question sets aside", () => {
  test("a region after นอกจาก, with the word เรื่อง before it", async () => {
    expect(excludedIn("นอกจากเรื่องอีสาน มีความเสี่ยงอื่นที่ผมควรรู้ก่อนขึ้นบอร์ดไหม เช่นสต๊อกค้าง ลูกหนี้", await loadDictionary())).toEqual({ region: ["northeast"] });
  });

  test("an agent whose name starts with a region's name is the agent, not the region", async () => {
    expect(excludedIn("ยกเว้นอีสานรุ่งโรจน์ ค้าส่ง เอเย่นต์ไหนตกหนักสุด", await loadDictionary())).toEqual({ agent: ["ag_nea_02"] });
  });

  test("two regions joined by กับ", async () => {
    expect(excludedIn("ไม่นับภาคใต้กับภาคเหนือ ยอดขายเป็นยังไง", await loadDictionary())).toEqual({ region: ["south", "north"] });
  });

  test("นอกจาก before something that is not a place sets nothing aside", async () => {
    const dictionary = await loadDictionary();
    expect(excludedIn("นอกจากยอดขายแล้ว มีอะไรน่าห่วงอีก", dictionary)).toEqual({});
    expect(excludedIn("นอกจากนี้ ภาคอีสานเป็นยังไง", dictionary)).toEqual({});
    expect(excludedIn(null, dictionary)).toEqual({});
  });
});
