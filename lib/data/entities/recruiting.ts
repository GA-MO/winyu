export const CANDIDATE_STAGES = ["applied", "screening", "interview", "final", "offer"] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export type Candidate = {
  id: string;
  nameTh: string;
  positionId: string;
  stage: CandidateStage;
  score: number | null;
  appliedOn: string;
  experienceTh: string;
  strengthTh: string;
  concernTh: string | null;
  sourceTh: string;
  expectedSalaryThb: number;
};

type CandidateSeed = Omit<Candidate, "positionId">;

const KHONKAEN_SALES = "op_ne_khonkaen";
const KORAT_SALES = "op_ne_korat";
const UBON_SALES = "op_ne_ubon";
const KHONKAEN_QC = "op_kk_qc";

function forPosition(positionId: string, seeds: CandidateSeed[]): Candidate[] {
  return seeds.map((seed) => ({ ...seed, positionId }));
}

export const CANDIDATES: readonly Candidate[] = [
  ...forPosition(KHONKAEN_SALES, [
    { id: "c_kk01", nameTh: "คุณณัฐพล ศรีวงศ์", stage: "offer", score: 4.5, appliedOn: "2026-07-24", experienceTh: "ขายเครื่องดื่มให้ร้านอาหารในขอนแก่น 5 ปี",
      strengthTh: "รู้จักร้านในเขตชุมแพกว่า 60 ร้าน", concernTh: "ขอเริ่มงาน 1 พ.ย. เพราะต้องแจ้งออกล่วงหน้า 30 วัน", sourceTh: "พนักงานแนะนำ (คุณกฤต)", expectedSalaryThb: 36_000 },
    { id: "c_kk02", nameTh: "คุณพิมพ์ชนก แก้วมณี", stage: "final", score: 4.5, appliedOn: "2026-07-28", experienceTh: "ผู้แทนขายบริษัทสินค้าอุปโภค 4 ปี",
      strengthTh: "ยอดขายเกินเป้า 8 ไตรมาสติด", concernTh: null, sourceTh: "JobThai", expectedSalaryThb: 34_000 },
    { id: "c_kk03", nameTh: "คุณธีรวัฒน์ บุญประเสริฐ", stage: "final", score: 4, appliedOn: "2026-08-02", experienceTh: "ผู้แทนขายเบียร์คู่แข่งในภาคอีสาน 3 ปี",
      strengthTh: "เคยดูแลเอเย่นต์ในอำเภอรอบขอนแก่น", concernTh: "ยังติดสัญญาห้ามทำงานกับคู่แข่งถึง ธ.ค. 2569", sourceTh: "LinkedIn", expectedSalaryThb: 40_000 },
    { id: "c_kk04", nameTh: "คุณศิริลักษณ์ ทองดี", stage: "interview", score: 3.5, appliedOn: "2026-08-10", experienceTh: "พนักงานขายหน้าร้านโมเดิร์นเทรด 2 ปี",
      strengthTh: "สื่อสารดี ขับรถได้ มีรถส่วนตัว", concernTh: "ยังไม่เคยขายช่องทางร้านค้าปลีก", sourceTh: "JobThai", expectedSalaryThb: 28_000 },
    { id: "c_kk05", nameTh: "คุณอภิชาติ พลเยี่ยม", stage: "interview", score: 3, appliedOn: "2026-08-14", experienceTh: "ขายประกันชีวิต 3 ปี",
      strengthTh: "หาลูกค้าใหม่เก่ง", concernTh: "ไม่มีประสบการณ์สินค้าอุปโภคบริโภค", sourceTh: "เว็บไซต์บริษัท", expectedSalaryThb: 30_000 },
    { id: "c_kk06", nameTh: "คุณกมลวรรณ ศรีสุข", stage: "screening", score: null, appliedOn: "2026-09-02", experienceTh: "เทรดมาร์เก็ตติ้งร้านสะดวกซื้อ 2 ปี",
      strengthTh: "ทำโปรโมชันหน้าร้านเป็น", concernTh: null, sourceTh: "JobThai", expectedSalaryThb: 29_000 },
    { id: "c_kk07", nameTh: "คุณวีระพงษ์ จันทร์แก้ว", stage: "screening", score: null, appliedOn: "2026-09-08", experienceTh: "ผู้แทนขายยา 1 ปี",
      strengthTh: "จบบริหารธุรกิจ ม.ขอนแก่น", concernTh: null, sourceTh: "งานนัดพบแรงงาน ม.ขอนแก่น", expectedSalaryThb: 26_000 },
    { id: "c_kk08", nameTh: "คุณสุดารัตน์ ภูผาใจ", stage: "applied", score: null, appliedOn: "2026-09-15", experienceTh: "พนักงานขายรถจักรยานยนต์ 2 ปี",
      strengthTh: "อยู่ อ.ชุมแพ", concernTh: null, sourceTh: "เว็บไซต์บริษัท", expectedSalaryThb: 25_000 },
    { id: "c_kk09", nameTh: "คุณเอกชัย นามวงศ์", stage: "applied", score: null, appliedOn: "2026-09-19", experienceTh: "จบใหม่ สาขาการตลาด",
      strengthTh: "ฝึกงานฝ่ายขายเครื่องดื่ม 4 เดือน", concernTh: null, sourceTh: "งานนัดพบแรงงาน ม.ขอนแก่น", expectedSalaryThb: 22_000 },
  ]),
  ...forPosition(KORAT_SALES, [
    { id: "c_kr01", nameTh: "คุณจิราพร สมบูรณ์", stage: "final", score: 4, appliedOn: "2026-08-08", experienceTh: "ผู้แทนขายขนมขบเคี้ยวนครราชสีมา 4 ปี",
      strengthTh: "รู้จักร้านค้าในปากช่องและวังน้ำเขียว", concernTh: null, sourceTh: "JobThai", expectedSalaryThb: 32_000 },
    { id: "c_kr02", nameTh: "คุณสมศักดิ์ ใจดี", stage: "interview", score: 3.5, appliedOn: "2026-08-12", experienceTh: "ขายเครื่องดื่มให้รีสอร์ต 3 ปี",
      strengthTh: "ดูแลลูกค้ากลุ่มรีสอร์ตเขาใหญ่", concernTh: null, sourceTh: "พนักงานแนะนำ (คุณป้อง)", expectedSalaryThb: 31_000 },
    { id: "c_kr03", nameTh: "คุณนภัสสร วงษ์ใหญ่", stage: "interview", score: 3, appliedOn: "2026-08-20", experienceTh: "พนักงานขายโมเดิร์นเทรด 1 ปี",
      strengthTh: "กระตือรือร้น", concernTh: "ประสบการณ์น้อยสำหรับเขตที่ไม่มีหัวหน้าประจำ", sourceTh: "เว็บไซต์บริษัท", expectedSalaryThb: 25_000 },
    { id: "c_kr04", nameTh: "คุณภานุวัฒน์ เรืองศรี", stage: "screening", score: null, appliedOn: "2026-09-05", experienceTh: "ผู้แทนขายอุปกรณ์การเกษตร 5 ปี",
      strengthTh: "คุ้นกับการวิ่งเขตต่างอำเภอ", concernTh: null, sourceTh: "JobThai", expectedSalaryThb: 33_000 },
    { id: "c_kr05", nameTh: "คุณอรอุมา ดวงแก้ว", stage: "applied", score: null, appliedOn: "2026-09-16", experienceTh: "พนักงานต้อนรับโรงแรม 3 ปี",
      strengthTh: "บริการลูกค้าดี", concernTh: null, sourceTh: "เว็บไซต์บริษัท", expectedSalaryThb: 24_000 },
    { id: "c_kr06", nameTh: "คุณเกียรติศักดิ์ พรมมา", stage: "applied", score: null, appliedOn: "2026-09-18", experienceTh: "ขายวัสดุก่อสร้าง 2 ปี",
      strengthTh: "มีรถกระบะส่วนตัว", concernTh: null, sourceTh: "JobThai", expectedSalaryThb: 27_000 },
  ]),
  ...forPosition(UBON_SALES, [
    { id: "c_ub01", nameTh: "คุณวรรณา ศรีบุญเรือง", stage: "offer", score: 4, appliedOn: "2026-06-22", experienceTh: "ผู้แทนขายเครื่องดื่มชูกำลัง อุบลฯ 4 ปี",
      strengthTh: "ดูแลร้านค้าเขตวารินฯ มาก่อน", concernTh: "ยังไม่ตอบรับข้อเสนอ ผ่านมา 12 วัน", sourceTh: "JobThai", expectedSalaryThb: 33_000 },
    { id: "c_ub02", nameTh: "คุณชยพล แสงอรุณ", stage: "final", score: 3.5, appliedOn: "2026-07-01", experienceTh: "ขายสินค้าเกษตร 3 ปี",
      strengthTh: "พูดภาษาถิ่นได้ รู้จักผู้นำชุมชน", concernTh: null, sourceTh: "พนักงานแนะนำ (คุณแนน)", expectedSalaryThb: 29_000 },
    { id: "c_ub03", nameTh: "คุณปวีณา คำภู", stage: "interview", score: 3, appliedOn: "2026-07-15", experienceTh: "พนักงานขายหน้าร้าน 2 ปี",
      strengthTh: "ตั้งใจเรียนรู้", concernTh: null, sourceTh: "เว็บไซต์บริษัท", expectedSalaryThb: 24_000 },
    { id: "c_ub04", nameTh: "คุณณรงค์ ศักดิ์สิทธิ์", stage: "screening", score: null, appliedOn: "2026-08-25", experienceTh: "ผู้แทนขายยา 6 ปี",
      strengthTh: "ประสบการณ์สูง", concernTh: "เงินเดือนที่คาดหวังสูงกว่ากรอบ", sourceTh: "LinkedIn", expectedSalaryThb: 45_000 },
    { id: "c_ub05", nameTh: "คุณมณีรัตน์ บุญมา", stage: "applied", score: null, appliedOn: "2026-09-10", experienceTh: "จบใหม่ สาขาบริหารธุรกิจ ม.อุบลฯ",
      strengthTh: "ทำกิจกรรมชมรมการตลาด", concernTh: null, sourceTh: "งานนัดพบแรงงาน ม.อุบลฯ", expectedSalaryThb: 21_000 },
  ]),
  ...forPosition(KHONKAEN_QC, [
    { id: "c_qc01", nameTh: "คุณสุภาวดี ธรรมวงศ์", stage: "interview", score: 4, appliedOn: "2026-09-03", experienceTh: "นักวิเคราะห์คุณภาพโรงงานน้ำดื่ม 3 ปี",
      strengthTh: "มีใบรับรอง GMP ยังไม่หมดอายุ", concernTh: null, sourceTh: "JobThai", expectedSalaryThb: 26_000 },
    { id: "c_qc02", nameTh: "คุณธนากร ปัญญาดี", stage: "interview", score: 3.5, appliedOn: "2026-09-04", experienceTh: "ผู้ช่วยห้องแล็บจุลชีววิทยา 2 ปี",
      strengthTh: "ตรวจเชื้อในผลิตภัณฑ์เป็น", concernTh: null, sourceTh: "งานนัดพบแรงงาน ม.ขอนแก่น", expectedSalaryThb: 24_000 },
    { id: "c_qc03", nameTh: "คุณรัตนาภรณ์ มูลสาร", stage: "screening", score: null, appliedOn: "2026-09-09", experienceTh: "จบใหม่ สาขาวิทยาศาสตร์การอาหาร",
      strengthTh: "ฝึกงานฝ่ายประกันคุณภาพโรงงานนม", concernTh: null, sourceTh: "เว็บไซต์บริษัท", expectedSalaryThb: 20_000 },
    { id: "c_qc04", nameTh: "คุณอนุสรณ์ ทองสุข", stage: "screening", score: null, appliedOn: "2026-09-12", experienceTh: "พนักงานสายการผลิต 4 ปี",
      strengthTh: "อยากย้ายสายงานมาคุณภาพ", concernTh: "ยังไม่มีพื้นฐานห้องแล็บ", sourceTh: "เว็บไซต์บริษัท", expectedSalaryThb: 21_000 },
    { id: "c_qc05", nameTh: "คุณพัชรินทร์ แสนคำ", stage: "applied", score: null, appliedOn: "2026-09-17", experienceTh: "เจ้าหน้าที่ QC โรงงานอาหารแช่แข็ง 1 ปี",
      strengthTh: "ทำงานเป็นกะได้", concernTh: null, sourceTh: "JobThai", expectedSalaryThb: 22_000 },
  ]),
];

export function candidatesOf(positionId: string): Candidate[] {
  return CANDIDATES.filter((candidate) => candidate.positionId === positionId);
}
