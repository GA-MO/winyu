import { FACTS, mark, roleTitle, type ShotId } from "../kit";

/** One of the 26 people Winyu investigated for overnight, in the order the runs happened. */
export type NightRole = { userId: string; role: string; ranAt: string; minute: number; checked: number; spine: boolean };

/** A drawer shown at dawn: whose screen it is, their role title and their own next step cut into short verbatim lines. */
export type DawnDrawer = { shot: ShotId; userId: string; role: string; actionLines: string[] };

const SALES_DIRECTOR = "u_prasit";
const CLIFF_DATE = "2026-09-11";
const MINUS = "−";

const DAWN_TRIMS: { shot: ShotId; userId: string; lines: string[][] }[] = [
  { shot: "story-ceo", userId: "u_thana", lines: [["ถามผู้อำนวยการฝ่ายขาย"], ["ว่าสองเอเย่นต์อีสานติดวงเงินจริงไหม"]] },
  { shot: "story-cfo", userId: "u_siriporn", lines: [["ถามฝ่ายสินเชื่อว่าวงเงิน"], ["เต็มจนบล็อกคำสั่งซื้อหรือไม่"]] },
  { shot: "story-rsm", userId: "u_anucha", lines: [["ขอฝ่ายสินเชื่อเช็กว่า", "ติดวงเงินไหม"], ["ถ้าติดขอขยายชั่วคราว"]] },
  { shot: "story-rep", userId: "u_krit", lines: [["เข้าพบอีสานรุ่งโรจน์"], ["ถามว่าติดวงเงินไหม"]] },
];

/** Minutes after midnight of an "HH:MM" run time. */
export function minuteOf(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}

/** "HH:MM" of minutes after midnight. */
export function clockOf(minute: number): string {
  const whole = Math.floor(minute);
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

/** Returns `piece` only if it appears word for word in `source`, so on-screen lines stay verbatim trims of the data. */
export function verbatim(source: string, piece: string): string {
  if (!source.includes(piece)) throw new Error(`Not verbatim: "${piece}" in "${source}"`);
  return piece;
}

/** Joins in-order verbatim pieces of `source`, dropping only the words between them. */
export function trimmed(source: string, pieces: string[]): string {
  let from = 0;
  for (const piece of pieces) {
    const at = source.indexOf(piece, from);
    if (at < 0) throw new Error(`Not an in-order trim: "${piece}" in "${source}"`);
    from = at + piece.length;
  }
  return pieces.join("");
}

function spineOf(userId: string) {
  const spine = FACTS.roles.find((person) => person.userId === userId)?.spine;
  if (!spine) throw new Error(`No spine story for ${userId}`);
  return spine;
}

/** Every role in run order, with its run minute. */
export const NIGHT_ROLES: NightRole[] = FACTS.roles
  .map((person) => ({ userId: person.userId, role: person.role, ranAt: person.ranAt, minute: minuteOf(person.ranAt), checked: person.checked, spine: person.spine !== null }))
  .sort((a, b) => a.minute - b.minute);

/** First and last run minute of the night. */
export const NIGHT_SPAN = { first: minuteOf(FACTS.totals.firstRun), last: minuteOf(FACTS.totals.lastRun) };

/** Manager → report pairs, as indices into NIGHT_ROLES. */
export const ORG_LINKS: [number, number][] = FACTS.orgEdges.map(([manager, report]) => [
  NIGHT_ROLES.findIndex((person) => person.userId === manager),
  NIGHT_ROLES.findIndex((person) => person.userId === report),
]);

const salesDirector = spineOf(SALES_DIRECTOR);

/** The Sales Director's finding cut into the three slam beats. */
export const FINDING_BEATS = {
  first: verbatim(salesDirector.finding, "อีสานจะปิดเดือนต่ำกว่าเป้า"),
  second: verbatim(salesDirector.finding, "สองเอเย่นต์ใหญ่แทบหยุดสั่งเบียร์"),
  since: verbatim(salesDirector.finding, "ตั้งแต่ 11 ก.ย."),
  sinceDate: verbatim(salesDirector.finding, "11 ก.ย."),
  cause: verbatim(salesDirector.finding, "น่าจะติดวงเงิน"),
};

/** What the Sales Director's run ruled out. */
export const RULED_OUT: string[] = salesDirector.ruledOut;

/** The past lesson Winyu remembered, split at its clause break. */
export const LESSON_LINES: [string, string] = (() => {
  const [cause, ...rest] = FACTS.lesson.outcome.split(" ");
  return [cause, rest.join(" ")];
})();

/** The two agents' combined daily litres, and where the cliff day sits in the series. */
export const DAILY_ORDERS = (() => {
  const [first, second] = FACTS.dailyOrders;
  const litres = first.points.map((point, index) => point.litres + second.points[index].litres);
  const cliffIndex = first.points.findIndex((point) => point.date === CLIFF_DATE);
  return { litres, cliffIndex };
})();

function signed(text: string): string {
  return text.replace(/^-/, MINUS);
}

/** The Sales Director card's headline, read from the captured screen's text. */
export const STORY_HERO = (() => {
  const found = /^(.+?) ([+-]\d+(?:\.\d+)?%)/.exec(mark("story", "hero").text);
  if (!found) throw new Error("Unreadable story hero");
  return { value: found[1], delta: signed(found[2]) };
})();

/** The Sales Director card's title, read from the captured screen's text. */
export const STORY_CARD_TITLE = verbatim(mark("story", "cardTitle").text, "ยอดขายเข้าอีสานเทียบเป้า");

/** The two worst agents on the card, read from the captured screen's text. */
export const STORY_TOP_AGENTS: { name: string; delta: string }[] = [...mark("story", "topBars").text.matchAll(/(\S.*?) [\d,]+ ลิตร ([+-]\d+(?:\.\d+)?%)/g)].map((found) => ({
  name: found[1].trim(),
  delta: signed(found[2]),
}));

/** The four drawers shown at dawn, with each role's own next step. */
export const DAWN_DRAWERS: DawnDrawer[] = DAWN_TRIMS.map(({ shot, userId, lines }) => {
  const action = spineOf(userId).action;
  return { shot, userId, role: roleTitle(userId), actionLines: lines.map((pieces) => trimmed(action, pieces)) };
});

/** The spine roles in run order. */
export const SPINE_ROLES = NIGHT_ROLES.filter((person) => person.spine);

/** Totals shown on screen. */
export const NIGHT_TOTALS = FACTS.totals;

/** The past lesson's date. */
export const LESSON_DATE = FACTS.lesson.date;
