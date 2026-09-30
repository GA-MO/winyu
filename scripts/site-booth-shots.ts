import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { sleep, withHeadlessPage, type HeadlessPage } from "./booth/chrome";

const APP_URL = "http://localhost:3100";
const DATA_DIR = path.join(process.cwd(), ".data");
const IMAGE_DIR = path.join(process.cwd(), "site", "public", "booth");
const MANIFEST = path.join(process.cwd(), "site", "app", "data", "booth-shots.json");
const VIEWPORT = { width: 1920, height: 1080, scale: 2 };
const WEBP_QUALITY = 90;
const SETTLE_MS = 2200;
const STEP_MS = 1400;
const REP_CHAT = "fbe24903-33c2-4dee-9c70-a81dede5b28c";
const CEO_CHAT = "f2a50a62-b988-48c6-8621-38f4b55f8026";
const FORECAST_CHAT = "2708e8f9-89b0-46e7-bb4e-a1b8801e08ce";
const SPINE_DRAWERS = [
  ["story-ceo", "u_thana"],
  ["story-cfo", "u_siriporn"],
  ["story-rsm", "u_anucha"],
  ["story-rep", "u_krit"],
] as const;

const HELPERS = `window.__shot = {
  byText: (selector, prefix) => [...document.querySelectorAll(selector)].find((node) => node.textContent.trim().startsWith(prefix)) ?? null,
  exact: (selector, text) => [...document.querySelectorAll(selector)].find((node) => node.textContent.trim() === text) ?? null,
  tallest: (selector) => [...document.querySelectorAll(selector)].sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] ?? null,
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  cardAround: (prefix, minHeight = 260) => {
    let node = [...document.querySelectorAll("main *")].find((candidate) => candidate.children.length === 0 && candidate.textContent.trim().startsWith(prefix)) ?? null;
    while (node && node.getBoundingClientRect().height < minHeight) node = node.parentElement;
    return node;
  },
  spine: () => [...document.querySelectorAll("aside article")].find((node) => /วงเงิน|อุบลศรีสุข|อีสานรุ่งโรจน์/.test(node.textContent) && /อีสาน/.test(node.textContent)) ?? null,
};`;
const CLEAN_CHROME = `(() => {
  const style = document.createElement("style");
  style.textContent = "nextjs-portal{display:none!important}*{caret-color:transparent!important}";
  document.head.append(style);
  for (const overlay of document.querySelectorAll("body > *")) if (overlay.shadowRoot) overlay.style.display = "none";
  document.activeElement?.blur?.();
})()`;
const MORNING_GREETING = `document.querySelector("main h1").replaceChildren(${JSON.stringify(TH.landing.greeting.morning)})`;
const OPEN_STORIES = `(async () => { __shot.byText("main button", "Winyu สืบให้แล้ว").click(); await __shot.wait(${STEP_MS}); })()`;
const SHOW_SUGGESTED = `(async () => { __shot.exact("main *", "การ์ดอื่นสำหรับบทบาทคุณ").scrollIntoView({ block: "start" }); window.scrollBy(0, -40); await __shot.wait(600); })()`;
const FIRST_EXCHANGE_ONLY = `(async () => {
  [...document.querySelectorAll(".is-user, .is-assistant")].slice(2).forEach((message) => { message.style.display = "none"; });
  document.querySelector(".is-user").scrollIntoView({ block: "start" });
  await __shot.wait(600);
})()`;
const HIDE_FIRST_ANSWER = `(() => {
  document.querySelector(".is-assistant").style.visibility = "hidden";
  document.querySelector("main .border-t .flex-wrap").style.visibility = "hidden";
})()`;
const FORECAST_CARD_TOP = `(async () => {
  [...document.querySelectorAll(".is-user, .is-assistant")].slice(2).forEach((message) => { message.style.display = "none"; });
  document.querySelector(".is-assistant [class*='@container/vexa']").scrollIntoView({ block: "start" });
  await __shot.wait(600);
})()`;
const ONLY_FIRST_STORY = `(() => { [...document.querySelectorAll("aside article")].slice(1).forEach((other) => { other.style.display = "none"; }); })()`;
const ENTITY_DIR = path.join(process.cwd(), "lib", "data", "entities");
const PERSON_NAMES = [...new Set(readdirSync(ENTITY_DIR).flatMap((file) => [...readFileSync(path.join(ENTITY_DIR, file), "utf8").matchAll(/nameTh: "(คุณ[^ "]+)/g)].map((match) => match[1])))];
const VISIBLE_PERSON_NAMES = `${JSON.stringify(PERSON_NAMES)}.filter((name) => document.body.innerText.includes(name))`;
const OPEN_SPINE_STORY = `(async () => {
  const target = __shot.spine();
  for (const button of document.querySelectorAll("aside article > button[aria-expanded='true']")) if (button.closest("article") !== target) button.click();
  for (const other of document.querySelectorAll("aside article")) if (other !== target) other.style.display = "none";
  const toggle = target.querySelector(":scope > button");
  if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
  await __shot.wait(${STEP_MS});
  target.scrollIntoView({ block: "start" });
  await __shot.wait(400);
})()`;
const HIDE_ANSWER = `(() => {
  document.querySelector(".is-assistant").style.visibility = "hidden";
  document.querySelector("main .border-t .flex-wrap").style.visibility = "hidden";
})()`;
const CONFIRM_FIRST_FACT = `(async () => { __shot.byText("main button", "ใช่ จำไว้").click(); await __shot.wait(${STEP_MS}); })()`;

function storyMarks(story: string): Record<string, string> {
  const card = `${story}.querySelector(':scope > div > :nth-child(2)')`;
  return {
    drawer: "document.querySelector('aside[aria-label]')",
    header: "document.querySelector('aside header')",
    story,
    finding: `${story}.querySelector('button span[class*="text-[15px]"]')`,
    badge: `${story}.querySelector('button span[class*="rounded-full"]')`,
    ruledOut: `${story}.querySelector(':scope > div > p')`,
    card,
    cardTitle: `${card}.querySelector('header')`,
    hero: `${card}.querySelector('[class*="items-baseline"][class*="flex-wrap"]')`,
    bars: `${card}.querySelector('ol')`,
    topBars: `[...${card}.querySelectorAll('ol > li')].slice(0, 2)`,
    next: `${story}.querySelector(':scope > div > :last-child')`,
  };
}

const OPTIONAL_MARKS = new Set(["ruledOut", "hero", "bars", "topBars", "cardTitle", "card", "chart", "followUps"]);
const CHAT_CARD = "document.querySelector('.is-assistant [class*=\"@container/vexa\"]')";
const LANDING_MARKS = {
  heading: "document.querySelector('main h1')",
  pill: "__shot.byText('main button', 'Winyu สืบให้แล้ว')",
  composer: "document.querySelector('main .winyu-focus-ring')",
  chips: "__shot.byText('main button', 'ปริมาณ').parentElement",
  kpis: "__shot.tallest('main a[href=\"/dashboard\"]')",
};

type Shot = { id: string; userId: string; path: string; prepare: string[]; marks: Record<string, string> };
type Rect = { x: number; y: number; w: number; h: number; text: string };

const SHOTS: Shot[] = [
  { id: "landing", userId: "u_prasit", path: "/", prepare: [MORNING_GREETING], marks: LANDING_MARKS },
  { id: "story", userId: "u_prasit", path: "/", prepare: [MORNING_GREETING, OPEN_STORIES, ONLY_FIRST_STORY], marks: storyMarks("document.querySelector('aside article')") },
  ...SPINE_DRAWERS.map(([id, userId]) => ({ id, userId, path: "/", prepare: [MORNING_GREETING, OPEN_STORIES, OPEN_SPINE_STORY], marks: storyMarks("__shot.spine()") })),
  { id: "landing-rep", userId: "u_krit", path: "/", prepare: [MORNING_GREETING], marks: LANDING_MARKS },
  {
    id: "chat-ceo-ask",
    userId: "u_thana",
    path: `/c/${CEO_CHAT}`,
    prepare: [FIRST_EXCHANGE_ONLY, HIDE_FIRST_ANSWER],
    marks: { question: "document.querySelector('.is-user > div')", composer: "document.querySelector('main .winyu-focus-ring')" },
  },
  {
    id: "chat-ceo",
    userId: "u_thana",
    path: `/c/${CEO_CHAT}`,
    prepare: [FIRST_EXCHANGE_ONLY],
    marks: {
      question: "document.querySelector('.is-user > div')",
      answer: "document.querySelector('.is-assistant')",
      card: CHAT_CARD,
      cardTitle: `${CHAT_CARD}.querySelector('header')`,
      hero: `${CHAT_CARD}.querySelector('[class*="items-baseline"][class*="flex-wrap"]')`,
      bars: `${CHAT_CARD}.querySelector('ol')`,
      followUps: "document.querySelector('main .border-t .flex-wrap')",
    },
  },
  {
    id: "chat-forecast",
    userId: "u_prasit",
    path: `/c/${FORECAST_CHAT}`,
    prepare: [FORECAST_CARD_TOP],
    marks: {
      card: CHAT_CARD,
      cardTitle: `${CHAT_CARD}.querySelector('header')`,
      hero: `${CHAT_CARD}.querySelector('[class*="items-baseline"][class*="flex-wrap"]')`,
      chart: `${CHAT_CARD}.querySelector('svg')?.closest('div')`,
    },
  },
  {
    id: "dashboard-suggest",
    userId: "u_anucha",
    path: "/dashboard",
    prepare: [SHOW_SUGGESTED],
    marks: {
      section: "__shot.exact('main *', 'การ์ดอื่นสำหรับบทบาทคุณ')",
      badge: "__shot.exact('main *', 'Winyu แนะนำ')",
      card: "__shot.cardAround('หนี้ค้างชำระตัวแทนอีสาน')",
      title: "__shot.exact('main *', 'หนี้ค้างชำระตัวแทนอีสาน')",
      reason: "[...document.querySelectorAll('main *')].find((node) => node.children.length === 0 && node.textContent.trim().startsWith('คุณถามคำถามนี้'))",
      keep: "__shot.exact('main button', 'ปักไว้')",
      anomalies: "__shot.cardAround('ความผิดปกติในภาคของคุณ')",
      topAnomaly: "(() => { const card = __shot.cardAround('ความผิดปกติในภาคของคุณ'); let node = [...card.querySelectorAll('*')].find((candidate) => candidate.children.length === 0 && candidate.textContent.trim() === 'อุบลศรีสุข เทรดดิ้ง'); while (node && node.getBoundingClientRect().height < 60) node = node.parentElement; return node; })()",
    },
  },
  {
    id: "chat-ask",
    userId: "u_krit",
    path: `/c/${REP_CHAT}`,
    prepare: [HIDE_ANSWER],
    marks: { question: "document.querySelector('.is-user > div')", composer: "document.querySelector('main .winyu-focus-ring')" },
  },
  {
    id: "chat",
    userId: "u_krit",
    path: `/c/${REP_CHAT}`,
    prepare: [],
    marks: {
      question: "document.querySelector('.is-user > div')",
      answer: "document.querySelector('.is-assistant')",
      card: CHAT_CARD,
      cardTitle: `${CHAT_CARD}.querySelector('header')`,
      hero: `${CHAT_CARD}.querySelector('[class*="items-baseline"][class*="flex-wrap"]')`,
      next: `__shot.exact('.is-assistant *', 'ทำอะไรต่อ').parentElement`,
      followUps: "document.querySelector('main .border-t .flex-wrap')",
    },
  },
  {
    id: "dashboard",
    userId: "u_anucha",
    path: "/dashboard",
    prepare: [],
    marks: {
      title: "document.querySelector('main h1')",
      firstCard: "__shot.byText('main article, main section, main li', '10 SKU')",
      scope: "__shot.byText('main p', '26 ส.ค.')",
    },
  },
  {
    id: "memory",
    userId: "u_anucha",
    path: "/memory",
    prepare: [],
    marks: {
      title: "document.querySelector('main h1')",
      learning: "__shot.byText('main h2, main h3, main p', 'Winyu กำลังเรียนรู้')",
      firstFact: "__shot.byText('main button', 'ใช่ จำไว้').closest('li, article, section > div')",
      yes: "__shot.byText('main button', 'ใช่ จำไว้')",
    },
  },
  {
    id: "memory-yes",
    userId: "u_anucha",
    path: "/memory",
    prepare: [CONFIRM_FIRST_FACT],
    marks: {
      title: "document.querySelector('main h1')",
      learning: "__shot.byText('main h2, main h3, main p', 'Winyu กำลังเรียนรู้')",
      known: "__shot.byText('main h2, main h3, main p', 'รู้แล้ว')",
      confirmed: "__shot.byText('main span, main p', 'คุณยืนยันแล้ว').closest('li, article, section > div')",
    },
  },
];

function rectsExpression(marks: Record<string, string>): string {
  const entries = Object.entries(marks).map(([name, expression]) => `[${JSON.stringify(name)}, (() => { try { return ${expression}; } catch { return null; } })()]`);
  return `(() => {
    const rectOf = (found) => {
      const nodes = (Array.isArray(found) ? found : [found]).filter(Boolean);
      if (nodes.length === 0) return null;
      const boxes = nodes.map((node) => node.getBoundingClientRect());
      const x = Math.min(...boxes.map((box) => box.left));
      const y = Math.min(...boxes.map((box) => box.top));
      const right = Math.max(...boxes.map((box) => box.right));
      const bottom = Math.max(...boxes.map((box) => box.bottom));
      const text = nodes.map((node) => node.innerText ?? "").join(" ").replace(/\\s+/g, " ").trim().slice(0, 600);
      return { x: Math.round(x), y: Math.round(y), w: Math.round(right - x), h: Math.round(bottom - y), text };
    };
    return Object.fromEntries([${entries.join(", ")}].map(([name, found]) => [name, rectOf(found)]));
  })()`;
}

async function signIn(page: HeadlessPage, userId: string) {
  await page.navigate(`${APP_URL}/login`);
  await page.evaluate(`fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: ${JSON.stringify(userId)} }) }).then((response) => response.ok)`);
}

async function capture(page: HeadlessPage, shot: Shot) {
  await signIn(page, shot.userId);
  await page.navigate(`${APP_URL}${shot.path}`);
  await page.evaluate("document.fonts.ready.then(() => true)");
  await sleep(SETTLE_MS);
  await page.evaluate(HELPERS);
  await page.evaluate(CLEAN_CHROME);
  for (const step of shot.prepare) await page.evaluate(step);
  await sleep(300);
  const names = (await page.evaluate(VISIBLE_PERSON_NAMES)) as string[];
  if (names.length > 0) throw new Error(`${shot.id}: person names on screen: ${names.join(", ")}`);
  const rects = (await page.evaluate(rectsExpression(shot.marks))) as Record<string, Rect | null>;
  const missing = Object.entries(rects).filter(([, rect]) => rect === null).map(([name]) => name);
  const required = missing.filter((name) => !OPTIONAL_MARKS.has(name));
  if (required.length > 0) throw new Error(`${shot.id}: marks not found: ${required.join(", ")}`);
  for (const name of missing) delete rects[name];
  const { data } = (await page.send("Page.captureScreenshot", { format: "webp", quality: WEBP_QUALITY })) as { data: string };
  writeFileSync(path.join(IMAGE_DIR, `${shot.id}.webp`), Buffer.from(data, "base64"));
  const role = findUser(shot.userId)?.title ?? shot.userId;
  console.log(`${shot.id} · ${role} · ${Object.keys(rects).length} marks${missing.length > 0 ? ` (no ${missing.join(", ")})` : ""}`);
  return { src: `/booth/${shot.id}.webp`, role, marks: rects as Record<string, Rect> };
}

async function main() {
  const backup = mkdtempSync(path.join(tmpdir(), "winyu-data-"));
  cpSync(DATA_DIR, backup, { recursive: true });
  mkdirSync(IMAGE_DIR, { recursive: true });
  try {
    const shots = await withHeadlessPage(VIEWPORT, async (page) => {
      const captured: Record<string, Awaited<ReturnType<typeof capture>>> = {};
      for (const shot of SHOTS) captured[shot.id] = await capture(page, shot);
      return captured;
    });
    writeFileSync(MANIFEST, `${JSON.stringify({ width: VIEWPORT.width, height: VIEWPORT.height, shots }, null, 2)}\n`);
    console.log(`Wrote ${Object.keys(shots).length} shots to ${IMAGE_DIR} and ${MANIFEST}`);
  } finally {
    rmSync(DATA_DIR, { recursive: true, force: true });
    cpSync(backup, DATA_DIR, { recursive: true });
    rmSync(backup, { recursive: true, force: true });
  }
}

await main();
