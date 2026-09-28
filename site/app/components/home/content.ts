export type Status = "ready" | "adapter" | "planned";

export const STATUS_LABEL: Record<Status, string> = {
  ready: "พร้อมใช้",
  adapter: "โครงพร้อม · เขียน adapter",
  planned: "อยู่ในแผน",
};

export const NAV = [
  { href: "#principle", label: "หลักการ" },
  { href: "#architecture", label: "สถาปัตยกรรม" },
  { href: "#connect", label: "การเชื่อมต่อ" },
  { href: "#security", label: "ความปลอดภัย" },
  { href: "#start", label: "เริ่มต้น" },
  { href: "/docs", label: "เอกสาร" },
];

export const READS = [
  { label: "ยอดขาย สต๊อก การผลิต", source: "คลังข้อมูล / BI" },
  { label: "การเงินและลูกหนี้", source: "คลังข้อมูล / ERP" },
  { label: "พนักงานและผังองค์กร", source: "HRIS / Active Directory" },
  { label: "ประวัติอบรมและใบอนุญาต", source: "LMS" },
  { label: "วันลาและนโยบาย HR", source: "ระบบลา" },
];

export const STORES = [
  "หน้าตาแดชบอร์ดของแต่ละคน",
  "การแจ้งเตือนและสถานะการติดตาม",
  "งานที่ส่งต่อระหว่างคน",
  "ความจำส่วนตัว เช่น คำเรียกที่ใช้บ่อย",
  "บันทึกการใช้งาน (audit) ทุกครั้งที่เรียกข้อมูล",
];

export const DOORS: {
  id: string;
  name: string;
  tech: string;
  status: Status;
  forWhat: string;
  effort: string;
  examples: string[];
  points: string[];
}[] = [
  {
    id: "metrics",
    name: "ประตูตัวเลข",
    tech: "Metrics port",
    status: "adapter",
    forWhat: "KPI บนแดชบอร์ดและคำถามเรื่องตัวเลข",
    effort: "adapter หนึ่งตัว ต่อคลังข้อมูลหนึ่งแห่ง ทำครั้งเดียว",
    examples: ["Snowflake", "BigQuery", "Databricks", "SQL Server", "Oracle", "SAP BW / HANA", "dbt", "Cube", "Power BI semantic model"],
    points: [
      "อ่านจาก semantic layer ที่องค์กรรับรองแล้ว ตัวเลขจึงตรงกับรายงานในที่ประชุม",
      "ส่งผ่าน SQL, REST หรือ MCP ก็ได้ Winyu ไม่ผูกกับช่องทาง",
      "ใช้บัญชีอ่านอย่างเดียว Winyu ใส่ขอบเขตสิทธิ์ลงใน query ทุกครั้ง",
    ],
  },
  {
    id: "rest",
    name: "REST connector",
    tech: "kind: rest",
    status: "planned",
    forWhat: "ระบบที่มี API อยู่แล้ว เช่น HR, LMS, SFA ผ่าน API gateway",
    effort: "config หนึ่งไฟล์ต่อหนึ่งระบบ อ่าน OpenAPI ได้ในขั้นถัดไป",
    examples: ["API gateway", "MuleSoft", "SAP CPI", "Azure APIM", "REST ภายใน", "OData"],
    points: [
      "ใช้ขั้นตอนเดียวกับ MCP connector: ใส่ขอบเขต กรองแถว ปิดฟิลด์ บันทึก audit",
      "รับ service account หรือ token รายคน (on-behalf-of) ได้",
      "ต่อผ่าน gateway กลางที่เดียว ไม่ต่อตรงทีละระบบ",
    ],
  },
  {
    id: "mcp",
    name: "MCP connector",
    tech: "Model Context Protocol",
    status: "ready",
    forWhat: "ระบบที่ vendor มี MCP server หรือทีมอยากดูแลเอง",
    effort: "config หนึ่งไฟล์ ไม่แก้หน้าจอ ไม่แก้ prompt",
    examples: ["MCP server ของ vendor", "MCP ที่ครอบ API เดิม", "เดโม LMS ใน Winyu"],
    points: [
      "เปิดเฉพาะ tool ที่ประกาศไว้ ไม่มีการเปิดทั้งหมดในครั้งเดียว",
      "ส่งตัวตนผู้ถามไปพร้อมทุกคำขอ ปลายทางบังคับสิทธิ์ซ้ำได้",
      "ปิดทั้ง connector ได้จากหน้า admin และมีผลทันที",
    ],
  },
];

export const JOURNEY = [
  { title: "ถาม หรือเปิดแดชบอร์ด", body: "“ยอดขายภาคเหนือเดือนนี้เป็นอย่างไร”" },
  { title: "รู้ว่าเป็นใคร", body: "SSO บอกบทบาท ภาค และแบรนด์ที่ดูแล" },
  { title: "เลือก metric", body: "AI เลือกจากรายการที่นิยามไว้ ไม่แต่งตัวเลขเอง" },
  { title: "ใส่ขอบเขตสิทธิ์", body: "Winyu เขียนขอบเขตลงใน query ก่อนส่งออก" },
  { title: "ระบบต้นทางคำนวณ", body: "คลังข้อมูลส่งแถวที่คำนวณแล้วกลับมา" },
  { title: "ตรวจ แล้ววาดการ์ด", body: "ซ่อนกลุ่มเล็ก ปิดฟิลด์อ่อนไหว บันทึก audit แล้วแสดงพร้อมที่มา" },
];

export const SAFEGUARDS = [
  { title: "สิทธิ์อยู่ในโค้ด ไม่อยู่ใน prompt", body: "ขอบเขตถูกใส่ลงใน query ทุกครั้ง AI ขยายขอบเขตเองไม่ได้ แม้จะถูกสั่งในแชท" },
  { title: "AI ไม่แต่งตัวเลข", body: "ตัวเลขทุกตัวบนการ์ดมาจากผลของ query และแสดงแหล่งที่มากับเวลาของข้อมูลเสมอ" },
  { title: "ตัวตนไปถึงปลายทาง", body: "ทุกคำขอส่งตัวตนผู้ถามไปด้วย ระบบต้นทางจึงบังคับสิทธิ์ของตัวเองซ้ำได้อีกชั้น" },
  { title: "ปิดบังฟิลด์ตามบทบาท", body: "เช่น ผู้บริหารเห็นคะแนนเต็ม ผู้จัดการเห็นเป็น *** ตั้งค่าได้จากหน้า admin" },
  { title: "ปิดได้ทันที", body: "ปิด tool ปิดทั้ง connector หรือปิดสิทธิ์รายบทบาท มีผลกับคำถามถัดไปทันที" },
  { title: "ทุกการเรียกมี audit", body: "บันทึกว่าใครขออะไร ได้ ถูกปิดบัง หรือถูกปฏิเสธ และเพราะอะไร" },
];

export const PREPARE = [
  {
    system: "คลังข้อมูล / BI",
    need: ["บัญชีอ่านอย่างเดียว", "นิยาม metric (view, semantic view หรือ dbt ที่มีอยู่)", "รหัสภาค แบรนด์ เอเย่นต์ที่คงที่", "เวลาอัปเดตข้อมูลล่าสุด"],
    noNeed: "ไม่เปลี่ยน schema ไม่ย้ายข้อมูล ไม่ sync ข้อมูลมาให้ Winyu",
  },
  {
    system: "HR · LMS · SFA · ระบบลา",
    need: ["API ให้อ่าน (REST หรือ MCP)", "ถ้าต้องการบังคับสิทธิ์เอง ให้รับตัวตนผู้ใช้จาก Winyu"],
    noNeed: "ไม่เพิ่มหน้าจอ ไม่ทำ export ไฟล์",
  },
  {
    system: "ตัวตนผู้ใช้ (SSO)",
    need: ["login ผ่าน Entra ID / AD", "กลุ่มที่บอกบทบาท และข้อมูลว่าใครดูแลภาคหรือแบรนด์ไหน"],
    noNeed: "ไม่สร้างบัญชีผู้ใช้ชุดใหม่",
  },
  {
    system: "เครือข่าย",
    need: ["เซิร์ฟเวอร์ Winyu เข้าถึงระบบต้นทางได้ (private network / VPN)"],
    noNeed: "ไม่เปิดระบบต้นทางออกอินเทอร์เน็ต",
  },
];

export const LANDSCAPE = [
  { group: "ERP", typical: "SAP ECC / S/4HANA", via: "อ่านผ่านคลังข้อมูล ไม่อ่านตรง" },
  { group: "คลังข้อมูล · BI", typical: "SAP BW, SQL Server, Snowflake · Power BI", via: "ประตูตัวเลข" },
  { group: "ขายภาคสนาม · DMS", typical: "SFA ที่พัฒนาเอง, Salesforce", via: "REST ผ่าน gateway" },
  { group: "HR · LMS · ลา", typical: "SuccessFactors, HRM ไทย, LMS ของ vendor", via: "REST หรือ MCP" },
  { group: "ตัวตน · อีเมล", typical: "Active Directory, Entra ID, M365", via: "SSO, Microsoft Graph" },
  { group: "ระบบเก่าไม่มี API", typical: "ฐานข้อมูล, ไฟล์ส่งทุกคืน", via: "อ่านจากสำเนาในคลังข้อมูล" },
];

export const ROADMAP = [
  { title: "Identity & access", body: "ต่อ SSO และตารางว่าใครดูแลภาคหรือแบรนด์ไหน ทุกกลไกสิทธิ์ของ Winyu เริ่มจากตรงนี้", from: "ลูกค้า: Entra ID group และข้อมูลขอบเขต" },
  { title: "Numbers from the warehouse", body: "ต่อประตูตัวเลขแบบอ่านอย่างเดียว เปิดแดชบอร์ดและคำถามเรื่อง KPI ด้วยข้อมูลจริง", from: "ลูกค้า: บัญชีอ่าน และนิยาม metric" },
  { title: "Records, system by system", body: "ต่อ HR, LMS, SFA ผ่าน API gateway ด้วย REST หรือ MCP connector ทีละระบบ", from: "ลูกค้า: endpoint บน gateway" },
  { title: "Write back to your systems", body: "ส่งคำขอลา ลงทะเบียนอบรม หรือคำสั่งงาน เข้า workflow อนุมัติที่มีอยู่", from: "ลูกค้า: workflow และสิทธิ์เขียน" },
];

export const QUESTIONS = [
  "ตัวเลขในที่ประชุมผู้บริหารมาจากคลังข้อมูลหรือ BI ตัวไหน และมี semantic model ที่รับรองแล้วไหม",
  "มี API gateway หรือ middleware กลางไหม ทีมไหนดูแล",
  "ระบบ HR, LMS, SFA และระบบลาใช้ของอะไร มี API หรือ MCP ไหม",
  "login ใช้ Entra ID หรือ AD ไหม ข้อมูลว่าใครดูแลภาคไหนอยู่ที่ระบบไหน",
  "นโยบายยอมให้ใช้บัญชี service อ่านคลังข้อมูล หรือต้องส่งตัวตนผู้ใช้ทุกคำขอ",
  "ข้อมูลในคลังข้อมูลอัปเดตถี่แค่ไหน รายวันหรือใกล้เคียงเวลาจริง",
];

export const FAQ = [
  { q: "ต้องย้ายข้อมูลมาไว้ที่ Winyu ไหม", a: "ไม่ต้อง Winyu อ่านจากระบบต้นทางทุกครั้งที่มีคนถามหรือเปิดแดชบอร์ด สิ่งที่ Winyu เก็บเองมีแค่สถานะของแอป เช่น หน้าตาแดชบอร์ด การแจ้งเตือน และบันทึกการใช้งาน" },
  { q: "ระบบเราไม่มี MCP ต่อได้ไหม", a: "ได้ ระบบที่มี REST API หรือเปิดให้อ่านด้วย SQL ก็ต่อได้ ระบบหลักต่อเป็น adapter ส่วนระบบรองต่อผ่าน connector ที่ประกาศใน config ทุกทางใช้กลไกสิทธิ์และ audit ชุดเดียวกัน" },
  { q: "AI เห็นข้อมูลทั้งบริษัทไหม", a: "ไม่ AI เห็นเฉพาะผลลัพธ์ที่ผ่านขอบเขตสิทธิ์ของคนที่ถามแล้ว ขอบเขตถูกใส่ในโค้ดก่อน query ออกไป ไม่ได้ขอให้ AI ช่วยระวัง" },
  { q: "ตัวเลขจะตรงกับรายงานเดิมไหม", a: "ตรง ถ้าต่อผ่าน semantic layer ที่องค์กรใช้อยู่ เพราะ Winyu ใช้นิยาม metric ชุดเดียวกับรายงานเดิม และทุกการ์ดแสดงที่มากับเวลาของข้อมูล" },
  { q: "ถ้าระบบต้นทางล่มจะเกิดอะไรขึ้น", a: "การ์ดที่อ่านจากระบบนั้นบอกว่าระบบไม่ตอบในขณะนี้ ส่วนอื่นของ Winyu ใช้งานได้ตามปกติ และเหตุการณ์ถูกบันทึกใน audit" },
];
