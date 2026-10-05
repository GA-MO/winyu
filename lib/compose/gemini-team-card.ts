/** The components Gemini wrote for the CEO's "ใครดูแลภาคอีสาน ขอข้อมูลคนนั้นและทีมของเขาหน่อย" (2026-10-05). */
export const GEMINI_TEAM_CARD = [
  { id: "root", component: "Card", title: "ผู้ดูแลและทีมขายภาคอีสาน", meta: "คุณอนุชา พรหมศรี และทีมงานสายตรง", footnote: "ระบบ HR / โครงสร้างองค์กร", children: ["sec_leader", "sec_team", "sec_vacancies"] },
  { id: "sec_leader", component: "Section", label: "ผู้จัดการขายภาค", children: ["leader_person", "leader_facts"] },
  { id: "leader_person", component: "Person", name: { path: "/get_person/data/name" }, role: { path: "/get_person/data/title" }, src: { path: "/get_person/data/photo" } },
  { id: "leader_facts", component: "KeyValue", from: { path: "/get_person/data/facts" } },
  { id: "sec_team", component: "Grid", children: { componentId: "item_report", path: "/get_person/data/reports" } },
  { id: "item_report", component: "ListItem", title: { path: "name" }, subtitle: { path: "title" }, src: { path: "photo" }, media: "avatar", action: { event: { name: "ask", context: { prompt: "ขอดูโปรไฟล์", about: { path: "name" } } } } },
  { id: "sec_vacancies", component: "Grid", children: ["open_pos_1", "open_pos_2"] },
  { id: "open_pos_1", component: "ListItem", media: "none", title: { path: "/find_people/open_positions/0/title" }, subtitle: { path: "/find_people/open_positions/0/open_label" } },
  { id: "open_pos_2", component: "ListItem", media: "none", title: { path: "/find_people/open_positions/1/title" }, subtitle: { path: "/find_people/open_positions/1/open_label" } },
];
