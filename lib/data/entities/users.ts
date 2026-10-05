import type { Region, RoleId, User } from "@/lib/contracts";

const EMAIL_DOMAIN = "boonrawd-demo.co.th";

type UserSeed = { id: string; name: string; nameTh: string; title: string; role: RoleId; department: string; region: Region | null; managerId: string | null };

function user(seed: UserSeed): User {
  const handle = seed.id.replace(/^u_/, "");
  return { ...seed, email: `${handle}@${EMAIL_DOMAIN}`, lineId: `@${handle}`, avatarSeed: seed.id };
}

export const USERS: readonly User[] = [
  user({ id: "u_thana", name: "Thana Wongsakul", nameTh: "คุณธนา วงศ์สกุล", title: "ประธานเจ้าหน้าที่บริหาร", role: "ceo", department: "บริหาร", region: null, managerId: null }),
  user({ id: "u_siriporn", name: "Siriporn Rattanakorn", nameTh: "คุณศิริพร รัตนกร", title: "ประธานเจ้าหน้าที่การเงิน", role: "cfo", department: "การเงิน", region: null, managerId: "u_thana" }),
  user({ id: "u_prasit", name: "Prasit Chaiyaphum", nameTh: "คุณประสิทธิ์ ชัยภูมิ", title: "ผู้อำนวยการฝ่ายขาย", role: "sales_director", department: "ขาย", region: null, managerId: "u_thana" }),
  user({ id: "u_kanok", name: "Kanok Srisuwan", nameTh: "คุณกนก ศรีสุวรรณ", title: "ผู้จัดการขายภาค กรุงเทพฯ", role: "sales_rsm", department: "ขาย", region: "bkk", managerId: "u_prasit" }),
  user({ id: "u_somchai", name: "Somchai Boonmee", nameTh: "คุณสมชาย บุญมี", title: "ผู้จัดการขายภาค ภาคกลาง", role: "sales_rsm", department: "ขาย", region: "central", managerId: "u_prasit" }),
  user({ id: "u_nattaya", name: "Nattaya Kaewkla", nameTh: "คุณณัฐยา แก้วกล้า", title: "ผู้จัดการขายภาค ภาคเหนือ", role: "sales_rsm", department: "ขาย", region: "north", managerId: "u_prasit" }),
  user({ id: "u_anucha", name: "Anucha Phromsri", nameTh: "คุณอนุชา พรหมศรี", title: "ผู้จัดการขายภาค ภาคอีสาน", role: "sales_rsm", department: "ขาย", region: "northeast", managerId: "u_prasit" }),
  user({ id: "u_wichai", name: "Wichai Thongdee", nameTh: "คุณวิชัย ทองดี", title: "ผู้จัดการขายภาค ภาคตะวันออก", role: "sales_rsm", department: "ขาย", region: "east", managerId: "u_prasit" }),
  user({ id: "u_saranya", name: "Saranya Nilrat", nameTh: "คุณสรัญญา นิลรัตน์", title: "ผู้จัดการขายภาค ภาคใต้", role: "sales_rsm", department: "ขาย", region: "south", managerId: "u_prasit" }),
  user({ id: "u_krit", name: "Krit Jansen", nameTh: "คุณกฤต จันทร์เสน", title: "พนักงานขาย ขอนแก่น", role: "sales_rep", department: "ขาย", region: "northeast", managerId: "u_anucha" }),
  user({ id: "u_nok", name: "Nok Suksawat", nameTh: "คุณนก สุขสวัสดิ์", title: "พนักงานขาย บุรีรัมย์", role: "sales_rep", department: "ขาย", region: "northeast", managerId: "u_anucha" }),
  user({ id: "u_ploy", name: "Ploy Chanthara", nameTh: "คุณพลอย จันทรา", title: "พนักงานขาย เชียงใหม่", role: "sales_rep", department: "ขาย", region: "north", managerId: "u_nattaya" }),
  user({ id: "u_beam", name: "Beam Panyarat", nameTh: "คุณบีม ปัญญารัตน์", title: "พนักงานขาย กรุงเทพฯ", role: "sales_rep", department: "ขาย", region: "bkk", managerId: "u_kanok" }),
  user({ id: "u_arm", name: "Arm Sitthichai", nameTh: "คุณอาร์ม สิทธิชัย", title: "พนักงานขาย หาดใหญ่", role: "sales_rep", department: "ขาย", region: "south", managerId: "u_saranya" }),
  user({ id: "u_ben", name: "Ben Techawong", nameTh: "คุณเบญ เตชะวงศ์", title: "ผู้จัดการแบรนด์ กลุ่มนอนแอลกอฮอล์", role: "marketing_lead", department: "การตลาด", region: null, managerId: "u_thana" }),
  user({ id: "u_pim", name: "Pim Suriyawong", nameTh: "คุณพิม สุริยวงศ์", title: "เทรดมาร์เก็ตติ้ง ภาคอีสาน", role: "marketing_lead", department: "การตลาด", region: "northeast", managerId: "u_ben" }),
  user({ id: "u_fah", name: "Fah Lertpanya", nameTh: "คุณฟ้า เลิศปัญญา", title: "ผู้จัดการแบรนด์ กลุ่มเบียร์", role: "marketing_lead", department: "การตลาด", region: null, managerId: "u_ben" }),
  user({ id: "u_wee", name: "Wee Charoensuk", nameTh: "คุณวีร์ เจริญสุข", title: "นักวางแผนซัพพลาย", role: "supply_planner", department: "ซัพพลายเชน", region: null, managerId: "u_thana" }),
  user({ id: "u_oat", name: "Oat Pattanapong", nameTh: "คุณโอ๊ต พัฒนพงศ์", title: "นักวางแผนการผลิต โรงงานขอนแก่น", role: "supply_planner", department: "ซัพพลายเชน", region: "northeast", managerId: "u_wee" }),
  user({ id: "u_mint", name: "Mint Worakul", nameTh: "คุณมิ้นท์ วรกุล", title: "นักวิเคราะห์การเงิน", role: "finance_analyst", department: "การเงิน", region: null, managerId: "u_siriporn" }),
  user({ id: "u_earn", name: "Earn Saengthong", nameTh: "คุณเอิร์น แสงทอง", title: "นักวิเคราะห์การเงิน กลุ่มเบียร์", role: "finance_analyst", department: "การเงิน", region: null, managerId: "u_siriporn" }),
  user({ id: "u_may", name: "May Kittisak", nameTh: "คุณเมย์ กิตติศักดิ์", title: "ผู้จัดการฝ่ายทรัพยากรบุคคล", role: "hr_manager", department: "ทรัพยากรบุคคล", region: null, managerId: "u_thana" }),
  user({ id: "u_ton", name: "Ton Aroonrat", nameTh: "คุณต้น อรุณรัตน์", title: "ผู้ดูแลระบบไอที", role: "it_admin", department: "ไอที", region: null, managerId: "u_thana" }),
  user({ id: "u_golf", name: "Golf Meesuk", nameTh: "คุณกอล์ฟ มีสุข", title: "พนักงานขาย ชลบุรี", role: "sales_rep", department: "ขาย", region: "east", managerId: "u_wichai" }),
  user({ id: "u_ice", name: "Ice Rungrueang", nameTh: "คุณไอซ์ รุ่งเรือง", title: "พนักงานขาย อยุธยา", role: "sales_rep", department: "ขาย", region: "central", managerId: "u_somchai" }),
  user({ id: "u_bank", name: "Bank Duangjai", nameTh: "คุณแบงค์ ดวงใจ", title: "เทรดมาร์เก็ตติ้ง ภาคเหนือ", role: "marketing_lead", department: "การตลาด", region: "north", managerId: "u_ben" }),
];

export function findUser(id: string): User | null {
  return USERS.find((candidate) => candidate.id === id) ?? null;
}
