import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { similarity } from "@/lib/engine/memory-match";
import { localEmbedder } from "@/lib/server/recall/embedder";
import { REPLY_CHARS } from "@/lib/server/recall/mask";
import { MEMORY_HEADER } from "@/lib/server/agent/persona";

const USAGE = `usage: bun run memory:bench [--mastra-db=<path>] [--ledger=<path>]
  Measures the memory designs F6 compared, with no model call ($0):
  retrieval   which past conversation a "what did we discuss" question finds: trigram (today's fact matcher) vs the local embedder, over the 58 recorded eval conversations
  prompt      characters each design adds to a call: today's memory block, Mastra working memory, Mastra's per-turn recall block, the recall_memory result
  threads     how big real threads get (for observational memory's 30k-token threshold), from a Mastra store
  extraction  what today's post-turn fact extraction costs, from a model-call ledger`;

const RECORDINGS_DIR = path.join(process.cwd(), "evals", "recordings");
const TOP_K = 3;
const MASTRA_TOP_K = 4;
const MASTRA_RANGE = 1;
const OBSERVE_THRESHOLD_TOKENS = 30_000;
const OBSERVE_BUFFER_TOKENS = 6_000;
const CHARS_PER_TOKEN = 2.5;
const EXTRACTION_MAX_INPUT_TOKENS = 700;
const MEMORY_FACTS_SHOWN = 12;
const TURN_SIZE = 2;

type Message = { caseId: string; role: "user" | "assistant"; text: string };
type Query = [question: string, expected: string[]];

const EVERYDAY: Query[] = [
  ["ครั้งก่อนเราดูเรื่องเงินที่ลูกค้ายังไม่จ่ายแยกตามภูมิภาคไว้ ผลเป็นยังไง", ["cfo-ar"]],
  ["ที่คุยกันเรื่องคนลาออกในแต่ละแผนก", ["hr-attrition"]],
  ["เมื่อวานถามเรื่องคอร์สฝึกอบรมที่ควรเข้า ได้คำตอบว่าอะไร", ["courses-rep", "courses-month"]],
  ["เรื่องความปลอดภัยที่โรงงานขอนแก่นที่เคยคุย", ["sites-detail"]],
  ["ที่เคยถามว่าผู้ผลิตแต่ละเจ้าครองตลาดโคราชเท่าไหร่", ["shape-share-market"]],
  ["เรื่องวันหยุดพักผ่อนประจำปีต้องทำยังไงที่เคยถาม", ["policy-leave"]],
  ["ที่คุยกันว่าคลังสินค้าแห่งไหนของจะหมดก่อน", ["planner-cover"]],
  ["ตอนที่ถามเรื่องคาดการณ์ยอดอีกสองเดือนข้างหน้า", ["planner-forecast", "forecast-target"]],
  ["เรื่องผู้สมัครงานตำแหน่งเซลส์ที่ขอนแก่น", ["candidates-khonkaen"]],
  ["ที่ถามว่าใครใบเซอร์ใกล้หมดอายุ", ["people-certs"]],
  ["ที่เคยดูประวัติพนักงานทดลองงานที่ทำโอทีเยอะ", ["people-profile"]],
  ["เรื่องโปรโมชั่นไหนเวิร์คที่สุดที่คุยกันไว้", ["marketing-campaign"]],
  ["ที่เคยถามเรื่องกำไรแต่ระบบไม่ให้ดู", ["rep-denied"]],
  ["ที่คุยกันเรื่องตัวแทนจำหน่ายในอีสานที่ยอดหายไปเยอะ", ["line-drop-agents", "rsm-agents"]],
  ["เรื่องแจ้งเตือนของในคลังลำพูนที่ตั้งไว้", ["planner-watch"]],
  ["ที่ดูค่าจ้างเฉลี่ยของแต่ละแผนกแล้วโดนปิดบางช่อง", ["cfo-masked"]],
  ["ตอนที่ถามว่ามีเรื่องอะไรผิดปกติในบริษัท", ["ceo-alerts"]],
  ["ที่คุยเรื่องอุบัติเหตุในโรงงานต่างๆ", ["sites-overview"]],
  ["ที่เคยถามว่าข้อมูลแต่ละตัวอัปเดตถึงเมื่อไหร่", ["freshness"]],
  ["ที่สั่งให้ซ่อนมูลค่าขายเข้าจากเซลส์", ["admin-metric"]],
  ["เรื่องเทียบงบประมาณกับของจริง", ["finance-budget"]],
  ["ตอนที่ดูยอดขายต่อช่องทางการขาย เช่น โมเดิร์นเทรด", ["ceo-channel"]],
  ["ที่คุยกันเรื่องหนี้ค้างของเอเย่นต์ที่เพิ่มขึ้น", ["title-ar-rising"]],
  ["ที่ถามเรื่องร้านอุบลศรีสุขก่อนไปเยี่ยม", ["landing-visit"]],
  ["ที่เคยถามว่าเอเย่นต์ที่ขายเยอะติดหนี้เยอะด้วยหรือเปล่า", ["shape-scatter"]],
  ["เรื่องจำนวนคนในแต่ละฝ่ายเทียบกับปีก่อน", ["hr-headcount"]],
];

const REWORDED: Query[] = [
  ["ที่เคยคุยเรื่องคนในฝ่ายผลิตทยอยออกจากงาน", ["hr-attrition"]],
  ["ที่เราดูว่าโคราชใครกินแชร์เบียร์มากสุด", ["shape-share-market"]],
  ["เรื่องขอหยุดยาวไปเที่ยวต้องทำไง", ["policy-leave"]],
  ["ที่ถามว่าคลังไหนน้ำจะไม่พอส่ง", ["planner-cover"]],
  ["เรื่อง incident ในไซต์ผลิต", ["sites-overview", "sites-detail"]],
  ["ที่เคยปรับสิทธิ์ให้ผู้จัดการเห็นคะแนนสอบ", ["admin-field"]],
  ["ที่คุยเรื่องลูกค้าค้างจ่ายปีที่แล้วเทียบกับปีนี้ทางใต้", ["compare-ar-last-year"]],
  ["ที่ดูว่าโรงเบียร์ผลิตไปเท่าไหร่เดือนสิงหา", ["shape-funnel"]],
  ["เรื่องที่ร้านค้าส่งเกาะสมุยกับภูเก็ตขายได้น้อยลง", ["title-named-decline"]],
  ["ที่ถามเรื่องคนที่น่าจ้างสำหรับตำแหน่งในทีมผม", ["candidates-manager"]],
  ["ที่ตั้งให้แจ้งถ้ายอดร้านรุ่งเรืองแกว่งแรง", ["rsm-watch-agent"]],
  ["ที่ดูพยากรณ์ว่าจะทำได้ตามเป้าหรือไม่", ["forecast-target"]],
];

const UNRELATED = ["วันนี้อากาศเป็นยังไง", "ขอสูตรต้มยำกุ้งหน่อย", "สวัสดีครับ", "ช่วยแต่งกลอนวันเกิดให้หน่อย", "ฟุตบอลคืนนี้ใครเตะ", "ราคาทองวันนี้เท่าไหร่", "แนะนำร้านกาแฟแถวสีลม", "ขอบคุณมากครับ"];

const SAMPLE_FACTS = [
  "[responsibility] ดูแลภาคอีสานเป็นหลัก",
  "[interest] สนใจมูลค่าขายเข้าแยกตามภาค",
  "[vocabulary] เรียกปริมาณขายเข้าว่า \"ยอด\"",
  "[preference] ชอบเทียบกับเป้าหมายรายเดือน",
  "[interest] สนใจลูกหนี้ค้างชำระเกินกำหนดของเอเย่นต์",
  "[seasonal] ช่วงสงกรานต์ดูสต๊อกน้ำดื่มเป็นพิเศษ",
  "[interest] สนใจส่วนแบ่งตลาดเบียร์รายจังหวัด",
  "[responsibility] ติดตามเอเย่นต์ ส.รุ่งเรือง เทรดดิ้ง",
  "[preference] ชอบดูอันดับเอเย่นต์ที่ยอดตก",
  "[interest] สนใจวันครอบคลุมสต๊อกของศูนย์กระจายสินค้า",
  "[vocabulary] เรียกศูนย์กระจายสินค้าว่า \"ดีซี\"",
  "[interest] สนใจแนวโน้มยอดขายรายเดือน",
];

function flag(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function readConversations(): Message[] {
  return readdirSync(RECORDINGS_DIR)
    .sort()
    .flatMap((file) => {
      const recording = JSON.parse(readFileSync(path.join(RECORDINGS_DIR, file), "utf8")) as { caseId: string; prompt: string; steps: { kind: string; text?: string }[] };
      const reply = recording.steps.flatMap((step) => (step.kind === "text" && step.text ? [step.text] : [])).join("\n");
      const question: Message = { caseId: recording.caseId, role: "user", text: recording.prompt };
      return reply.trim() ? [question, { caseId: recording.caseId, role: "assistant", text: reply }] : [question];
    });
}

function tokens(chars: number): number {
  return Math.round(chars / CHARS_PER_TOKEN);
}

function percentile(values: number[], share: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
}

type Ranker = { name: string; scores: (question: string) => Promise<number[]> };

function topConversations(messages: Message[], scores: number[], k: number): string[] {
  const best = new Map<string, number>();
  scores.forEach((score, index) => {
    const id = messages[index]?.caseId ?? "";
    best.set(id, Math.max(best.get(id) ?? -Infinity, score));
  });
  return [...best.entries()].sort((left, right) => right[1] - left[1]).slice(0, k).map(([id]) => id);
}

async function scoreSet(messages: Message[], ranker: Ranker, label: string, queries: Query[]): Promise<void> {
  let first = 0;
  let inTop = 0;
  const millis: number[] = [];
  for (const [question, expected] of queries) {
    const started = performance.now();
    const top = topConversations(messages, await ranker.scores(question), TOP_K);
    millis.push(performance.now() - started);
    if (expected.includes(top[0] ?? "")) first += 1;
    if (top.some((id) => expected.includes(id))) inTop += 1;
  }
  console.log(`  ${ranker.name.padEnd(28)} ${label.padEnd(9)} recall@1 ${first}/${queries.length}  recall@${TOP_K} ${inTop}/${queries.length}  query p50 ${percentile(millis, 0.5).toFixed(1)} ms`);
}

async function retrieval(messages: Message[]): Promise<Map<string, number[]>> {
  console.log(`\nretrieval: ${messages.length} messages from ${new Set(messages.map((message) => message.caseId)).size} recorded conversations, ${EVERYDAY.length} everyday and ${REWORDED.length} reworded questions`);
  const trigram: Ranker = { name: "trigram (memory-match)", scores: async (question) => messages.map((message) => similarity(question, message.text)) };
  const embedder = localEmbedder();
  const loadStarted = performance.now();
  await embedder.query("warm up");
  const loaded = performance.now() - loadStarted;
  const passages: number[][] = [];
  const perTurn: number[] = [];
  for (let start = 0; start < messages.length; start += TURN_SIZE) {
    const started = performance.now();
    passages.push(...(await embedder.passages(messages.slice(start, start + TURN_SIZE).map((message) => message.text))));
    perTurn.push(performance.now() - started);
  }
  console.log(`  ${embedder.id}: model load ${Math.round(loaded)} ms, indexing a turn (question and reply) p50 ${Math.round(percentile(perTurn, 0.5))} ms, ${embedder.dimension} dims`);
  const dot = (left: number[], right: number[]) => left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  const semantic: Ranker = { name: embedder.id, scores: async (question) => {
    const vector = await embedder.query(question);
    return passages.map((passage) => dot(vector, passage));
  } };
  for (const ranker of [trigram, semantic]) {
    await scoreSet(messages, ranker, "everyday", EVERYDAY);
    await scoreSet(messages, ranker, "reworded", REWORDED);
  }
  const topScores = async (questions: string[]) => Promise.all(questions.map(async (question) => Math.max(...(await semantic.scores(question)))));
  const related = await topScores([...EVERYDAY, ...REWORDED].map(([question]) => question));
  const unrelated = await topScores(UNRELATED);
  console.log(`  best score, related questions ${percentile(related, 0).toFixed(3)} to ${percentile(related, 1).toFixed(3)}; unrelated ${percentile(unrelated, 0).toFixed(3)} to ${percentile(unrelated, 1).toFixed(3)}`);
  const all = new Map<string, number[]>();
  for (const [question] of [...EVERYDAY, ...REWORDED]) all.set(question, await semantic.scores(question));
  return all;
}

function mastraRecallBlock(messages: Message[], scores: number[]): number {
  const ranked = scores.map((score, index) => ({ score, index })).sort((left, right) => right.score - left.score).slice(0, MASTRA_TOP_K);
  const included = new Set<number>();
  for (const { index } of ranked) {
    for (let near = index - MASTRA_RANGE; near <= index + MASTRA_RANGE; near += 1) {
      if (messages[near]?.caseId === messages[index]?.caseId) included.add(near);
    }
  }
  return [...included].reduce((sum, index) => sum + (messages[index]?.text.length ?? 0) + 40, 0);
}

function recallToolResult(messages: Message[], scores: number[]): number {
  const threads = topConversations(messages, scores, TOP_K);
  return threads.reduce((sum, caseId) => {
    const question = messages.find((message) => message.caseId === caseId && message.role === "user")?.text ?? "";
    const reply = messages.find((message) => message.caseId === caseId && message.role === "assistant")?.text ?? "";
    return sum + question.length + Math.min(reply.length, REPLY_CHARS) + 120;
  }, 0);
}

function prompt(messages: Message[], recalled: Map<string, number[]>): void {
  const memoryBlock = [MEMORY_HEADER, SAMPLE_FACTS.slice(0, MEMORY_FACTS_SHOWN).map((fact) => `- ${fact}`).join("\n")].join("\n\n").length + 60;
  const mastraBlocks = [...recalled.values()].map((scores) => mastraRecallBlock(messages, scores));
  const toolResults = [...recalled.values()].map((scores) => recallToolResult(messages, scores));
  console.log(`\nprompt (characters, tokens at ${CHARS_PER_TOKEN} chars per Gemini token):`);
  console.log(`  today's memory block, ${MEMORY_FACTS_SHOWN} facts: ${memoryBlock} chars ≈ ${tokens(memoryBlock)} tokens on every call`);
  console.log(`  Mastra semantic recall per-turn block (topK ${MASTRA_TOP_K}, range ${MASTRA_RANGE}): p50 ${percentile(mastraBlocks, 0.5)} chars ≈ ${tokens(percentile(mastraBlocks, 0.5))} tokens, max ${percentile(mastraBlocks, 1)} chars, on every call of every turn`);
  console.log(`  recall_memory conversations (${TOP_K} threads, reply cut to ${REPLY_CHARS}): p50 ${percentile(toolResults, 0.5)} chars ≈ ${tokens(percentile(toolResults, 0.5))} tokens, only on turns that call it`);
}

type StoredRow = { thread_id: string; role: string; content: string };

function threads(file: string): void {
  if (!existsSync(file)) return console.log(`\nthreads: no Mastra store at ${file}`);
  const rows = new Database(file, { readonly: true }).query("select thread_id, role, content from mastra_messages").all() as StoredRow[];
  const byThread = new Map<string, { turns: number; chars: number }>();
  for (const row of rows) {
    const thread = byThread.get(row.thread_id) ?? { turns: 0, chars: 0 };
    byThread.set(row.thread_id, { turns: thread.turns + (row.role === "user" ? 1 : 0), chars: thread.chars + row.content.length });
  }
  const sizes = [...byThread.values()].filter((thread) => thread.turns > 0);
  const perTurn = sizes.map((thread) => tokens(thread.chars) / thread.turns);
  const observerCalls = percentile(perTurn, 0.5) / OBSERVE_BUFFER_TOKENS;
  console.log(`\nthreads (${file}): ${sizes.length} threads, median ${percentile(sizes.map((thread) => thread.turns), 0.5)} turns, median ${Math.round(percentile(perTurn, 0.5))} stored tokens per turn (tool results included)`);
  console.log(`  over the ${OBSERVE_THRESHOLD_TOKENS} token observation threshold: ${sizes.filter((thread) => tokens(thread.chars) > OBSERVE_THRESHOLD_TOKENS).length}; past the first ${OBSERVE_BUFFER_TOKENS} token buffer: ${sizes.filter((thread) => tokens(thread.chars) > OBSERVE_BUFFER_TOKENS).length}`);
  console.log(`  observational memory would buffer ≈ ${observerCalls.toFixed(1)} Observer calls per turn once a thread passes ${OBSERVE_BUFFER_TOKENS} tokens`);
}

type LedgerCall = { source: string; turnId: string | null; inputTokens: number; outputTokens: number; billedUsd: number | null };

function extraction(file: string): void {
  if (!existsSync(file)) return console.log(`\nextraction: no ledger at ${file}`);
  const calls = JSON.parse(readFileSync(file, "utf8")) as LedgerCall[];
  const extractions = calls.filter((call) => call.source === "background" && call.turnId === null && call.inputTokens <= EXTRACTION_MAX_INPUT_TOKENS);
  const chatTurns = new Map<string, number>();
  for (const call of calls.filter((entry) => entry.source === "chat" && entry.turnId)) chatTurns.set(call.turnId ?? "", (chatTurns.get(call.turnId ?? "") ?? 0) + (call.billedUsd ?? 0));
  console.log(`\nextraction (${file}): ${extractions.length} post-turn extraction calls, median input ${percentile(extractions.map((call) => call.inputTokens), 0.5)} tokens, median $${percentile(extractions.map((call) => call.billedUsd ?? 0), 0.5).toFixed(5)}; median chat turn $${percentile([...chatTurns.values()], 0.5).toFixed(4)} over ${chatTurns.size} turns`);
}

if (process.argv.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}
const messages = readConversations();
const recalled = await retrieval(messages);
prompt(messages, recalled);
threads(flag("mastra-db") ?? path.join(process.cwd(), ".data", "mastra.db"));
extraction(flag("ledger") ?? path.join(process.cwd(), ".data", "model-calls.json"));
process.exit(0);
