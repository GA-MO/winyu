# mascop and Winyu compared

mascop is Winyu rebuilt on Mastra (the agent loop) and CopilotKit (the chat client over AG-UI). Winyu runs on Vexa (generative UI with json-render specs) and its own harness. Both stacks serve the same 26 personas, data, tools and model (`google/gemini-3.8-flash` through OpenRouter). This page records what each framework gave, what mascop still had to build, and what the parity walk (phase M5, 2026-10-05) measured.

## What the frameworks gave

Mastra (`@mastra/core` 1.74, `@mastra/memory` 1.35, `@mastra/libsql` 1.25):

- The tool loop with a step limit and a per-step hook, used for the wrap-up on the last step.
- Instructions and tools as functions of a request context, so one agent serves every role.
- Tool approval that suspends a run and resumes it with an answer.
- Message storage in LibSQL, read back by thread and resource.

CopilotKit (`@copilotkit/runtime` and `@copilotkit/react-core` 1.77, `/v2`) with `@ag-ui/mastra` 1.1.6:

- A runtime handler that serves the agent over AG-UI at `/api/copilotkit`.
- A headless `useAgent` hook with streamed messages, running state, stop, and interrupts for approvals.
- The bridge from Mastra's stream to AG-UI events, including approval interrupts.

## What mascop built or kept from Winyu

The frameworks do not cover the product rules, so these came across from Winyu or were written for mascop:

- The harness gateway: role policy, CEL deny rules, kill switches, tool budget, post-condition verify, redaction and audit. Mastra tools wrap the engine-neutral `WinyuTool.execute`, so the gateway stays the one choke point.
- The approval ledger. An approval ends one run and starts another. The ledger spends each interrupt id once for the person asked, so a replayed or forged answer gets a 409.
- The thread rail and thread metadata (title, dates, rename, delete, search). CopilotKit's thread drawer needs the paid Intelligence tier.
- Card renderers keyed by tool name (`TOOL_CARDS`) and approval cards for every write tool.
- History restore. `lib/harness/adapters/mastra/history.ts` turns Mastra's stored messages into AG-UI messages and brings back open and declined approvals after a reload.
- The transcript fold (`components/chat/timeline.ts`) that groups AG-UI messages into exchanges with cards, decisions and receipts.
- Turn learning. `finishTurn` logs the question with the slice it queried and runs memory extraction, which feeds the learned quick actions.
- A transcript port on the turn context, so a handoff packet carries the sender's conversation from Mastra memory.
- The usage meter and model ledger, kept as AI SDK middleware on the model instance.

## Better than Winyu

- Smaller prompts. A chat model call in mascop averaged 10,454 input tokens, against 18,972 in Winyu's ledger. The card block rule with its one example costs less than the `compose_card` tool it replaced: the CEO team question's first call took 9,772 input tokens with `compose_card` and 9,552 with the block rule (measured in the benchmark below). mascop sends a short component list instead of Winyu's full catalog and spec rules.
- Cheaper questions. In the M5 walk, 15 questions (7 of them with an approval and a resume run) cost 36 chat calls and $0.1828: 2.4 calls and $0.0122 per question. Winyu's ledger holds 413 chat runs at 2.40 calls and $0.0268 per run (measured over 2026-09-25 to 2026-10-04). The question mix differs and Winyu's runs are not the same questions, so treat the ratio as indicative.
- A metric card cannot be drawn wrong by the model, because the model never writes its markup. Winyu needed `normalize.ts` and an eval to keep specs honest.
- The wire format is AG-UI, a public protocol, instead of Vexa's own message parts.
- The model composes people and entity answers inside its reply, as Winyu does, and the server checks every line before the browser sees it (A2UI v0.9 drawn by CopilotKit's A2UI renderer with mascop's components; see `docs/a2ui.md`). Text binds to `{ path }` in the run's read results. The server drops a line with a literal that carries any digit (a number shows only through `{ path }`), a name or picture no tool returned, a path that does not resolve, or a metric result, and keeps the rest of the card. The client receives only the paths the card shows. Winyu's composed specs carried literal values that `normalize.ts` and the card eval checked after the fact. The CEO's team question gives one card with the lead and his 5 reports (`.shots/hybrid-ceo-team-top.png`), and the same card after a reload (`.shots/hybrid-ceo-team-reload-top.png`).
- A handoff reply in the sender's thread reads as the colleague's note, and the model gets the colleague's words fenced as data. Winyu stored the reply as assistant text, so its model could take the colleague's words for its own.

## Worse than Winyu

- A composed card still waits on the model step that writes the answer. Most of the wait is reasoning before the first block line (median 12.6 s from the last tool result to the finished card in the benchmark below). The block itself streams in about a second.
- An approval splits one question into two runs, two model round trips and two traces that share a goal id.
- Two stores hold a conversation: Mastra memory has the messages, `.data/threads.json` has the metadata.
- Far more dependencies. mascop resolves 1,479 packages (1.4 GB `node_modules`). Winyu resolves 156 of its own on top of Vexa's 1,285.
- Version coupling. `@openrouter/ai-sdk-provider` 3.x needs `ai@7`, which conflicts with CopilotKit's `ai@6`, so mascop stays on provider 2.x.
- CopilotKit's client bundle loads Lit, which logs a dev-mode warning on chat pages under `next dev`. Production builds load the production Lit.

## Composed cards benchmark

The harness asks 5 people and HR questions (CEO team, HR candidates and courses, supply site, CEO licences, RSM team training) 2 times each, against `google/gemini-3.8-flash`, and scores each card against facts derived from the tool functions. The `baseline` tag ran Winyu (JSONL spec in the reply) and mascop with the `compose_card` tool on 2026-10-05. The `hybrid` tag ran mascop with the streamed, line-checked block the same day, when the prompt asked for a composed card only for answers that combine several reads. The `compose-all` tag ran the same block with the prompt asking for a composed card on every people, place and entity answer, even from one read. The `guard` tag ran compose all with two fixes: a literal with a digit is refused even when a tool returned the number, and `list_courses` matches the team a course is for. Each cell is the median of 10 runs, with the range.

| Metric | Winyu | mascop, `compose_card` | mascop, streamed block | mascop, compose all | mascop, guard |
|---|---|---|---|---|---|
| First card | 21.0 s (13.6–44.5) | 16.5 s (5.7–28.7) | 12.1 s (7.8–19.6) | 15.8 s (4.4–26.3) | 13.5 s (4.5–26.7) |
| Composed card shows | 23.5 s (15.8–44.5) | 16.8 s (13.3–28.7) | 15.1 s (11.7–19.6) | 16.3 s (8.9–26.3) | 16.0 s (10.6–26.7) |
| Reply ends | 24.6 s (13.7–47.7) | 19.8 s (11.8–31.4) | 14.6 s (7.8–20.2) | 16.9 s (9.2–26.6) | 16.5 s (10.8–28.0) |
| Model calls | 2 (2–3) | 3 (2–4) | 2 (2–3) | 2 (2–3) | 2 (2–3) |
| Input tokens per question | 44,654 | 38,370 | 22,575 | 22,205 | 22,548 |
| Reasoning tokens per question | 5,409 | 3,605 | 2,865 | 3,801 | 3,227 |
| Cost per question | $0.0183 | $0.0222 | $0.0146 | $0.0162 | $0.0156 |
| Composed, all cases | 8/10 | 5/10 | 6/10 | 8/10 | 8/10 |
| Composed, people cases | 8/8 | 5/8 | 6/8 | 8/8 | 8/8 |
| Whole cards refused | 0 | 2 | 0 | 0 | 0 |
| Block lines dropped | - | - | 0 of 41 | 0 of 45 | 0 of 46 |
| Fact recall | 100% (38–100) | 100% (63–100) | 100% (33–100) | 87% (33–100) | 100% (63–100) |
| Entity precision | 100% (100–100) | 100% (50–100) | 100% (50–100) | 100% (50–100) | 100% (27–100) |
| Errors | 0 | 0 | 0 | 0 | 0 |

- The streamed block saves one model call per composed answer. With `compose_card`, the model called the tool, read back that the card was up, and then wrote its sentence in another call. Now the sentence and the card come from the same call. That one call accounts for most of the drop in input tokens, cost and end time. The call counts are structural. The time ranges overlap: supply-site, which composes in neither design, varied from 11.8 s to 19.7 s within the baseline alone.
- The model wrote 41 block lines across the 6 composed cards, and the server dropped none. The per-line tolerance never fired in these runs; the tests cover it.
- With the streamed block and the old rule, the CEO licences question was not composed in either run: the model drew the fixed `find_people` card, which also showed a province the question did not ask about (precision 88%). With compose all, both runs composed one card with the three people and their licence badges, at 100% recall and precision (`.shots/compose-all-licences.png`, after a reload). mascop now composes the 4 people cases 8 of 8 times, as Winyu does.
- The rule change did not grow the prompt. The first call's input tokens were 9,551 to 9,555 for the licences question, against 9,555 before.
- Compose all cost $0.0016 more per question and took longer at the median (16.9 s against 14.6 s to the end). The licences answer now comes from the same 2 calls, so the extra time is the model's reasoning before the block (median 3,801 reasoning tokens against 2,865). With 2 runs per case, treat the time difference as noise until more runs agree.
- Recall dropped to 87% at the median because both HR runs asked `list_courses` with `query: "ขาย"`, which left out the alcohol-law course and the people it should go to (33%). The hybrid run 2 made the same call. The card showed every row the tool returned. In the `guard` runs the model made the same call, the tool now matched the course through the sales department and the licence its holders carry, and both HR runs scored 83%. The one fact still missing is the count of open positions ("3 ตำแหน่ง"), which no run of compose all showed. Mean recall over the 10 runs rose from 79% to 90%.
- No card in the `guard` runs typed a digit in literal text, and none did in `compose-all` either, so the stricter literal rule dropped no line. Every count and date on the cards ("20 คน", "เปิดรับมา 99 วัน", "3 ต.ค. 2569 · 1 วัน") arrived bound (`.shots/guard-hr-candidates-courses.png`, `.shots/guard-ceo-team.png`, both restored from the bench threads).
- The `guard` precision range falls to 27% because of one supply-site run, which composes in neither tag: that run called `get_alerts`, and its answer named one person and ten regions and provinces the expected facts do not list. Neither fix touches that path.
- The supply-site question is still not composed. Both runs answered with `describe_entity`, `get_site` and metric tools, and the model left the site rows on their fixed cards.
- The baseline and hybrid runs were not interleaved. They ran an hour apart on separate dev servers (`:3200` and `:3206`).

## Code size

Lines of TypeScript, tests excluded.

| Layer | mascop | Winyu |
|---|---|---|
| Engine adapter (`lib/harness/adapters/…`) | 544 (Mastra) | 293 (Vexa) |
| Harness core (`lib/harness`, without adapters) | 860 | 779 |
| Chat client (`components/chat`) | 765 | 369 |
| Thread rail (`components/threads`) | 246 | 230 |
| Cards (`components/cards`) | 2,585 | 1,731 |
| UI primitives (`components/ui`) | 1,272 | from Vexa |
| `app/` | 1,750 | 1,553 |
| All of `components/` | 9,487 | 6,756 |
| All of `lib/` | 20,924 | 24,411 |
| Generative UI library | none | Vexa `src/`, 21,082 |

mascop's chat client is about twice Winyu's because Vexa's `ai-elements` and chat pieces did that work in Winyu. mascop's `lib/` is smaller because the json-render catalog, spec normalizer and card eval are gone.

## Dependencies

| | mascop | Winyu |
|---|---|---|
| Direct dependencies | 19, plus 9 dev | 10, plus 9 dev (Vexa adds 31, plus 12 dev) |
| Resolved packages (`bun.lock`) | 1,479 | 156 own, plus Vexa's 1,285 |

## Open risks

- Mastra breaking changes. Tool approval changed in 1.72, two minor versions before the one mascop pins. mascop pins exact versions of `@mastra/*`, `@ag-ui/*` and `@copilotkit/*`, and only `lib/harness/adapters/mastra/` imports them (enforced by `lib/harness/boundary.test.ts`), so an upgrade touches one folder.
- Paid CopilotKit features. Thread history, the thread drawer and other Intelligence features are paid. mascop builds its own rail and history restore and does not call them.
- AG-UI bridge drift. `@ag-ui/mastra` maps Mastra's stream to AG-UI. A change in either side shows up as missing tool calls or interrupts in the chat. `bun run probe:chat` covers the approval path and should run after every upgrade.
- Two message stores. Any feature that reads or writes a conversation goes through the Mastra adapter; a handoff reply is written there with `appendHandoffReply`.
