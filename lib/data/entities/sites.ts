import type { Incident, Site } from "@/lib/contracts";

export type { Incident, Site };

const SITE_DIR = "/img/sites";

function sitePhoto(index: number): string {
  return `${SITE_DIR}/site${String(index).padStart(2, "0")}.jpg`;
}

export const SITES: readonly Site[] = [
  { id: "pl_pathumthani", nameTh: "โรงงานปทุมธานี", kind: "plant", provinceId: "pv_pathumthani", placeTh: "ปทุมธานี", region: "bkk", photo: sitePhoto(6),
    headcount: 1050, overtimeHoursPerHead3m: 38, safetyLeadId: null, lastLtiBeforeLog: "2025-04-22" },
  { id: "pl_khonkaen", nameTh: "โรงงานขอนแก่น", kind: "plant", provinceId: "pv_khonkaen", placeTh: "ขอนแก่น", region: "northeast", photo: sitePhoto(1),
    headcount: 620, overtimeHoursPerHead3m: 71, safetyLeadId: "e_chai", lastLtiBeforeLog: null },
  { id: "pl_singburi", nameTh: "โรงงานสิงห์บุรี", kind: "plant", provinceId: "pv_saraburi", placeTh: "สิงห์บุรี", region: "central", photo: sitePhoto(8),
    headcount: 480, overtimeHoursPerHead3m: 29, safetyLeadId: null, lastLtiBeforeLog: "2024-11-05" },
  { id: "dc_bangkok", nameTh: "ศูนย์กระจายสินค้ากรุงเทพฯ", kind: "dc", provinceId: "pv_bangkok", placeTh: "กรุงเทพฯ", region: "bkk", photo: sitePhoto(3),
    headcount: 160, overtimeHoursPerHead3m: 44, safetyLeadId: null, lastLtiBeforeLog: null },
  { id: "dc_khonkaen", nameTh: "ศูนย์กระจายสินค้าขอนแก่น", kind: "dc", provinceId: "pv_khonkaen", placeTh: "ขอนแก่น", region: "northeast", photo: sitePhoto(5),
    headcount: 95, overtimeHoursPerHead3m: 52, safetyLeadId: null, lastLtiBeforeLog: "2025-02-14" },
  { id: "hq_bangkok", nameTh: "สำนักงานใหญ่ สามเสน", kind: "office", provinceId: "pv_bangkok", placeTh: "กรุงเทพฯ", region: "bkk", photo: sitePhoto(7),
    headcount: 610, overtimeHoursPerHead3m: 9, safetyLeadId: null, lastLtiBeforeLog: null },
];

export const INCIDENTS: readonly Incident[] = [
  { id: "inc_kk_0915", siteId: "pl_khonkaen", date: "2026-09-15", kind: "lti", titleTh: "รถยกชนพนักงานขนย้ายที่ลานโหลดสายการผลิต 2",
    detailTh: "ข้อเท้าแพลง หยุดงาน 3 วัน · กะดึก ช่วงเร่งผลิตก่อนออกพรรษา", actionTh: "แยกทางเดินรถยกกับทางคนเดินที่ลานโหลด และทวนสอบใบขับขี่รถยกทุกคนก่อน 30 ก.ย.", closed: false },
  { id: "inc_kk_0909", siteId: "pl_khonkaen", date: "2026-09-09", kind: "near_miss", titleTh: "รถยกเฉี่ยวพาเลทล้มใกล้ทางเดิน",
    detailTh: "ไม่มีผู้บาดเจ็บ · มุมอับหน้าคลังวัตถุดิบ", actionTh: "ติดกระจกโค้งที่มุมอับ", closed: true },
  { id: "inc_kk_0903", siteId: "pl_khonkaen", date: "2026-09-03", kind: "first_aid", titleTh: "พนักงานลื่นบริเวณล้างถัง",
    detailTh: "ฟกช้ำ ปฐมพยาบาลแล้วกลับไปทำงาน", actionTh: "เปลี่ยนแผ่นกันลื่นบริเวณล้างถัง", closed: true },
  { id: "inc_kk_0827", siteId: "pl_khonkaen", date: "2026-08-27", kind: "near_miss", titleTh: "รถยกถอยโดยไม่มีสัญญาณเสียง",
    detailTh: "สัญญาณถอยเสีย 3 คัน", actionTh: "ซ่อมสัญญาณถอยรถยก 3 คัน", closed: true },
  { id: "inc_kk_1210", siteId: "pl_khonkaen", date: "2025-12-10", kind: "first_aid", titleTh: "มือถูกบาดจากขอบลังกระดาษ",
    detailTh: "ทำแผลแล้วกลับไปทำงาน", actionTh: "แจกถุงมือกันบาดที่สายบรรจุ", closed: true },
  { id: "inc_kk_1002", siteId: "pl_khonkaen", date: "2025-10-02", kind: "lti", titleTh: "พนักงานตกจากบันไดถังหมัก",
    detailTh: "หยุดงาน 5 วัน · ช่วงเร่งผลิตก่อนออกพรรษา 2568", actionTh: "ติดราวกันตกและสายรัดตัวที่บันไดถังหมัก", closed: true },
  { id: "inc_pt_0718", siteId: "pl_pathumthani", date: "2026-07-18", kind: "near_miss", titleTh: "ปุ่มหยุดฉุกเฉินสายพานสายการผลิต 1 ไม่ทำงาน",
    detailTh: "พบระหว่างตรวจประจำวัน", actionTh: "ทดสอบปุ่มหยุดฉุกเฉินทุกสัปดาห์", closed: true },
  { id: "inc_pt_0604", siteId: "pl_pathumthani", date: "2026-06-04", kind: "first_aid", titleTh: "ไอน้ำร้อนลวกแขนที่เครื่องล้างขวด",
    detailTh: "แผลพุพองเล็กน้อย", actionTh: "ติดฝาครอบท่อไอน้ำ", closed: true },
  { id: "inc_pt_0120", siteId: "pl_pathumthani", date: "2026-01-20", kind: "property", titleTh: "รถยกชนชั้นวางในคลังสินค้าสำเร็จรูป",
    detailTh: "ชั้นวางเสียหาย 1 ช่อง ไม่มีผู้บาดเจ็บ", actionTh: "ติดกันชนเสาชั้นวาง", closed: true },
  { id: "inc_sb_0311", siteId: "pl_singburi", date: "2026-03-11", kind: "near_miss", titleTh: "ท่อ CO₂ รั่วที่ห้องบรรจุ",
    detailTh: "เซนเซอร์แจ้งเตือนทัน อพยพ 20 นาที", actionTh: "เปลี่ยนข้อต่อท่อ CO₂ ทั้งห้อง", closed: true },
  { id: "inc_dcb_0514", siteId: "dc_bangkok", date: "2026-05-14", kind: "property", titleTh: "รถบรรทุกถอยชนประตูท่าโหลด",
    detailTh: "ประตูเสียหาย 1 บาน", actionTh: "ทาสีแนวจอดและติดยางกันชนท่าโหลด", closed: true },
  { id: "inc_dcb_0819", siteId: "dc_bangkok", date: "2025-08-19", kind: "lti", titleTh: "พนักงานยกลังแล้วหลังเคล็ด",
    detailTh: "หยุดงาน 2 วัน", actionTh: "อบรมการยกของที่ถูกวิธีและเพิ่มรถเข็น", closed: true },
  { id: "inc_dck_0912", siteId: "dc_khonkaen", date: "2026-09-12", kind: "near_miss", titleTh: "รถบรรทุกเข้าท่าโหลดขณะมีคนอยู่หลังรถ",
    detailTh: "ไม่มีผู้บาดเจ็บ · รถเข้าคิวแน่นช่วงก่อนออกพรรษา", actionTh: "ใช้ระบบล็อกล้อและไฟสัญญาณที่ท่าโหลด", closed: false },
];

export function siteById(id: string): Site | null {
  return SITES.find((site) => site.id === id) ?? null;
}

