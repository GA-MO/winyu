# About memory in mascop

mascop remembers two kinds of things about each person: short facts (what they follow, the words they use, what they asked to be remembered) and their past conversations. This page explains how each works, what F6 measured when it compared them with Mastra's three memory features, and why mascop adopted one feature, folded the useful part of a second into its own design, and rejected the third.

## What a person sees and controls

Everything mascop remembers about a person is on `/memory`, and the person can remove any of it there.

- **Facts.** Each fact shows its type, how often mascop has seen it, and whether it is still being learned. The person can confirm, reword, or delete a fact, or forget everything.
- **Conversations mascop can recall.** Each recallable thread shows its title, its last date, and how many turns are indexed. **Remove from recall** takes a thread out of recall and keeps it in chat history. Deleting a thread from chat history also removes it from recall. **Forget everything** clears the facts and the recall index.

Forgetting a fact does not take its source conversation out of recall. An ordinary answer no longer uses the fact, but if the person asks what they discussed before, `recall_memory` can still find the conversation where they said it. To forget both, the person removes that conversation from recall too.

Memory is per person. The resource id is always the signed-in user's id, taken from the session in code, never from a model argument. No query reads another person's facts or vectors.

## How facts work

After each finished turn, `learnFromTurn` (`lib/harness/adapters/mastra/learn.ts`) asks the utility model to extract at most three facts from the question (`rememberTurn` in `lib/engine/memory.ts`). A new fact starts as `learning` and stays out of the prompt until mascop hears it again or the person confirms it. Facts learned from an action (a watch the person set, a handoff they sent) start trusted.

F6 added one origin. When the person explicitly asks mascop to remember something ("จำไว้นะว่าผมดูแลภาคอีสานเป็นหลัก"), the extractor marks the fact `asked` and it is trusted at once. Before F6, that fact was stored at confidence 0.45 and the next thread ignored it.

A trusted fact in the prompt was not enough on its own. The first live recording of `memory-remember-region` had both northeast facts in the prompt, mentioned the northeast in its reply, and still queried all six regions. The memory header now tells the model to use what the person looks after or likes to see as the default scope when the question names none, and to say so in the reply. The re-recorded case queried `filters: { region: "northeast" }`. Each result is one run. The header belongs to the `memory` context kind, which the eval prompt hash leaves out, so the change made none of the other 58 recordings stale.

Each turn, `relevantMemory` (`lib/server/agent/persona.ts`) ranks the trusted facts by how close they are to the question, keeps at most 12 within 2,400 characters, and fences them as data in the persona.

## How conversation recall works

After each finished turn, `learnFromTurn` also embeds the question and the reply text as two vectors with a local model and stores them in a `LibSQLVector` index named `mascop_recall` in `.data/mastra.db`. Each vector carries the person's id, the thread, the turn, the text, the time, and the turn's metric queries.

The `recall_memory` tool searches that index when the model calls it, usually because the person refers to an earlier conversation. It returns at most three past threads (not the current one), each with its title, date, question, reply, and metric queries. Before any recalled text leaves the recall module, `maskNumbers` replaces every number in it. The model therefore cannot repeat an old figure. To give a number, it re-runs the stored `query_metric` query through the gateway, which applies the person's current scope.

The embedder is `Xenova/multilingual-e5-base` (8-bit) through `@huggingface/transformers`. It runs on the server's CPU. No text leaves the machine. The model (288 MB) downloads once to `~/.cache/mascop/models`.

## Working memory: rejected, its one advantage kept

Mastra's working memory gives the chat agent an `updateWorkingMemory` tool and a Markdown profile that it rewrites inside the turn. F6 ran it with a Thai template that mirrors mascop's fact types, on the same two turns it ran against today's design: "remember I mainly look after the northeast", then, in a new thread, "how are sales against target this month".

The table compares the three runs (one run each, Gemini 3.8 Flash, billed cost from OpenRouter):

| | Before F6 | Mastra working memory | F6 (`asked` origin) |
|---|---|---|---|
| Second thread filtered to the northeast | no (`filters: {}`) | yes | yes |
| Model calls, both turns | 5 (3 chat, 2 extraction) | 4 (all chat) | 4 (3 chat, 1 extraction) |
| Input tokens, both turns | 33,289 | 47,348 | 32,063 |
| Cost, both turns | $0.0206 | $0.0290 | $0.0179 |
| First turn wall time | 5.1 s (extraction settles 3.3 s later, off the reply path) | 6.6 s (a second step after `updateWorkingMemory`) | not timed (eval recorder) |
| Added to every chat call | nothing | about 730 tokens: 2,081 to 2,251 characters of instruction and profile, and the tool schema | about 40 tokens: one sentence in the memory header |

The 730 tokens are inferred from the first turn: two working-memory calls took 20,947 input tokens where today's single call took 9,642.

Working memory did fix the real gap: the second thread filtered to the northeast. It also costs more on every call, and it breaks four mascop rules:

- **Its tool bypasses the gateway.** `updateWorkingMemory` is a Mastra memory tool, so no scope check, audit row, or trace step covers the write.
- **Its instructions tell the model to store anything.** Mastra's instruction says "Store anything that could be useful later" and "You MUST call updateWorkingMemory in every response to a prompt where you received relevant information". Nothing stops a figure from a tool result from being stored and reaching a later thread as remembered text. The probe's profile held none, but mascop's extractor forbids numbers outright.
- **The profile is one blob.** The person could only see and delete the whole text, not one fact. Mastra's own instruction tells the model "The user will not see it".
- **The profile is not fenced.** It sits in Mastra's system message, not behind `fenceAsData`.

The advantage, a stated fact that works in the next thread, is now the `asked` origin in today's extractor. It costs nothing on the chat call, and the fact stays visible and deletable on `/memory`.

## Semantic recall: adopted on demand, not on every turn

Before F6, mascop had no way to answer "what did we discuss about X last week". `recall_memory` searched facts, and facts do not hold conversations.

Mastra's semantic recall has two halves: indexing every message into a vector store, and a processor that embeds each new question and injects the closest messages from other threads into the system prompt. mascop adopted the first half on Mastra's `LibSQLVector` and replaced the second with the `recall_memory` tool.

`bun run memory:bench` measured retrieval over the 58 recorded eval conversations (111 messages): 26 everyday questions and 12 questions reworded with different words ("โคราช" for นครราชสีมา, "หยุดยาวไปเที่ยว" for annual leave). Trigram similarity is the matcher today's facts already use.

| | Trigram | e5-base (local) |
|---|---|---|
| Everyday, right thread first | 20 of 26 | 22 of 26 |
| Everyday, right thread in top 3 | 22 of 26 | 25 of 26 |
| Reworded, right thread first | 5 of 12 | 10 of 12 |
| Reworded, right thread in top 3 | 7 of 12 | 12 of 12 |
| Query time (p50) | 4 ms | 16 to 21 ms |

e5-base loads in about 3 seconds once per server process and indexes a turn (question and reply) in 182 ms (p50), after the reply. Times are from a laptop shared with other agents' work.

A throwaway prototype, which embedded each text on its own, also ranked these local models on the same questions:

| Model | Right thread in top 3 | Query time | Size |
|---|---|---|---|
| `Xenova/multilingual-e5-base` (8-bit) | 36 of 38 | 25 to 45 ms | 288 MB |
| `Xenova/multilingual-e5-small` (8-bit) | 34 of 38 | 5 to 30 ms | 145 MB |
| FastEmbed `multilingual-e5-large` | 34 of 38 | 0.8 to 1.0 s | 2.1 GB |
| `paraphrase-multilingual-MiniLM-L12-v2` (8-bit) | 17 of 26 everyday | 9 ms | 145 MB |

`bun run memory:bench` also sized what each design puts into a call. Token counts are estimates at 2.5 characters per Gemini token, the ratio of a measured 9,642-token call whose prompt was mostly Thai persona text and English tool schema.

| Block | Characters | Tokens (estimate) | When it is sent |
|---|---|---|---|
| Today's memory block, 12 facts | 771 | 308 | every chat call |
| Mastra working memory instruction, profile, and tool | 2,275 to 2,445 | 730 (inferred from a real call) | every chat call |
| Mastra per-turn recall block (topK 4, messageRange 1) | p50 1,783, max 5,685 | p50 713 | every chat call of every turn |
| `recall_memory` conversations (3 threads, reply cut to 280 characters) | p50 1,293 | p50 517 | only on turns that call it |

Two live eval cases grade the result. In `memory-recall-thread`, the person asks about staff turnover in one thread and, in a new thread, which department was most worrying. The model called `recall_memory`, found the earlier thread, re-ran its stored `attrition_rate` query, and answered from the fresh rows ($0.0253, both turns).

Mastra's per-turn processor was rejected for three measured reasons:

- **No threshold separates related from unrelated questions.** Unrelated questions such as "สวัสดีครับ" score 0.795 to 0.829 against the nearest past message. Related questions score 0.812 to 0.906. A per-turn processor would inject old conversations into greetings and off-topic questions.
- **It adds tokens to every call of every turn.** On-demand recall adds tokens only on the turns that call `recall_memory`.
- **Its block is not fenced and keeps the old numbers.** The processor writes past replies, figures included, into a system message.

FastEmbed's multilingual E5 large, Mastra's documented local option, found fewer threads than e5-base (recall@3 34 of 38 against 36 of 38) and took about 0.8 to 1.0 seconds per query against about 25 to 45 milliseconds, with a 2.1 GB model. The English FastEmbed models do not read Thai.

## Observational memory: rejected

Observational memory runs an Observer model in the background once a thread's history passes a token threshold, and a Reflector when the notes grow. It compresses one long thread. Its resource scope, the only mode that would carry across threads, is deprecated.

The main development store holds 15 threads with a median of 1 turn and about 8,000 stored tokens per turn, because tool results are stored with the messages (estimate at 2.5 characters per token). One thread passed the 30,000-token observation threshold. Twelve passed the first 6,000-token buffer, after which observational memory would run about 1.3 Observer calls per turn. F6 did not run it live: it is a single-thread mechanism, and the estimate already rules it out. Each Observer call is estimated at about $0.004 (a 6,000-token chunk in, the notes out), a third of a median chat turn. Most mascop threads are one to three turns long, so the notes would rarely be read. The notes are also model-written text that keeps figures from tool results, injected into the system prompt and invisible on `/memory`. If long threads become a cost problem, a history processor that trims old tool results is cheaper.

## Cost per turn at a glance

Costs are per chat turn. The median chat turn costs $0.0115 (42 turns in the main development ledger).

| Design | Extra model calls per turn | Tokens added per chat call | Latency the person waits | Extra cost per turn |
|---|---|---|---|---|
| Fact extraction (today, kept) | 1 utility call after the reply (median 515 input tokens) | at most 308 | none | $0.0013 |
| `asked` origin (F6, adopted) | 0 | about 40 | none | about $0 |
| Conversation recall (F6, adopted) | 0, plus 2 local embeddings after the reply | 0, or p50 517 on turns that call `recall_memory` | 16 to 21 ms on those turns | $0 |
| Working memory (rejected) | 1 more chat step on every turn that writes the profile | about 730 | one more step (6.6 s against 5.1 s) | about $0.004 on a write turn, plus about $0.0005 on every turn |
| Per-turn semantic recall (rejected) | 0, plus 1 local embedding | p50 713 | 16 to 21 ms on every turn | about $0.0005 |
| Observational memory (rejected) | about 1.3 Observer calls | fewer in threads past 30,000 tokens | none (background) | about $0.005 (estimate) |

## Reproduce the numbers

`bun run memory:bench` measures retrieval, prompt sizes, thread sizes, and extraction cost with no model call. `--mastra-db=<path>` and `--ledger=<path>` point it at another store or ledger. The two-thread behaviour is graded by the eval cases `memory-remember-region` and `memory-recall-thread` (`bun run eval --case=memory-remember-region,memory-recall-thread`), recorded live once.
