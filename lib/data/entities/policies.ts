export const LEAVE_KINDS = ["annual", "sick", "personal"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];

export type PolicySection = { titleTh: string; bodyTh: string };
export type PolicyTopic = "leave" | "benefits";

export const ANNUAL_LEAVE_STEPS: readonly { minYears: number; days: number }[] = [
  { minYears: 10, days: 15 },
  { minYears: 5, days: 12 },
  { minYears: 1, days: 10 },
  { minYears: 0, days: 6 },
];
export const SICK_LEAVE_DAYS = 30;
export const PERSONAL_LEAVE_DAYS = 6;
export const ANNUAL_NOTICE_WORKDAYS = 3;

export const LEAVE_POLICY: readonly PolicySection[] = [
  { titleTh: "ลาพักร้อน", bodyTh: "อายุงานไม่ถึง 1 ปีได้ 6 วัน · 1–5 ปี 10 วัน · 5–10 ปี 12 วัน · 10 ปีขึ้นไป 15 วันต่อปี ระหว่างทดลองงานยังลาพักร้อนไม่ได้ ยื่นล่วงหน้าอย่างน้อย 3 วันทำการ สะสมไปปีถัดไปได้ไม่เกิน 5 วัน" },
  { titleTh: "ลาป่วย", bodyTh: "ลาได้ตามจริงไม่เกิน 30 วันทำการต่อปีโดยได้รับค่าจ้าง ลาตั้งแต่ 3 วันติดต่อกันขึ้นไปแนบใบรับรองแพทย์ ยื่นย้อนหลังได้ภายใน 3 วันหลังกลับมาทำงาน" },
  { titleTh: "ลากิจ", bodyTh: "ลาได้ 6 วันทำการต่อปีเพื่อธุระจำเป็น ยื่นล่วงหน้าอย่างน้อย 1 วัน กรณีฉุกเฉินแจ้งหัวหน้าก่อนแล้วยื่นในวันที่กลับมา" },
  { titleTh: "ขั้นตอนการอนุมัติ", bodyTh: "ใบลาเข้า Inbox ของหัวหน้าโดยตรง หัวหน้าตอบภายใน 2 วันทำการ ช่วงเร่งผลิตก่อนออกพรรษาและเทศกาลปีใหม่ ฝ่ายขายและโรงงานต้องมีคนอยู่เวรไม่น้อยกว่าครึ่งทีม" },
  { titleTh: "นับวันลาอย่างไร", bodyTh: "นับเฉพาะวันทำการ จันทร์–ศุกร์ ไม่นับวันหยุดนักขัตฤกษ์ ลาครึ่งวันนับ 0.5 วัน" },
];

export const BENEFITS_POLICY: readonly PolicySection[] = [
  { titleTh: "ประกันสุขภาพกลุ่ม", bodyTh: "ผู้ป่วยในวงเงิน 100,000 บาทต่อครั้ง ผู้ป่วยนอก 2,000 บาทต่อครั้ง ไม่เกิน 30 ครั้งต่อปี ครอบคลุมคู่สมรสและบุตรไม่เกิน 3 คน" },
  { titleTh: "ตรวจสุขภาพประจำปี", bodyTh: "ตรวจฟรีปีละครั้งที่โรงพยาบาลคู่สัญญา พนักงานโรงงานตรวจสมรรถภาพการได้ยินและปอดเพิ่ม" },
  { titleTh: "กองทุนสำรองเลี้ยงชีพ", bodyTh: "พนักงานสะสม 3–15% บริษัทสมทบ 5% อายุงาน 5 ปีขึ้นไปสมทบ 7%" },
  { titleTh: "ค่าเดินทางฝ่ายขาย", bodyTh: "เบิกค่าน้ำมันตามกิโลเมตรจริง 5 บาทต่อกิโลเมตร และค่าเบี้ยเลี้ยงต่างจังหวัด 350 บาทต่อวัน" },
  { titleTh: "ทุนการศึกษาบุตร", bodyTh: "บุตรที่เรียนดีรับทุนปีละ 5,000–15,000 บาทตามระดับชั้น ยื่นภายใน มิ.ย. ของทุกปี" },
];

const LEAVE_USED_THIS_YEAR: Readonly<Record<string, Readonly<Record<LeaveKind, number>>>> = {
  u_krit: { annual: 3, sick: 2, personal: 1 },
  u_anucha: { annual: 8, sick: 0, personal: 2 },
  u_may: { annual: 5, sick: 1, personal: 0 },
  u_thana: { annual: 6, sick: 0, personal: 0 },
  e_pong: { annual: 1, sick: 0, personal: 0 },
  e_dang: { annual: 0, sick: 4, personal: 1 },
};

const DEFAULT_USED: Readonly<Record<LeaveKind, number>> = { annual: 4, sick: 2, personal: 1 };

export function leaveUsedThisYear(employeeId: string): Readonly<Record<LeaveKind, number>> {
  return LEAVE_USED_THIS_YEAR[employeeId] ?? DEFAULT_USED;
}

export function annualEntitlement(tenureYears: number): number {
  return ANNUAL_LEAVE_STEPS.find((step) => tenureYears >= step.minYears)?.days ?? 0;
}
