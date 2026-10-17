import { describe, expect, test } from "bun:test";
import { causeStatedAsFact } from "./cause";

const SEND_ONLY = "ส่งเรื่องนี้ให้ผู้จัดการขายภาคอีสาน ด่วน";

describe("an ask that states a cause as fact the person never typed (AI-269)", () => {
  test("the round-8 ask that passed the credit hypothesis down the chain is caught", () => {
    expect(causeStatedAsFact("ช่วยตรวจสอบและเร่งแก้ไขปัญหาเครดิตของอีสานรุ่งโรจน์และอุบลศรีสุขด่วน", SEND_ONLY)).toBe("แก้ไขปัญหาเครดิต");
    expect(causeStatedAsFact("ยอดตกเพราะติดเครดิต ช่วยดูด่วน", SEND_ONLY)).toBe("เพราะติดเครดิต");
    expect(causeStatedAsFact("เอเย่นต์ติดปัญหาเครดิต ช่วยประสานการเงิน", SEND_ONLY)).toBe("ติดปัญหาเครดิต");
  });

  test("an ask that asks the receiver to check the cause passes", () => {
    expect(causeStatedAsFact("ช่วยตรวจว่าติดปัญหาเครดิตหรือไม่", SEND_ONLY)).toBeNull();
    expect(causeStatedAsFact("ช่วยดูว่าใช่เพราะเครดิตไหม", SEND_ONLY)).toBeNull();
    expect(causeStatedAsFact("อาจติดปัญหาเครดิต ช่วยเช็กให้หน่อย", SEND_ONLY)).toBeNull();
    expect(causeStatedAsFact("ช่วยแก้ปัญหาให้หน่อย", SEND_ONLY)).toBeNull();
    expect(causeStatedAsFact("ช่วยตรวจอีสานรุ่งโรจน์ แล้วบอกกลับว่าเกิดจากอะไรและจะแก้อย่างไร", SEND_ONLY)).toBeNull();
  });

  test("the person's own words stand: a cause they typed may go as they typed it", () => {
    expect(causeStatedAsFact("แก้ปัญหาเครดิตด่วน", "ส่งให้พี่อนุชา บอกให้แก้ปัญหาเครดิตด่วน")).toBeNull();
  });
});
