import { describe, expect, test } from "bun:test";
import { GENERATOR_DICTIONARY } from "@/lib/data/master";
import { entityKindOfDim } from "./dictionary";

const { displayLabel, resolveDimValue, resolveEntities, resolveEntity } = GENERATOR_DICTIONARY;

describe("resolveEntity", () => {
  test("province aliases and spelling variants", () => {
    expect(resolveEntity("province", "โคราช")?.id).toBe("pv_nakhonratchasima");
    expect(resolveEntity("province", "จังหวัดบุรีรัมย์")?.id).toBe("pv_buriram");
    expect(resolveEntity("province", "หาดใหญ่")?.id).toBe("pv_songkhla");
    expect(resolveEntity("province", "กทม.")?.id).toBe("pv_bangkok");
    expect(resolveEntity("province", "เชียงใหม่")?.id).toBe("pv_chiangmai");
  });

  test("brand nicknames", () => {
    expect(resolveEntity("brand", "เบียร์สิงห์")?.id).toBe("singha");
    expect(resolveEntity("brand", "ลีโอ")?.id).toBe("leo");
    expect(resolveEntity("brand", "เพอร์ร่า")?.id).toBe("purra");
    expect(resolveEntity("brand", "Carlsberg")?.id).toBe("carlsberg");
  });

  test("region aliases", () => {
    expect(resolveEntity("region", "อีสาน")?.id).toBe("northeast");
    expect(resolveEntity("region", "ภาคเหนือ")?.id).toBe("north");
    expect(resolveEntity("region", "กรุงเทพ")?.id).toBe("bkk");
  });

  test("agent names with and without the trading suffix", () => {
    expect(resolveEntity("agent", "ส.รุ่งเรือง เทรดดิ้ง")?.id).toBe("ag_nea_07");
    expect(resolveEntity("agent", "ส.รุ่งเรือง")?.id).toBe("ag_nea_07");
    expect(resolveEntity("agent", "สรุ่งเรือง")?.id).toBe("ag_nea_07");
    expect(resolveEntity("agent", "โคราชสหภัณฑ์")?.id).toBe("ag_nea_03");
  });

  test("sku by brand nickname plus pack size", () => {
    expect(resolveEntity("sku", "ลีโอ 620")?.id).toBe("sku_leo_bottle620");
    expect(resolveEntity("sku", "เพอร์ร่า 600")?.id).toBe("sku_purra_pet600");
    expect(resolveEntity("sku", "sku_singha_soda_can320")?.id).toBe("sku_singha_soda_can320");
  });

  test("distribution centres, plants, chains and campaigns", () => {
    expect(resolveEntity("dc", "ลำพูน")?.id).toBe("dc_lamphun");
    expect(resolveEntity("plant", "ขอนแก่น")?.id).toBe("pl_khonkaen");
    expect(resolveEntity("chain", "ซีสโตร์")?.id).toBe("chain_cstore");
    expect(resolveEntity("campaign", "สงกรานต์ 2569")?.id).toBe("cmp_songkran_2026");
  });

  test("unknown text resolves to nothing", () => {
    expect(resolveEntity("agent", "บริษัทที่ไม่มีอยู่จริง")).toBeNull();
    expect(resolveEntities("brand", "")).toHaveLength(0);
  });
});

describe("dim helpers", () => {
  test("dim values normalise to canonical ids", () => {
    expect(resolveDimValue("region", "อีสาน")).toBe("northeast");
    expect(resolveDimValue("agent", "ส.รุ่งเรือง")).toBe("ag_nea_07");
    expect(resolveDimValue("province", "ไม่มีจังหวัดนี้")).toBeNull();
    expect(resolveDimValue("date", "2026-09-22")).toBe("2026-09-22");
  });

  test("labels come back in Thai", () => {
    expect(displayLabel("region", "northeast")).toBe("ภาคอีสาน");
    expect(displayLabel("agent", "ag_nea_07")).toBe("ส.รุ่งเรือง เทรดดิ้ง");
    expect(displayLabel("brand", "leo")).toBe("ลีโอ");
    expect(displayLabel("date", "2026-09-22")).toBe("2026-09-22");
    expect(entityKindOfDim("sku")).toBe("sku");
    expect(entityKindOfDim("week")).toBeNull();
  });
});
