import { FACTS, mark } from "../kit";

type Role = (typeof FACTS.roles)[number];
type Spine = NonNullable<Role["spine"]>;

/** A role Winyu found the credit story for, with its own next step. */
export type SpineRole = Omit<Role, "spine"> & { spine: Spine };

/** One agent bar of the Sales Director's real card: litres and % against target. */
export type AgentBar = { name: string; litres: string; pct: number; label: string };

/** A node of the organisation constellation: a role or one of the two agents. */
export type OrgNode = { id: string; title: string; depth: number; parentId: string | null; kind: "role" | "agent"; direction: [number, number, number] };

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const CLIFF_DATE = "2026-09-11";
const DEPTH_POLAR_DEGREES = [0, 50, 92, 127, 156];

const HERO_LINES: Record<string, [string, string]> = {
  u_krit: ["เข้าพบอีสานรุ่งโรจน์", "ถามว่าติดวงเงินไหม"],
  u_anucha: ["ขอฝ่ายสินเชื่อเช็กว่า", "ติดวงเงินไหม ถ้าติดขอขยายชั่วคราว"],
  u_thana: ["ถามผู้อำนวยการฝ่ายขายว่า", "สองเอเย่นต์อีสานติดวงเงินจริงไหม"],
  u_siriporn: ["ถามฝ่ายสินเชื่อว่าวงเงิน", "เต็มจนบล็อกคำสั่งซื้อหรือไม่"],
};

const BURST_FRAGMENTS: Record<string, string> = {
  u_prasit: "ถามผู้จัดการขายภาคอีสาน",
  u_mint: "ตรวจวงเงินสองรายกับฝ่ายสินเชื่อ",
  u_earn: "ปรับประมาณการปิดเดือนเบียร์",
  u_ben: "ปลดได้ก่อนสิ้นเดือนหรือไม่",
  u_fah: "ปลดคำสั่งซื้อของสองเอเย่นต์",
  u_pim: "ก่อนลงงบโปรเพิ่มให้สองรายนี้",
};

/** The order light reaches the spine roles in the radiate beat, each with the node it travels from. */
export const RADIATE_ORDER: { id: string; from: string; hero: boolean }[] = [
  { id: "u_krit", from: "agent_1", hero: true },
  { id: "u_anucha", from: "u_krit", hero: true },
  { id: "u_prasit", from: "u_anucha", hero: false },
  { id: "u_thana", from: "u_prasit", hero: true },
  { id: "u_siriporn", from: "u_thana", hero: true },
  { id: "u_mint", from: "u_siriporn", hero: false },
  { id: "u_earn", from: "u_siriporn", hero: false },
  { id: "u_ben", from: "u_thana", hero: false },
  { id: "u_fah", from: "u_ben", hero: false },
  { id: "u_pim", from: "u_ben", hero: false },
];

/** The shot id of each hero role's real morning drawer. */
export const HERO_SHOTS = { u_krit: "story-rep", u_anucha: "story-rsm", u_thana: "story-ceo", u_siriporn: "story-cfo" } as const;

/** Keeps only a contiguous piece of a real sentence; throws if the piece was reworded. */
export function trimmed(source: string, piece: string): string {
  if (!source.includes(piece)) throw new Error(`"${piece}" is not a trim of "${source}"`);
  return piece;
}

function roleById(userId: string): Role {
  const found = FACTS.roles.find((role) => role.userId === userId);
  if (!found) throw new Error(`No role ${userId}`);
  return found;
}

function spineRole(userId: string): SpineRole {
  const role = roleById(userId);
  if (!role.spine) throw new Error(`${userId} is not on the spine`);
  return { ...role, spine: role.spine };
}

/** A hero role's title and its action cut into two real lines. */
export function heroCopy(userId: keyof typeof HERO_LINES & string): { title: string; lines: [string, string]; scope: string } {
  const role = spineRole(userId);
  const [first, second] = HERO_LINES[userId];
  return { title: role.role, lines: [trimmed(role.spine.action, first), trimmed(role.spine.action, second)], scope: role.spine.scope };
}

/** A burst role's title and a short real fragment of its action. */
export function burstCopy(userId: string): { title: string; fragment: string } {
  const role = spineRole(userId);
  const fragment = BURST_FRAGMENTS[userId];
  if (!fragment) throw new Error(`No fragment for ${userId}`);
  return { title: role.role, fragment: trimmed(role.spine.action, fragment) };
}

/** The scope a spine role's story is told in, e.g. "ทั่วประเทศ". */
export function scopeOf(userId: string): string {
  return spineRole(userId).spine.scope;
}

/** "2026-09-11" as "11 ก.ย.". */
export function thaiDay(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day} ${THAI_MONTHS[month - 1]}`;
}

/** Thousands separators, the way the app prints litres. */
export function grouped(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** The alert agent's daily litres, with the honest average before and since the cliff day. */
export function alertAgentSeries() {
  const series = FACTS.dailyOrders.find((agent) => FACTS.alert.hypothesis.startsWith(agent.agent));
  if (!series) throw new Error("No daily orders for the alert agent");
  const points = series.points;
  const cliffIndex = points.findIndex((point) => point.date === CLIFF_DATE);
  const before = points.slice(0, cliffIndex).map((point) => point.litres);
  const since = points.slice(cliffIndex).map((point) => point.litres);
  return {
    agent: series.agent,
    points,
    cliffIndex,
    beforeAverage: Math.round(average(before)),
    sinceAverage: Math.round(average(since)),
    firstDay: thaiDay(points[0].date),
    lastBeforeDay: thaiDay(points[cliffIndex - 1].date),
    cliffDay: thaiDay(points[cliffIndex].date),
    lastDay: thaiDay(points[points.length - 1].date),
  };
}

/** The eight agent bars of the Sales Director's real card, parsed from its rendered text. */
export function storyBars(): AgentBar[] {
  const text = mark("story", "bars").text;
  const pattern = /(\S[^\d]*?) ([\d,]+) ลิตร ([+-][\d.]+)%/gu;
  return [...text.matchAll(pattern)].map((match) => ({ name: match[1].trim(), litres: match[2], pct: Number(match[3]), label: `${match[3].replace("-", "−")}%` }));
}

/** The card title of the bar chart, trimmed to its first phrase. */
export function barsCaption(): string {
  return trimmed(mark("story", "cardTitle").text, "ยอดขายเข้าอีสานเทียบเป้า");
}

/** Every copy line the film shows, all trimmed from the facts. */
export function filmCopy() {
  const director = spineRole("u_prasit");
  const series = alertAgentSeries();
  const [lessonHead, ...lessonTail] = FACTS.lesson.outcome.split(" ");
  return {
    hookHeadline: trimmed(FACTS.alert.hypothesis, `${series.agent} แทบไม่มีคำสั่งซื้อ`),
    systemHeadline: `Winyu สืบให้ตั้งแต่ ${FACTS.totals.firstRun}`,
    causeLines: [trimmed(director.spine.finding, "สองเอเย่นต์ใหญ่แทบหยุดสั่งเบียร์"), trimmed(director.spine.finding, "น่าจะติดวงเงิน")] as [string, string],
    ruledOut: director.spine.ruledOut.slice(0, 2),
    ruledOutChip: trimmed(mark("story", "ruledOut").text, "ตัดทิ้งแล้ว"),
    lessonLines: [`ครั้งก่อน: ${lessonHead}`, lessonTail.join(" ")] as [string, string],
    lessonDate: FACTS.lesson.date,
    dashboardScope: (mark("dashboard", "scope").text.match(/เฉพาะ [^·]+/u)?.[0] ?? "").trim(),
    tagline: "ผู้ช่วยข้อมูลสำหรับทุกคนในองค์กร",
  };
}

function childrenOf(managerId: string): string[] {
  return FACTS.orgEdges.filter(([manager]) => manager === managerId).map(([, report]) => report);
}

/** The two agents of the daily orders, as constellation node ids. */
export function agentNodes(): { id: string; name: string }[] {
  return FACTS.dailyOrders.map((series, index) => ({ id: `agent_${index}`, name: series.agent }));
}

/** Where the agents hang in the layout and which roles they touch: the RSM of their region, and the rep whose agent it is. */
export const AGENT_LINKS: [string, string][] = [
  ["u_anucha", "agent_0"],
  ["u_anucha", "agent_1"],
  ["u_krit", "agent_1"],
];

/** All 26 roles plus the 2 agents, laid out on a sphere: the CEO at the pole, each reporting level one band lower, siblings side by side. */
export function orgLayout(): OrgNode[] {
  const root = FACTS.roles.find((role) => role.managerId === null);
  if (!root) throw new Error("No root role");
  const layoutChildren = (id: string): string[] => (id === "u_anucha" ? ["u_nok", "agent_0", "agent_1", "u_krit"] : childrenOf(id));
  const leaves: string[] = [];
  const depthOf = new Map<string, number>();
  const parentOf = new Map<string, string | null>();
  const visit = (id: string, depth: number, parentId: string | null) => {
    depthOf.set(id, depth);
    parentOf.set(id, parentId);
    const children = layoutChildren(id);
    if (children.length === 0) leaves.push(id);
    for (const child of children) visit(child, id.startsWith("agent") ? depth : depth + 1, id);
  };
  visit(root.userId, 0, null);
  const slot = (Math.PI * 2) / leaves.length;
  const longitude = new Map<string, number>();
  const place = (id: string): number => {
    const children = layoutChildren(id);
    const value = children.length === 0 ? leaves.indexOf(id) * slot : children.map(place).reduce((sum, angle) => sum + angle, 0) / children.length;
    longitude.set(id, value);
    return value;
  };
  place(root.userId);
  const agents = agentNodes();
  return [...depthOf.keys()].map((id) => {
    const agent = agents.find((candidate) => candidate.id === id);
    const depth = agent ? DEPTH_POLAR_DEGREES.length - 1 : (depthOf.get(id) ?? 0);
    const polar = (DEPTH_POLAR_DEGREES[depth] * Math.PI) / 180;
    const azimuth = longitude.get(id) ?? 0;
    const direction: [number, number, number] = [Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)];
    return { id, title: agent ? agent.name : roleById(id).role, depth, parentId: agent ? null : (parentOf.get(id) ?? null), kind: agent ? "agent" : "role", direction };
  });
}

/** Roles in the order Winyu ran for them overnight, with the running count of data looks. */
export function overnightRuns(): { id: string; ranAt: string; checkedSoFar: number }[] {
  const ordered = [...FACTS.roles].sort((a, b) => a.ranAt.localeCompare(b.ranAt));
  let running = 0;
  return ordered.map((role) => {
    running += role.checked;
    return { id: role.userId, ranAt: role.ranAt, checkedSoFar: running };
  });
}
