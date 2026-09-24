import type { Region } from "@/lib/contracts";
import { DEPARTMENTS } from "./hr";
import { USERS } from "./users";

export type Gender = "female" | "male";
export type CareerEventKind = "hired" | "promoted" | "moved" | "trained" | "award";
export type CareerEvent = { date: string; kind: CareerEventKind; labelTh: string };
export type Certificate = { nameTh: string; expires: string };

export type Employee = {
  id: string;
  userId: string | null;
  nameTh: string;
  gender: Gender;
  birthYear: number;
  title: string;
  departmentId: string;
  region: Region | null;
  provinceId: string | null;
  siteId: string | null;
  managerId: string | null;
  hiredOn: string;
  photo: string;
  salaryThb: number;
  overtimeHours3m: number;
  history: CareerEvent[];
  certificates: Certificate[];
};

export type OpenPosition = { id: string; title: string; departmentId: string; region: Region | null; provinceId: string | null; managerId: string; openedOn: string };

type PersonDetail = Pick<Employee, "gender" | "birthYear" | "hiredOn" | "salaryThb" | "overtimeHours3m" | "history" | "certificates"> & {
  photo: number;
  provinceId?: string | null;
  siteId?: string | null;
};

type StaffSeed = PersonDetail & Pick<Employee, "id" | "nameTh" | "title" | "departmentId" | "region" | "managerId">;

const PHOTO_DIR = "/img/people";
const SALES_LICENCE = "ใบอนุญาตจำหน่ายสุรา (ผู้แทน)";
const FORKLIFT = "ใบขับขี่รถยก";
const GMP = "GMP / food safety";
const SAFETY_OFFICER = "จป. วิชาชีพ";

function photoPath(index: number): string {
  return `${PHOTO_DIR}/p${String(index).padStart(2, "0")}.jpg`;
}

function departmentIdOf(nameTh: string): string {
  return DEPARTMENTS.find((department) => department.nameTh === nameTh)?.id ?? "dept_executive";
}

function fromUser(userId: string, detail: PersonDetail): Employee {
  const user = USERS.find((candidate) => candidate.id === userId);
  if (!user) throw new Error(`people: unknown user ${userId}`);
  const { photo, provinceId = null, siteId = null, ...rest } = detail;
  return {
    ...rest,
    id: user.id,
    userId: user.id,
    nameTh: user.nameTh,
    title: user.title,
    departmentId: departmentIdOf(user.department),
    region: user.region,
    managerId: user.managerId,
    provinceId,
    siteId,
    photo: photoPath(photo),
  };
}

function staff(seed: StaffSeed): Employee {
  const { photo, provinceId = null, siteId = null, ...rest } = seed;
  return { ...rest, userId: null, provinceId, siteId, photo: photoPath(photo) };
}

function hired(date: string, labelTh = "เริ่มงาน"): CareerEvent {
  return { date, kind: "hired", labelTh };
}

function promoted(date: string, labelTh: string): CareerEvent {
  return { date, kind: "promoted", labelTh };
}

function moved(date: string, labelTh: string): CareerEvent {
  return { date, kind: "moved", labelTh };
}

function trained(date: string, labelTh: string): CareerEvent {
  return { date, kind: "trained", labelTh };
}

function award(date: string, labelTh: string): CareerEvent {
  return { date, kind: "award", labelTh };
}

function cert(nameTh: string, expires: string): Certificate {
  return { nameTh, expires };
}

const LOGIN_PEOPLE: readonly Employee[] = [
  fromUser("u_thana", { photo: 33, gender: "male", birthYear: 1972, hiredOn: "2004-03-01", salaryThb: 420_000, overtimeHours3m: 0, provinceId: "pv_bangkok",
    history: [hired("2004-03-01", "เริ่มงาน ผู้จัดการฝ่ายวางแผนกลยุทธ์"), promoted("2013-01-01", "รองกรรมการผู้จัดการ สายพาณิชย์"), promoted("2021-01-01", "ประธานเจ้าหน้าที่บริหาร")], certificates: [] }),
  fromUser("u_siriporn", { photo: 14, gender: "female", birthYear: 1976, hiredOn: "2009-06-01", salaryThb: 310_000, overtimeHours3m: 0, provinceId: "pv_bangkok",
    history: [hired("2009-06-01", "เริ่มงาน ผู้จัดการฝ่ายบัญชี"), promoted("2017-04-01", "ผู้อำนวยการฝ่ายการเงิน"), promoted("2022-01-01", "ประธานเจ้าหน้าที่การเงิน")], certificates: [] }),
  fromUser("u_prasit", { photo: 39, gender: "male", birthYear: 1978, hiredOn: "2006-02-01", salaryThb: 265_000, overtimeHours3m: 0, provinceId: "pv_bangkok",
    history: [hired("2006-02-01", "เริ่มงาน พนักงานขาย ภาคกลาง"), promoted("2012-07-01", "ผู้จัดการขายภาค ภาคกลาง"), promoted("2020-01-01", "ผู้อำนวยการฝ่ายขาย"), award("2024-12-15", "ผู้บริหารดีเด่นประจำปี")], certificates: [] }),
  fromUser("u_kanok", { photo: 1, gender: "female", birthYear: 1985, hiredOn: "2011-05-01", salaryThb: 118_000, overtimeHours3m: 12, provinceId: "pv_bangkok",
    history: [hired("2011-05-01", "เริ่มงาน พนักงานขาย กรุงเทพฯ"), promoted("2019-01-01", "ผู้จัดการขายภาค กรุงเทพฯ")], certificates: [cert(SALES_LICENCE, "2027-05-31")] }),
  fromUser("u_somchai", { photo: 23, gender: "male", birthYear: 1981, hiredOn: "2008-09-01", salaryThb: 121_000, overtimeHours3m: 18, provinceId: "pv_ayutthaya",
    history: [hired("2008-09-01", "เริ่มงาน พนักงานขาย อยุธยา"), promoted("2018-01-01", "ผู้จัดการขายภาค ภาคกลาง")], certificates: [cert(SALES_LICENCE, "2027-03-31")] }),
  fromUser("u_nattaya", { photo: 15, gender: "female", birthYear: 1987, hiredOn: "2013-02-01", salaryThb: 112_000, overtimeHours3m: 9, provinceId: "pv_chiangmai",
    history: [hired("2013-02-01", "เริ่มงาน เทรดมาร์เก็ตติ้ง ภาคเหนือ"), moved("2016-06-01", "ย้ายมาสายขาย เชียงใหม่"), promoted("2021-07-01", "ผู้จัดการขายภาค ภาคเหนือ")], certificates: [cert(SALES_LICENCE, "2027-08-31")] }),
  fromUser("u_anucha", { photo: 32, gender: "male", birthYear: 1983, hiredOn: "2010-04-01", salaryThb: 119_000, overtimeHours3m: 36, provinceId: "pv_khonkaen",
    history: [hired("2010-04-01", "เริ่มงาน พนักงานขาย ขอนแก่น"), promoted("2015-01-01", "หัวหน้าทีมขาย ขอนแก่น–อุดรฯ"), promoted("2020-07-01", "ผู้จัดการขายภาค ภาคอีสาน"), award("2023-12-15", "ทีมขายภาคที่โตสูงสุด 2566"), trained("2026-02-20", "หลักสูตรผู้นำทีมขายยุคใหม่")],
    certificates: [cert(SALES_LICENCE, "2026-10-31")] }),
  fromUser("u_wichai", { photo: 28, gender: "male", birthYear: 1984, hiredOn: "2012-01-01", salaryThb: 115_000, overtimeHours3m: 14, provinceId: "pv_chonburi",
    history: [hired("2012-01-01", "เริ่มงาน พนักงานขาย ชลบุรี"), promoted("2022-01-01", "ผู้จัดการขายภาค ภาคตะวันออก")], certificates: [cert(SALES_LICENCE, "2027-01-31")] }),
  fromUser("u_saranya", { photo: 9, gender: "female", birthYear: 1980, hiredOn: "2007-08-01", salaryThb: 124_000, overtimeHours3m: 11, provinceId: "pv_songkhla",
    history: [hired("2007-08-01", "เริ่มงาน พนักงานขาย หาดใหญ่"), promoted("2017-01-01", "ผู้จัดการขายภาค ภาคใต้")], certificates: [cert(SALES_LICENCE, "2027-06-30")] }),
  fromUser("u_krit", { photo: 34, gender: "male", birthYear: 1994, hiredOn: "2019-03-01", salaryThb: 38_500, overtimeHours3m: 42, provinceId: "pv_khonkaen",
    history: [hired("2019-03-01", "เริ่มงาน พนักงานขาย ขอนแก่น"), award("2025-12-15", "ยอดขายเบียร์โตสูงสุดของภาค 2568"), trained("2026-06-12", "การขายแบบที่ปรึกษา")],
    certificates: [cert(SALES_LICENCE, "2026-10-15")] }),
  fromUser("u_nok", { photo: 6, gender: "female", birthYear: 1996, hiredOn: "2021-08-01", salaryThb: 34_000, overtimeHours3m: 38, provinceId: "pv_buriram",
    history: [hired("2021-08-01", "เริ่มงาน พนักงานขาย บุรีรัมย์"), trained("2025-09-10", "การขายแบบที่ปรึกษา")], certificates: [cert(SALES_LICENCE, "2027-07-31")] }),
  fromUser("u_ploy", { photo: 10, gender: "female", birthYear: 1997, hiredOn: "2022-02-01", salaryThb: 33_500, overtimeHours3m: 20, provinceId: "pv_chiangmai",
    history: [hired("2022-02-01", "เริ่มงาน พนักงานขาย เชียงใหม่")], certificates: [cert(SALES_LICENCE, "2027-01-31")] }),
  fromUser("u_beam", { photo: 24, gender: "male", birthYear: 1995, hiredOn: "2020-06-01", salaryThb: 37_000, overtimeHours3m: 16, provinceId: "pv_bangkok",
    history: [hired("2020-06-01", "เริ่มงาน พนักงานขาย กรุงเทพฯ")], certificates: [cert(SALES_LICENCE, "2027-05-31")] }),
  fromUser("u_arm", { photo: 29, gender: "male", birthYear: 1998, hiredOn: "2023-01-09", salaryThb: 31_500, overtimeHours3m: 22, provinceId: "pv_songkhla",
    history: [hired("2023-01-09", "เริ่มงาน พนักงานขาย หาดใหญ่")], certificates: [cert(SALES_LICENCE, "2027-01-31")] }),
  fromUser("u_ben", { photo: 21, gender: "male", birthYear: 1986, hiredOn: "2014-03-01", salaryThb: 132_000, overtimeHours3m: 6,
    history: [hired("2014-03-01", "เริ่มงาน ผู้ช่วยผู้จัดการแบรนด์"), promoted("2021-01-01", "ผู้จัดการแบรนด์ กลุ่มนอนแอลกอฮอล์")], certificates: [] }),
  fromUser("u_pim", { photo: 3, gender: "female", birthYear: 1993, hiredOn: "2018-07-01", salaryThb: 52_000, overtimeHours3m: 24, provinceId: "pv_khonkaen",
    history: [hired("2018-07-01", "เริ่มงาน เทรดมาร์เก็ตติ้ง ภาคอีสาน"), trained("2026-04-18", "วางแผนโปรโมชันด้วยข้อมูล")], certificates: [] }),
  fromUser("u_fah", { photo: 13, gender: "female", birthYear: 1990, hiredOn: "2016-01-04", salaryThb: 98_000, overtimeHours3m: 10,
    history: [hired("2016-01-04", "เริ่มงาน นักวิเคราะห์ตลาด"), promoted("2022-07-01", "ผู้จัดการแบรนด์ กลุ่มเบียร์")], certificates: [] }),
  fromUser("u_wee", { photo: 26, gender: "male", birthYear: 1989, hiredOn: "2015-05-01", salaryThb: 76_000, overtimeHours3m: 28, provinceId: "pv_pathumthani",
    history: [hired("2015-05-01", "เริ่มงาน นักวางแผนสต๊อก"), promoted("2021-01-01", "นักวางแผนซัพพลาย")], certificates: [] }),
  fromUser("u_oat", { photo: 35, gender: "male", birthYear: 1992, hiredOn: "2017-09-01", salaryThb: 58_000, overtimeHours3m: 64, provinceId: "pv_khonkaen", siteId: "pl_khonkaen",
    history: [hired("2017-09-01", "เริ่มงาน วิศวกรกระบวนการ โรงงานขอนแก่น"), moved("2022-03-01", "ย้ายไปวางแผนการผลิต")], certificates: [cert(GMP, "2026-11-30")] }),
  fromUser("u_mint", { photo: 11, gender: "female", birthYear: 1994, hiredOn: "2019-11-01", salaryThb: 54_000, overtimeHours3m: 14,
    history: [hired("2019-11-01", "เริ่มงาน นักวิเคราะห์การเงิน")], certificates: [] }),
  fromUser("u_earn", { photo: 7, gender: "female", birthYear: 1995, hiredOn: "2021-02-01", salaryThb: 50_000, overtimeHours3m: 12,
    history: [hired("2021-02-01", "เริ่มงาน นักวิเคราะห์การเงิน กลุ่มเบียร์")], certificates: [] }),
  fromUser("u_may", { photo: 12, gender: "female", birthYear: 1985, hiredOn: "2012-10-01", salaryThb: 128_000, overtimeHours3m: 8,
    history: [hired("2012-10-01", "เริ่มงาน เจ้าหน้าที่สรรหา"), promoted("2018-01-01", "HR business partner สายขาย"), promoted("2023-01-01", "ผู้จัดการฝ่ายทรัพยากรบุคคล")], certificates: [] }),
  fromUser("u_ton", { photo: 38, gender: "male", birthYear: 1991, hiredOn: "2016-08-01", salaryThb: 82_000, overtimeHours3m: 26,
    history: [hired("2016-08-01", "เริ่มงาน วิศวกรระบบ"), promoted("2023-07-01", "ผู้ดูแลระบบไอที")], certificates: [] }),
  fromUser("u_golf", { photo: 30, gender: "male", birthYear: 1997, hiredOn: "2022-05-01", salaryThb: 33_000, overtimeHours3m: 18, provinceId: "pv_chonburi",
    history: [hired("2022-05-01", "เริ่มงาน พนักงานขาย ชลบุรี")], certificates: [cert(SALES_LICENCE, "2027-04-30")] }),
  fromUser("u_ice", { photo: 2, gender: "female", birthYear: 1996, hiredOn: "2021-11-01", salaryThb: 34_500, overtimeHours3m: 15, provinceId: "pv_ayutthaya",
    history: [hired("2021-11-01", "เริ่มงาน พนักงานขาย อยุธยา")], certificates: [cert(SALES_LICENCE, "2027-10-31")] }),
  fromUser("u_bank", { photo: 27, gender: "male", birthYear: 1995, hiredOn: "2020-01-06", salaryThb: 46_000, overtimeHours3m: 20, provinceId: "pv_chiangmai",
    history: [hired("2020-01-06", "เริ่มงาน เทรดมาร์เก็ตติ้ง ภาคเหนือ")], certificates: [] }),
];

const STAFF: readonly Employee[] = [
  staff({ id: "e_pong", nameTh: "คุณป้อง แสนสุข", title: "หัวหน้าทีมขาย นครราชสีมา", departmentId: "dept_sales", region: "northeast", managerId: "u_anucha",
    photo: 22, gender: "male", birthYear: 1982, hiredOn: "2009-01-05", salaryThb: 56_000, overtimeHours3m: 118, provinceId: "pv_nakhonratchasima",
    history: [hired("2009-01-05", "เริ่มงาน พนักงานขาย นครราชสีมา"), promoted("2016-01-01", "หัวหน้าทีมขาย นครราชสีมา"), trained("2019-05-20", "การขายแบบที่ปรึกษา")],
    certificates: [cert(SALES_LICENCE, "2026-10-08")] }),
  staff({ id: "e_joy", nameTh: "คุณจอย ศรีประเสริฐ", title: "พนักงานขาย นครราชสีมา", departmentId: "dept_sales", region: "northeast", managerId: "e_pong",
    photo: 8, gender: "female", birthYear: 2000, hiredOn: "2026-07-13", salaryThb: 27_000, overtimeHours3m: 46, provinceId: "pv_nakhonratchasima",
    history: [hired("2026-07-13", "เริ่มงาน พนักงานขาย นครราชสีมา (ทดลองงาน 119 วัน)"), trained("2026-07-20", "ปฐมนิเทศพนักงานขายใหม่")], certificates: [] }),
  staff({ id: "e_top", nameTh: "คุณท็อป บุญยืน", title: "พนักงานขาย ขอนแก่น", departmentId: "dept_sales", region: "northeast", managerId: "u_anucha",
    photo: 31, gender: "male", birthYear: 1993, hiredOn: "2018-02-01", salaryThb: 39_000, overtimeHours3m: 30, provinceId: "pv_khonkaen",
    history: [hired("2018-02-01", "เริ่มงาน พนักงานขาย ขอนแก่น"), trained("2024-03-15", "การขายแบบที่ปรึกษา")], certificates: [cert(SALES_LICENCE, "2027-02-28")] }),
  staff({ id: "e_nan", nameTh: "คุณแนน ภูมิพัฒน์", title: "พนักงานขาย อุบลราชธานี", departmentId: "dept_sales", region: "northeast", managerId: "u_anucha",
    photo: 20, gender: "female", birthYear: 1997, hiredOn: "2023-04-03", salaryThb: 32_000, overtimeHours3m: 34, provinceId: "pv_ubonratchathani",
    history: [hired("2023-04-03", "เริ่มงาน พนักงานขาย อุบลราชธานี"), award("2025-06-30", "ร้านค้าใหม่มากที่สุดครึ่งปีแรก 2568")], certificates: [cert(SALES_LICENCE, "2027-04-30")] }),
  staff({ id: "e_somsri", nameTh: "คุณสมศรี ทองคำ", title: "หัวหน้าแผนกบรรจุ โรงงานขอนแก่น", departmentId: "dept_production", region: "northeast", managerId: "u_oat",
    photo: 18, gender: "female", birthYear: 1968, hiredOn: "1995-06-01", salaryThb: 48_000, overtimeHours3m: 72, provinceId: "pv_khonkaen", siteId: "pl_khonkaen",
    history: [hired("1995-06-01", "เริ่มงาน พนักงานบรรจุ"), promoted("2008-01-01", "หัวหน้ากะ แผนกบรรจุ"), promoted("2015-01-01", "หัวหน้าแผนกบรรจุ")],
    certificates: [cert(GMP, "2026-10-20")] }),
  staff({ id: "e_dang", nameTh: "คุณแดง ศักดิ์ดี", title: "หัวหน้ากะ สายการผลิต 2 โรงงานขอนแก่น", departmentId: "dept_production", region: "northeast", managerId: "e_somsri",
    photo: 40, gender: "male", birthYear: 1979, hiredOn: "2003-03-01", salaryThb: 36_000, overtimeHours3m: 96, provinceId: "pv_khonkaen", siteId: "pl_khonkaen",
    history: [hired("2003-03-01", "เริ่มงาน พนักงานสายการผลิต"), promoted("2014-01-01", "หัวหน้ากะ สายการผลิต 2")], certificates: [cert(FORKLIFT, "2026-09-30"), cert(GMP, "2027-03-31")] }),
  staff({ id: "e_lek", nameTh: "คุณเล็ก มณีวงศ์", title: "พนักงานควบคุมคุณภาพ โรงงานขอนแก่น", departmentId: "dept_production", region: "northeast", managerId: "e_somsri",
    photo: 4, gender: "female", birthYear: 1999, hiredOn: "2024-02-01", salaryThb: 24_500, overtimeHours3m: 58, provinceId: "pv_khonkaen", siteId: "pl_khonkaen",
    history: [hired("2024-02-01", "เริ่มงาน พนักงานควบคุมคุณภาพ")], certificates: [cert(GMP, "2027-01-31")] }),
  staff({ id: "e_chai", nameTh: "คุณชัย วงศ์ใหญ่", title: "เจ้าหน้าที่ความปลอดภัย (จป.) โรงงานขอนแก่น", departmentId: "dept_production", region: "northeast", managerId: "u_oat",
    photo: 25, gender: "male", birthYear: 1988, hiredOn: "2014-07-01", salaryThb: 45_000, overtimeHours3m: 40, provinceId: "pv_khonkaen", siteId: "pl_khonkaen",
    history: [hired("2014-07-01", "เริ่มงาน เจ้าหน้าที่ความปลอดภัย")], certificates: [cert(SAFETY_OFFICER, "2028-06-30")] }),
  staff({ id: "e_prayoon", nameTh: "คุณประยูร ดีมาก", title: "ช่างซ่อมบำรุงอาวุโส โรงงานปทุมธานี", departmentId: "dept_production", region: "bkk", managerId: "u_wee",
    photo: 36, gender: "male", birthYear: 1967, hiredOn: "1990-01-15", salaryThb: 44_000, overtimeHours3m: 52, provinceId: "pv_pathumthani", siteId: "pl_pathumthani",
    history: [hired("1990-01-15", "เริ่มงาน ช่างซ่อมบำรุง"), promoted("2006-01-01", "ช่างซ่อมบำรุงอาวุโส"), award("2020-01-15", "อายุงาน 30 ปี")], certificates: [] }),
  staff({ id: "e_wan", nameTh: "คุณวันชัย เพชรดี", title: "พนักงานขับรถยก คลังปทุมธานี", departmentId: "dept_supply_chain", region: "bkk", managerId: "u_wee",
    photo: 37, gender: "male", birthYear: 1970, hiredOn: "1998-05-01", salaryThb: 23_000, overtimeHours3m: 84, provinceId: "pv_pathumthani", siteId: "pl_pathumthani",
    history: [hired("1998-05-01", "เริ่มงาน พนักงานคลังสินค้า"), moved("2004-01-01", "ย้ายเป็นพนักงานขับรถยก")], certificates: [cert(FORKLIFT, "2026-10-12")] }),
  staff({ id: "e_fon", nameTh: "คุณฝน รัตนพันธ์", title: "HR business partner สายขาย", departmentId: "dept_hr", region: null, managerId: "u_may",
    photo: 16, gender: "female", birthYear: 1990, hiredOn: "2017-03-01", salaryThb: 62_000, overtimeHours3m: 10,
    history: [hired("2017-03-01", "เริ่มงาน เจ้าหน้าที่สรรหา"), promoted("2023-01-01", "HR business partner สายขาย")], certificates: [] }),
  staff({ id: "e_bee", nameTh: "คุณบี จันทร์หอม", title: "เจ้าหน้าที่สรรหา", departmentId: "dept_hr", region: null, managerId: "u_may",
    photo: 17, gender: "female", birthYear: 1998, hiredOn: "2024-06-03", salaryThb: 32_000, overtimeHours3m: 22,
    history: [hired("2024-06-03", "เริ่มงาน เจ้าหน้าที่สรรหา")], certificates: [] }),
  staff({ id: "e_ning", nameTh: "คุณหนิง สายทอง", title: "เจ้าหน้าที่ฝึกอบรม", departmentId: "dept_hr", region: null, managerId: "u_may",
    photo: 5, gender: "female", birthYear: 1992, hiredOn: "2019-09-02", salaryThb: 41_000, overtimeHours3m: 12,
    history: [hired("2019-09-02", "เริ่มงาน เจ้าหน้าที่ฝึกอบรม")], certificates: [] }),
  staff({ id: "e_kwan", nameTh: "คุณขวัญ ประเสริฐวงศ์", title: "เจ้าหน้าที่เงินเดือน", departmentId: "dept_hr", region: null, managerId: "u_may",
    photo: 19, gender: "female", birthYear: 1991, hiredOn: "2018-04-02", salaryThb: 43_000, overtimeHours3m: 16,
    history: [hired("2018-04-02", "เริ่มงาน เจ้าหน้าที่เงินเดือน")], certificates: [] }),
];

/** Everyone the directory knows: the login personas plus the staff who only appear as data. */
export const EMPLOYEES: readonly Employee[] = [...LOGIN_PEOPLE, ...STAFF];

export const OPEN_POSITIONS: readonly OpenPosition[] = [
  { id: "op_ne_ubon", title: "พนักงานขาย อุบลราชธานี (เขตวารินฯ)", departmentId: "dept_sales", region: "northeast", provinceId: "pv_ubonratchathani", managerId: "u_anucha", openedOn: "2026-06-15" },
  { id: "op_ne_khonkaen", title: "พนักงานขาย ขอนแก่น (เขตชุมแพ)", departmentId: "dept_sales", region: "northeast", provinceId: "pv_khonkaen", managerId: "u_anucha", openedOn: "2026-07-20" },
  { id: "op_ne_korat", title: "พนักงานขาย นครราชสีมา (เขตปากช่อง)", departmentId: "dept_sales", region: "northeast", provinceId: "pv_nakhonratchasima", managerId: "e_pong", openedOn: "2026-08-04" },
  { id: "op_kk_qc", title: "พนักงานควบคุมคุณภาพ โรงงานขอนแก่น", departmentId: "dept_production", region: "northeast", provinceId: "pv_khonkaen", managerId: "e_somsri", openedOn: "2026-09-01" },
];

const EMPLOYEE_INDEX: ReadonlyMap<string, Employee> = new Map(EMPLOYEES.map((employee) => [employee.id, employee]));

export function employeeById(id: string): Employee | null {
  return EMPLOYEE_INDEX.get(id) ?? null;
}

/** The chain of managers above an employee, nearest first. */
export function managersOf(employee: Employee): Employee[] {
  const chain: Employee[] = [];
  let next = employee.managerId ? employeeById(employee.managerId) : null;
  while (next && !chain.includes(next)) {
    chain.push(next);
    next = next.managerId ? employeeById(next.managerId) : null;
  }
  return chain;
}

/** Whether `managerId` sits anywhere above the employee in the reporting line. */
export function reportsTo(employee: Employee, managerId: string): boolean {
  return managersOf(employee).some((manager) => manager.id === managerId);
}
