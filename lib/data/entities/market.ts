import type { Region } from "@/lib/contracts";

export type MakerId = "mk_boonrawd" | "mk_thaibev" | "mk_carabao" | "mk_other";
export type Maker = { id: MakerId; nameTh: string; label: string; brandsTh: string[]; nicknames: string[] };

/** Beer makers a retail audit reports; the first is us. */
export const MAKERS: readonly Maker[] = [
  { id: "mk_boonrawd", nameTh: "บุญรอดบริวเวอรี่", label: "Boon Rawd", brandsTh: ["สิงห์", "ลีโอ"], nicknames: ["บุญรอด", "เรา", "ของเรา", "สิงห์", "ลีโอ", "boon rawd", "boonrawd"] },
  { id: "mk_thaibev", nameTh: "ไทยเบฟเวอเรจ", label: "ThaiBev", brandsTh: ["ช้าง"], nicknames: ["ไทยเบฟ", "ช้าง", "เบียร์ช้าง", "thaibev", "chang"] },
  { id: "mk_carabao", nameTh: "คาราบาว", label: "Carabao", brandsTh: ["คาราบาว", "ตะวันแดง"], nicknames: ["คาราบาว", "ตะวันแดง", "carabao", "tawandang"] },
  { id: "mk_other", nameTh: "รายอื่น", label: "Others", brandsTh: ["คราฟต์และนำเข้า"], nicknames: ["อื่น", "คราฟต์", "นำเข้า", "others"] },
];

export const OWN_MAKER: MakerId = "mk_boonrawd";
export const MAKER_IDS: readonly MakerId[] = MAKERS.map((maker) => maker.id);

/** Retail-audit starting shares by region, in percent: Boon Rawd leads everywhere, ThaiBev is strongest in the central plains, Carabao is a new entrant. */
export const BASE_SHARE: Record<Region, Record<MakerId, number>> = {
  bkk: { mk_boonrawd: 58, mk_thaibev: 33, mk_carabao: 4, mk_other: 5 },
  central: { mk_boonrawd: 55, mk_thaibev: 38, mk_carabao: 4, mk_other: 3 },
  north: { mk_boonrawd: 64, mk_thaibev: 29, mk_carabao: 4, mk_other: 3 },
  northeast: { mk_boonrawd: 66, mk_thaibev: 27, mk_carabao: 5, mk_other: 2 },
  east: { mk_boonrawd: 59, mk_thaibev: 32, mk_carabao: 5, mk_other: 4 },
  south: { mk_boonrawd: 61, mk_thaibev: 31, mk_carabao: 4, mk_other: 4 },
};

/** Carabao's push: extra share points it takes from us per province, ramping over the months of the window. */
export const SHARE_PUSHES: readonly { provinceId: string; maker: MakerId; fromMonth: string; toMonth: string; points: number; fromUs: number }[] = [
  { provinceId: "pv_nakhonratchasima", maker: "mk_carabao", fromMonth: "2026-06", toMonth: "2026-08", points: 6, fromUs: 0.85 },
];

export const CARABAO_MONTHLY_GAIN = 0.12;
