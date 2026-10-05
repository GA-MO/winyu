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

- Smaller prompts. A chat model call in mascop averaged 10,454 input tokens, against 18,972 in Winyu's ledger. mascop sends no component catalog or spec rules, because the model chooses a tool and mascop draws the card from the result (inferred from the prompt contents; not isolated by an experiment).
- Cheaper questions. In the M5 walk, 15 questions (7 of them with an approval and a resume run) cost 36 chat calls and $0.1828: 2.4 calls and $0.0122 per question. Winyu's ledger holds 413 chat runs at 2.40 calls and $0.0268 per run (measured over 2026-09-25 to 2026-10-04). The question mix differs and Winyu's runs are not the same questions, so treat the ratio as indicative.
- A card cannot be drawn wrong by the model, because the model never writes card markup. Winyu needed `normalize.ts` and an eval to keep specs honest.
- The wire format is AG-UI, a public protocol, instead of Vexa's own message parts.

## Worse than Winyu

- The model cannot compose a new layout. Every tool has one fixed card. Winyu's model could compose primitives for people and entity answers.
- An approval splits one question into two runs, two model round trips and two traces that share a goal id.
- Two stores hold a conversation: Mastra memory has the messages, `.data/threads.json` has the metadata. A recipient's reply to a handoff is no longer appended to the sender's thread (listed as Open in the plan).
- Far more dependencies. mascop resolves 1,479 packages (1.4 GB `node_modules`). Winyu resolves 156 of its own on top of Vexa's 1,285.
- Version coupling. `@openrouter/ai-sdk-provider` 3.x needs `ai@7`, which conflicts with CopilotKit's `ai@6`, so mascop stays on provider 2.x.
- CopilotKit's client bundle loads Lit, which logs a dev-mode warning on chat pages under `next dev`. Production builds load the production Lit.

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
- Two message stores. Any feature that reads a conversation must read Mastra memory through the adapter, not `Thread.messages`, which stays empty.
