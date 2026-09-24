import type { Course } from "@/lib/contracts";

export type { Course };

const COVER_DIR = "/img/courses";

function cover(index: number): string {
  return `${COVER_DIR}/course${String(index).padStart(2, "0")}.jpg`;
}

export const COURSES: readonly Course[] = [
  { id: "crs_forklift_kk", titleTh: "ต่ออายุใบขับขี่รถยก (ภาคปฏิบัติ)", categoryTh: "ความปลอดภัย", cover: cover(2), format: "field", placeTh: "โรงงานขอนแก่น",
    starts: "2026-09-26", days: 1, seats: 12, enrolled: 9, audienceTh: "พนักงานขับรถยกและหัวหน้ากะที่ใบขับขี่ใกล้หมด", renewsCertificate: "ใบขับขี่รถยก", departmentIds: ["dept_production", "dept_supply_chain"] },
  { id: "crs_first_aid", titleTh: "ปฐมพยาบาลและ CPR", categoryTh: "ความปลอดภัย", cover: cover(4), format: "classroom", placeTh: "สำนักงานใหญ่ สามเสน",
    starts: "2026-09-29", days: 1, seats: 30, enrolled: 18, audienceTh: "พนักงานทุกฝ่าย", renewsCertificate: null, departmentIds: null },
  { id: "crs_consultative", titleTh: "การขายแบบที่ปรึกษา รุ่น 4", categoryTh: "การขาย", cover: cover(3), format: "classroom", placeTh: "โรงแรมในเมืองขอนแก่น",
    starts: "2026-09-30", days: 2, seats: 24, enrolled: 21, audienceTh: "พนักงานขายและหัวหน้าทีมขาย", renewsCertificate: null, departmentIds: ["dept_sales"] },
  { id: "crs_sales_licence", titleTh: "ทบทวนกฎหมายควบคุมเครื่องดื่มแอลกอฮอล์ (ต่ออายุใบอนุญาต)", categoryTh: "กฎหมาย", cover: cover(5), format: "online", placeTh: "ออนไลน์",
    starts: "2026-10-03", days: 1, seats: 80, enrolled: 41, audienceTh: "ผู้ถือใบอนุญาตจำหน่ายสุรา (ผู้แทน)", renewsCertificate: "ใบอนุญาตจำหน่ายสุรา (ผู้แทน)", departmentIds: ["dept_sales"] },
  { id: "crs_gmp", titleTh: "GMP และความปลอดภัยอาหาร รอบต่ออายุ", categoryTh: "คุณภาพ", cover: cover(1), format: "classroom", placeTh: "โรงงานขอนแก่น",
    starts: "2026-10-08", days: 1, seats: 25, enrolled: 25, audienceTh: "พนักงานสายการผลิตและควบคุมคุณภาพ", renewsCertificate: "GMP / food safety", departmentIds: ["dept_production"] },
  { id: "crs_data_promo", titleTh: "วางแผนโปรโมชันด้วยข้อมูล", categoryTh: "ข้อมูล", cover: cover(9), format: "online", placeTh: "ออนไลน์",
    starts: "2026-10-14", days: 2, seats: 40, enrolled: 12, audienceTh: "การตลาด เทรดมาร์เก็ตติ้ง และผู้จัดการขายภาค", renewsCertificate: null, departmentIds: ["dept_marketing", "dept_sales"] },
  { id: "crs_lab", titleTh: "การตรวจคุณภาพเบียร์ในห้องแล็บ", categoryTh: "คุณภาพ", cover: cover(7), format: "classroom", placeTh: "โรงงานปทุมธานี",
    starts: "2026-10-20", days: 3, seats: 16, enrolled: 7, audienceTh: "พนักงานควบคุมคุณภาพ", renewsCertificate: null, departmentIds: ["dept_production"] },
  { id: "crs_leader", titleTh: "ผู้นำทีมรุ่นใหม่", categoryTh: "ภาวะผู้นำ", cover: cover(6), format: "classroom", placeTh: "สำนักงานใหญ่ สามเสน",
    starts: "2026-10-27", days: 3, seats: 20, enrolled: 17, audienceTh: "หัวหน้าทีมและหัวหน้ากะ", renewsCertificate: null, departmentIds: null },
  { id: "crs_service", titleTh: "ดูแลร้านค้าและรับเรื่องร้องเรียน", categoryTh: "บริการลูกค้า", cover: cover(8), format: "online", placeTh: "ออนไลน์",
    starts: "2026-11-05", days: 1, seats: 60, enrolled: 22, audienceTh: "พนักงานขายและทีมบริการลูกค้า", renewsCertificate: null, departmentIds: ["dept_sales"] },
  { id: "crs_onboarding", titleTh: "ปฐมนิเทศพนักงานใหม่ รอบ พ.ย.", categoryTh: "ปฐมนิเทศ", cover: cover(10), format: "classroom", placeTh: "สำนักงานใหญ่ สามเสน",
    starts: "2026-11-09", days: 2, seats: 40, enrolled: 14, audienceTh: "พนักงานที่เริ่มงานไม่เกิน 3 เดือน", renewsCertificate: null, departmentIds: null },
];

