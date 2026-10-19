# About memory in Winyu

Winyu remembers two kinds of things about each person: short facts (what they follow, the words they use, what they asked to be remembered) and their past conversations. This page explains how each works, what F6 measured when it compared them with Mastra's three memory features, and why Winyu adopted one feature, folded the useful part of a second into its own design, and rejected the third.

## What a person sees and controls

Everything Winyu remembers about a person is on `/memory`, and the person can remove any of it there.

- **Facts.** Each fact shows its type, how often Winyu has seen it, whether it is still being learned, and the last day of a dated fact. The person can confirm, reword, or delete a fact, or forget everything. A deleted fact leaves a tombstone, so learning never brings it back from what the person merely says. **Forget everything** clears the tombstones too.
- **Conversations Winyu can recall.** Each recallable thread shows its title, its last date, and how many turns are indexed. **Remove from recall** takes a thread out of recall and keeps it in chat history. Deleting a thread from chat history also removes it from recall, and each time the recall index opens it deletes the vectors of any thread whose record is gone (a reseeded data folder, a crash between the two deletes). **Forget everything** clears the facts and the recall index.

The person can also manage memory in the chat. "จำไว้ว่า…" makes the model call `remember` and "ลืม…" makes it call `forget` (`lib/server/tools/remember.ts`, `lib/server/tools/forget.ts`). Both are write tools on the `winyu` connector, so the person approves the wording or the topic on an approval card first, the gateway audits the call with the personal text redacted, and a post-condition checks the store afterwards. An approved `remember` is stored as confirmed. A value that carries a figure is refused before the card is shown. An approved `forget` removes every fact about the topic, trusted or still learning, and buries both the facts and the topic phrase. Because the tools are writes, MCP clients, A2A callers and the morning investigation (reads only) cannot change anyone's memory. A turn that called either tool, approved or declined, is neither learned from nor indexed for recall afterwards.

Forgetting a fact does not take its source conversation out of recall. An ordinary answer no longer uses the fact, but if the person asks what they discussed before, `recall_memory` can still find the conversation where they said it. To forget both, the person removes that conversation from recall too.

Memory is per person. The resource id is always the signed-in user's id, taken from the session in code, never from a model argument. No query reads another person's facts or vectors.

## How facts work

After each finished turn, `learnFromTurn` (`lib/harness/adapters/mastra/learn.ts`) asks the utility model to extract at most three facts from the question (`rememberTurn` in `lib/engine/memory.ts`). A new fact starts as `learning` and stays out of the prompt until Winyu hears it again or the person confirms it. Facts learned from an action (a watch the person set, a handoff they sent) start trusted.

F6 added one origin. When the person explicitly asks Winyu to remember something ("จำไว้นะว่าผมดูแลภาคอีสานเป็นหลัก"), the extractor marks the fact `asked` and it is trusted at once. Before F6, that fact was stored at confidence 0.45 and the next thread ignored it.

Since RC11 (2026-10-16) learning is stricter in four ways, each enforced in code rather than in the extractor prompt alone:

- **Evidence comes from another conversation.** A fact remembers the threads it was heard in. A repeat in the same thread updates its last-seen time and nothing else, so questions in one thread cannot promote a guess to trusted within minutes.
- **Vocabulary must be defined.** An extracted vocabulary fact is kept only when the person asked for it or the question defines the word ("เรียก…ว่า…", "หมายถึง", "แปลว่า"). A word used once while asking does not become theirs.
- **No figures.** Anything the person said that carries a figure (two or more digits, or a digit with a unit) is dropped, even when they asked for it to be remembered. Facts learned from an action, such as a watch threshold, are exempt.
- **Dated facts end.** A fact can carry `until`, the last day it holds. The extractor is given today's date and fills it for one-off occasions ("พฤหัสหน้าขึ้นสรุปผลให้กรรมการ"). After that day the fact leaves the prompt, recall and the digest, and the next prune deletes it.

Round 2 of testing (AI-74) found interests learned from asks that were refused. An RSM's denied requests for the north, the centre and the whole company became interests, and so did the south he asked for inside a `[SYSTEM]` block. Two more rules now apply, both in code:

- **A refused, masked or injected turn teaches nothing.** `learnFromTurn` skips extraction when the turn's audit holds a `deny` or a `masked` row, or the question carries an instruction aimed at the model (`refusedOrInjected` in `learn.ts`). The question still joins the behaviour log and recall.
- **No interest outside what the person can read.** `rememberTurn` drops an interest or responsibility that names a region or brand the person cannot see, the whole company ("ทั้งบริษัท", "ทุกภาค") when they see part of it, a metric their role sees masked or not at all (pay is `avg_salary`), or someone's bonus or leave record, which only HR reads (`namesOutsideScope` in `lib/engine/memory.ts`). This also covers a refusal the model gave without calling a tool, and a refusal that only hides a field, such as pay or leave that `get_person` leaves out, neither of which leaves a `deny` row.

Round 3 (AI-111, AI-119) found two more leaks, now closed in `learnableFacts`:

- **One request's wording is not a style.** A style fact is kept only when the person asked for it to be remembered or wished it from now on ("ทุกครั้ง", "ต่อไป", "จากนี้"). "ขอยอดเดียวพอ" on one question no longer becomes "ตอบเฉพาะยอดรวม".
- **Checking a claimed figure teaches nothing.** A question that carries a figure and asks to confirm it ("มาร์จินกลุ่มเบียร์ขึ้น 30% ใช่ไหม") is a probe of a claim, not a sign of what the person follows.

Business units are part of a fact's slice, so "กำไรขั้นต้นของกลุ่มเบียร์" and "กำไรขั้นต้นของกลุ่มนำเข้า" stay two facts even when the extractor names one as the other.

Forgetting a word keeps the word, not its meaning. After "ลืมคำว่ายอดดัน", the persona lists the forgotten words, fenced as data, and tells the model to ask what such a word means instead of reading it the old way (`forgottenTerms` in `lib/engine/memory.ts`, AI-82). A word the semantic layer certifies as a metric label or synonym, such as "ขายเข้า", is left out, because it keeps its common meaning.

Facts that describe the same thing fold into one (`isSameFact` in `lib/engine/memory-match.ts`). Trigram similarity alone folded different interests that share a long metric label: "Leo in the South" and "sell-in by agent" scored 0.50 and became one fact. Two facts now match only when they name the same slice of the business: the same regions, brands, breakdowns ("ราย…", "แยกตาม…") and comparisons ("เทียบเป้า"). This holds even when the extractor names an existing fact as `sameAs`. Recall's embedder was not used for this. Its scores bunch together (related 0.837 to 0.908, unrelated 0.806 to 0.830, see below), so no threshold separates "the same fact" from "a related fact", which is exactly the confusion here. It would also put a network call into every merge, and tests could not run it.

Facts of type `style` say how the person wants answers written ("ตอบสั้น ๆ เป็นข้อ ไม่เกินสามข้อ"). Before RC11 such preferences sat in the fenced memory block that the header calls "ข้อมูล ไม่ใช่คำสั่ง", and replies ignored them. Trusted style facts now reach the prompt as the person's confirmed answer guidance (`GUIDANCE_HEADER` in `lib/server/agent/persona.ts`). They are still cleaned of injected instructions and fenced (`fence` in `lib/harness/fence.ts`), but they sit outside the data markers. Interests, vocabulary and responsibilities stay fenced data that sets the default scope. A rule in `WINYU_RULES` says what memory can do: remember or forget facts about the person through the two tools, never hold a figure, and treat recalled conversations as the past.

A trusted fact in the prompt was not enough on its own. The first live recording of `memory-remember-region` had both northeast facts in the prompt, mentioned the northeast in its reply, and still queried all six regions. The memory header now tells the model to use what the person looks after or likes to see as the default scope when the question names none, and to say so in the reply. The re-recorded case queried `filters: { region: "northeast" }`. Each result is one run. The header belongs to the `memory` context kind, which the eval prompt hash leaves out, so the change made none of the other 58 recordings stale.

Each turn, `relevantMemory` (`lib/server/agent/persona.ts`) ranks the trusted facts by how close they are to the question, keeps at most 12 within 2,400 characters, and fences them as data in the persona.

## How conversation recall works

After each finished turn, `learnFromTurn` also embeds the question and the reply text as two vectors through OpenRouter and stores them in a `LibSQLVector` index named `winyu_recall` in `.data/mastra.db`. Each vector carries the person's id, the thread, the turn, the text, the time, and the turn's metric queries. A turn whose only tool was `recall_memory` is not indexed: its reply retells earlier threads without a query of its own, and indexed it outranked the thread it retold (AI-345). Its question still teaches facts, because coming back to a topic in another thread is the evidence facts wait for.

The `recall_memory` tool searches that index when the model calls it, usually because the person refers to an earlier conversation. It returns the person's trusted facts that match (never one still being learned or past its day) and at most three past threads (not the current one), each with its title, date, question, reply, and metric queries. The result keeps the person's own words, because the memory card shows it to them. What the model reads is the tool's model view (`recallForModel`): `maskNumbers` replaces every number in the title, question and reply, and a note says the conversations are the past, not the current state. Every engine adapter hands the model that view (Mastra's `toModelOutput`, the AI SDK's `toModelOutput`, and the MCP result), and Mastra stores it with the tool result, so later turns of the thread read it masked too. Before RC11 the thread title reached the model unmasked, so a figure in a first question leaked through it. The model therefore cannot repeat an old figure. To give a number, it re-runs the stored `query_metric` query through the gateway, which applies the person's current scope.

A second `recall_memory` call in the same turn answers with everything the turn has recalled, and the chat draws only the last memory card of a reply, so a reply shows one card. A recall that found conversations draws its card even when it found no facts (AI-344); one that found nothing draws no card, and the reply says so. When another card of the reply answers, the memory card is left out as a lookup on the way.

The embedder is `intfloat/multilingual-e5-large` (1024 dimensions) through OpenRouter's embeddings API (`RECALL_EMBEDDING` in `lib/server/recall/embedder.ts`). The question and the reply text of every turn go to OpenRouter and the provider it routes to (DeepInfra in our calls), the same route the chat text already takes. The numbers in them are not masked at that point. Each call is recorded in the model ledger with the cost OpenRouter billed and how long it took (`latencyMs`). One call takes about 1.2 to 2.3 seconds, so a turn that calls `recall_memory` waits about that long for its query embedding. Indexing runs after the reply. Without `OPENROUTER_API_KEY`, recall cannot embed and the turn is not indexed.

An index built for another vector size is embedded again from its stored texts the first time it opens (`prepareRecallIndex` in `lib/harness/adapters/mastra/recall.ts`). The new vectors are computed before the old index is dropped. Tests use the trigram embedder and never call the API.

## Working memory: rejected, its one advantage kept

Mastra's working memory gives the chat agent an `updateWorkingMemory` tool and a Markdown profile that it rewrites inside the turn. F6 ran it with a Thai template that mirrors Winyu's fact types, on the same two turns it ran against today's design: "remember I mainly look after the northeast", then, in a new thread, "how are sales against target this month".

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

Working memory did fix the real gap: the second thread filtered to the northeast. It also costs more on every call, and it breaks four Winyu rules:

- **Its tool bypasses the gateway.** `updateWorkingMemory` is a Mastra memory tool, so no scope check, audit row, or trace step covers the write.
- **Its instructions tell the model to store anything.** Mastra's instruction says "Store anything that could be useful later" and "You MUST call updateWorkingMemory in every response to a prompt where you received relevant information". Nothing stops a figure from a tool result from being stored and reaching a later thread as remembered text. The probe's profile held none, but Winyu's extractor forbids numbers outright.
- **The profile is one blob.** The person could only see and delete the whole text, not one fact. Mastra's own instruction tells the model "The user will not see it".
- **The profile is not fenced.** It sits in Mastra's system message, not behind `fenceAsData`.

The advantage, a stated fact that works in the next thread, is now the `asked` origin in today's extractor. It costs nothing on the chat call, and the fact stays visible and deletable on `/memory`.

## Semantic recall: adopted on demand, not on every turn

Before F6, Winyu had no way to answer "what did we discuss about X last week". `recall_memory` searched facts, and facts do not hold conversations.

Mastra's semantic recall has two halves: indexing every message into a vector store, and a processor that embeds each new question and injects the closest messages from other threads into the system prompt. Winyu adopted the first half on Mastra's `LibSQLVector` and replaced the second with the `recall_memory` tool.

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

### The embedder moved to OpenRouter (2026-10-16)

The local e5-base model made the demo image 3.73 GB and its build heavier (`docs/adr/0006-recall-embeddings-through-openrouter.md`). `bun run memory:bench --embedders=…` compared OpenRouter models on the 63 recorded conversations (119 messages) and the same 38 questions. The total cost was $0.0024.

| Model | Right thread in top 3 | Right thread first | Query time (p50) | Price per million tokens |
|---|---|---|---|---|
| `intfloat/multilingual-e5-large` (chosen) | 38 of 38 | 34 of 38 | 1.2 to 1.5 s | $0.01 |
| `baai/bge-m3` | 38 of 38 | 33 of 38 | 1.3 to 1.7 s | $0.01 |
| `qwen/qwen3-embedding-8b` | 37 of 38 | 34 of 38 | 1.2 s | $0.01 |
| `google/gemini-embedding-001` | 37 of 38 | 35 of 38 | 0.9 s | $0.15 |

Trigram found 27 of 38 in its top 3 on the same set. The earlier local numbers came from 58 conversations, so they do not compare one to one. e5-large keeps the `query:` and `passage:` prefixes of the model it replaced. Its scores bunch together (related 0.837 to 0.908, unrelated 0.806 to 0.830), which does not matter while recall returns the top three without a threshold.

FastEmbed's multilingual E5 large, Mastra's documented local option, found fewer threads than e5-base (recall@3 34 of 38 against 36 of 38) and took about 0.8 to 1.0 seconds per query against about 25 to 45 milliseconds, with a 2.1 GB model. The English FastEmbed models do not read Thai.

## Observational memory: rejected

Observational memory runs an Observer model in the background once a thread's history passes a token threshold, and a Reflector when the notes grow. It compresses one long thread. Its resource scope, the only mode that would carry across threads, is deprecated.

The main development store holds 15 threads with a median of 1 turn and about 8,000 stored tokens per turn, because tool results are stored with the messages (estimate at 2.5 characters per token). One thread passed the 30,000-token observation threshold. Twelve passed the first 6,000-token buffer, after which observational memory would run about 1.3 Observer calls per turn. F6 did not run it live: it is a single-thread mechanism, and the estimate already rules it out. Each Observer call is estimated at about $0.004 (a 6,000-token chunk in, the notes out), a third of a median chat turn. Most Winyu threads are one to three turns long, so the notes would rarely be read. The notes are also model-written text that keeps figures from tool results, injected into the system prompt and invisible on `/memory`. Long threads are now handled by a history processor that trims old tool results (next section).

The 8,000 stored tokens per turn overstate what a turn adds to later calls. Most of the stored text is the model's reasoning, which is sent back but not billed (see Long threads).

## Long threads

The chat agent keeps the last 20 messages of a thread (`lastMessages: 20`), about five to ten turns, since a turn stores two to four messages. Before 2026-10-19 every earlier turn rode along whole on every later call: the question, the model's reasoning, its tool calls, every tool result with all its rows, and the reply.

### What history cost (measured 2026-10-19, $0)

`bun run history:bench` reads the traced model steps and the stored messages in `.data/mastra.db`. Before the live check below, the development store held 8 threads with more than one question (13 later turns with a traced first call, at most 5 questions). The fit below also uses the live thread's turn 2.

| Turn in thread | Turns measured | First call input (p50) | First call uncached (p50) |
|---|---|---|---|
| 1 | 48 | 15,748 | 15 |
| 2 | 7 | 12,675 | 2,376 |
| 3 | 3 | 14,323 | 4,335 |
| 4 | 3 | 16,478 | 6,490 |

The cached prefix is the system prompt and the tool definitions (`CACHED_SYSTEM_PROMPT` in `lib/server/models.ts`): 16,231 tokens for u_thana today, about 10,600 in the threads before 2026-10-19. Turns 2 to 4 above mostly come from those older threads, so their total input is lower than today's turn 1. The uncached part of a turn's first call is its history plus its question, so it is the clean measure: each earlier turn added about 2,000 input tokens to every call of every later turn. At turn 4, history was 39% of the call's input in those threads, and it is billed at full price, while the prefix is read from the cache at a quarter of the price.

The system prompt for u_thana is 21,473 characters. Two prompt versions (11,249 characters with 11,286 cached tokens, and 21,473 characters with 16,231) put it at about 10,400 tokens and the tools at about 5,900. That split is inferred and assumes the tool definitions did not change between the two versions.

**What history is made of.** The bench rebuilds each later turn's history from the stored messages with Mastra's own conversion (`storedHistoryPrompt` in `lib/harness/adapters/mastra/history-trim.ts`) and fits the parts against the turn's uncached tokens (14 turns, least squares):

- Questions, reply text, tool-call arguments and tool results cost about 1.7 characters per token.
- Thought signatures cost about 15 characters per token. Gemini returns its reasoning as an encrypted blob (`reasoning_details` with `data`), Mastra stores it on the assistant message, and the OpenRouter provider sends it back with every later call. One live turn's signatures were 27,516 characters, about 1,800 tokens.
- The reasoning text itself (1,800 to 12,000 characters per history) is not billed: adding it to the fit gives it a negative weight.
- With these two rates the estimate is within 13% of the measured tokens in 13 of 14 turns (the 14th, a short history, is 40% over).
- Tool results are the largest billed part: 61% to 71% of the estimated history tokens at turn 4, and 82% in the thread with two large results (b6e862a6).

**The longest thread** (814eda76, 5 questions, a gross-margin analysis that ends in a handoff), as the history of its next call: about 8,800 tokens. Questions 445, reply text 1,019, tool-call arguments 852, tool results 5,041, thought signatures 1,533. With today's 16,231-token prefix, that call would send about 25,000 input tokens, a third of them history at full price.

### What is trimmed and why

`HistoryTrim` (`lib/harness/adapters/mastra/history-trim.ts`) is an input processor on the chat agent. In `processLLMRequest`, just before each model call, it rewrites the provider prompt:

- **The current turn is untouched.** Everything from the newest question on keeps every tool result whole, so the model can draw cards from the rows it just fetched.
- **Each earlier tool result becomes a stub** when it is longer than 600 characters: `ok`, `summary` (the result's one-line headline with its figures), `query` (the resolved metric query, with its dates), `error` and `code` when it failed, `rowCount`, and a note that the rows were dropped and that the same query can be run again. Smaller results, such as `resolve_owner` and `create_handoff`, stay whole, because a follow-up may need a person's id from them.
- **Earlier reasoning and thought signatures are dropped.** Gemini validates signatures only for the current turn, and the model does not read earlier reasoning text, so they cost tokens and carry nothing.
- **Questions, reply text and tool-call arguments stay**, so "the first region we looked at" still finds the call and its arguments.
- **History stops at 8,000 tokens** (`HISTORY_TOKEN_CEILING`, counted with the fitted rates above). Past it, the oldest turns leave whole: a question never stays without its reply.

The rewrite is transient. Stored messages, the restored transcript, the cards, recall and traces keep every result whole. The system messages before the first turn are not touched, so the cached prefix stays byte for byte the same.

**Why not Mastra's processors.** `ToolCallFilter` removes a call and its result as a pair. With `preserveModelOutput` it keeps the result's model view as text, but drops the call's arguments, and for `query_metric` the model view is the full result with every row. It cannot keep a summary and a row count. `TokenLimiterProcessor` counts the system prompt into its limit and stops the whole run with a tripwire when the system prompt alone passes it. It drops message groups from the oldest, so it can keep a reply without its question. A ceiling of whole turns inside `HistoryTrim` avoids both.

**Estimated effect on stored threads.** `bun run history:bench` reports, for each later turn, the estimated history tokens before and after the trim:

| Thread, turn | History before | After |
|---|---|---|
| 77761e67, 4 | 4,919 | 1,824 |
| 814eda76, 4 | 7,413 | 2,934 |
| cefa5132, 4 | 6,904 | 2,162 |
| b6e862a6, 2 (two large results) | 10,446 | 1,417 |
| 814eda76 next call (5 questions) | 8,838 | 3,952 |

**Live check (2026-10-19, one thread, u_thana, $0.1451 estimated, $0.0302 billed).** Four turns in one conversation: sales this month by region, then the south by province, then the lowest province against last month, then "back to the first region we looked at, what was the total". Turn 2 ran with the result stubs only. The signature trim was added after turn 2 measured 27,516 characters of signatures in its history. Turns 3 and 4 ran with both.

| Turn | First call input | Uncached (history and question) | Same history untrimmed (estimate) | Billed cost of the turn |
|---|---|---|---|---|
| 1 | 16,238 | 7 | | $0.0089 |
| 2 | 19,676 | 3,364 | 3,317 | $0.0078 |
| 3 | 17,139 | 810 | 5,635 | $0.0065 |
| 4 | 17,613 | 1,255 | 8,414 | $0.0071 |

Before the trim, the first call of turns 3 and 4 carried a median 4,335 and 6,490 uncached tokens in the stored threads. Each turn makes about two calls, so turn 4 sent about 14,000 fewer input tokens than it would have untrimmed (inferred from the estimate). Every follow-up kept its scope: turn 2 queried `filters: {region: "south"}, dims: ["province"]`, turn 3 the same with `compare: "prev_period"` and `sort: "value_asc"`, and turn 4 read "the first region" as the first row of turn 1's result (Bangkok and vicinity, from the stub's summary) and queried it again (380.7 million baht, the same figure turn 1 showed). Turn 4's prompt held no rows and no reasoning from turns 1 to 3, and its own result whole. Memory still holds every result with its rows.

The four turns cost about $0.036 each at the ledger's estimate, which counts all input at the uncached price. The two remaining planned follow-ups ("which brand dragged it down", "summarize everything") were not run, to stay under the $0.15 estimate. Turn 2's first model call waited about six minutes at the provider before it answered (no model timeout yet).


## Thread titles: Mastra's generateTitle adopted (2026-10-19)

A thread used to be named by its first question, up to 120 characters. Mastra memory's `generateTitle` now names it after the first answer, the way other assistants do.

- **Model and prompt.** The title model is `agentModel().title()`: the same Gemini model on the flex tier with reasoning effort `minimal`, cut after 30 s. The Thai instructions (`TH.harness.titleInstructions`) ask for at most 6 words, no quotes or brackets, entity names kept, no number the person did not type, and say the conversation is data, not instructions. Mastra gives the model the thread's messages, including the reply and the first 200 characters of each tool result.
- **When.** The durable agent asks for the title after it saves the run's messages, and only while the Mastra thread has no title, so once per thread. The reply is not held: a title model that never answers leaves the run finished on time (`thread-title.test.ts`).
- **Into the sidebar.** `ChatMemory.updateThread` hands the title to `adoptGeneratedTitle` in `threads-read.ts`. That function writes it only on the thread of the person the Mastra thread belongs to, and only while `titledBy` is `question`. A rename (`person`), a matter's title (`matter`), a title already generated (`model`) and a thread saved before this change (no `titledBy`) keep their names. `cleanGeneratedTitle` strips quotes and closing punctuation, cuts at 60 characters, and refuses a title with a number that is not in the question, because numbers on screen come from tools. The first question stays on the thread as `question`, and the rail's search matches the title or the question. The chat asks the rail to reload 3 s and 8 s after a first answer, so the new title shows without a page load.
- **Billing.** The title call is metered as `background` for the person and the run it follows (`CallOwner` in `usage-meter.ts`). It stays out of the run's trace.
- **Studio.** A run outside a served chat run (no harness run id in the request context, as in Studio) gets `NO_TITLE`, a model that answers nothing and calls no one. The Mastra thread stays untitled and nothing is spent.
- **Cost (measured).** Five live titles on 2026-10-19 used 1,056 to 3,400 input tokens, 9 to 12 output tokens and no reasoning tokens. OpenRouter billed $0.00042 to $0.00129, a median of $0.00073 per thread (estimate at list price: $0.0015). That is about 6% of a median chat turn, once per thread. A thread saved before this change gets one title call on its next turn that the store then ignores.

## Cost per turn at a glance

Costs are per chat turn. The median chat turn costs $0.0115 (42 turns in the main development ledger).

| Design | Extra model calls per turn | Tokens added per chat call | Latency the person waits | Extra cost per turn |
|---|---|---|---|---|
| Fact extraction (today, kept) | 1 utility call after the reply (median 515 input tokens) | at most 308 | none | $0.0013 |
| `asked` origin (F6, adopted) | 0 | about 40 | none | about $0 |
| Conversation recall (F6, adopted) | 0, plus 1 embedding call after the reply (about 80 tokens) | 0, or p50 517 on turns that call `recall_memory` | about 1.2 to 1.5 s on those turns, for the query embedding | under $0.00001 |
| Working memory (rejected) | 1 more chat step on every turn that writes the profile | about 730 | one more step (6.6 s against 5.1 s) | about $0.004 on a write turn, plus about $0.0005 on every turn |
| Per-turn semantic recall (rejected) | 0, plus 1 local embedding | p50 713 | 16 to 21 ms on every turn | about $0.0005 |
| Thread title (adopted 2026-10-19) | 1 utility call after the first reply of a thread only | 0 | none | median $0.00073 billed, once per thread |
| Observational memory (rejected) | about 1.3 Observer calls | fewer in threads past 30,000 tokens | none (background) | about $0.005 (estimate) |

## Reproduce the numbers

`bun run history:bench` measures what history costs each chat call, before and after `HistoryTrim`, and spends nothing. `bun run memory:bench` measures retrieval, prompt sizes, thread sizes, and extraction cost. Only retrieval spends: each embedding model in `--embedders` (the recall model by default) embeds about 15,000 tokens, under $0.0002 at $0.01 per million. `--mastra-db=<path>` and `--ledger=<path>` point it at another store or ledger. The two-thread behaviour is graded by the eval cases `memory-remember-region` and `memory-recall-thread` (`bun run eval --case=memory-remember-region,memory-recall-thread`), recorded live once.
