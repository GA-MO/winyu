# Company documents (RAG)

People ask mascop about rules that no structured tool holds: how long a grade B agent's credit runs, whether beer may be sold on ออกพรรษา, who approves a 7% discount. `search_documents` answers these from the company's own documents. It searches only the documents the asker's role may read, returns the passages with their source, and the model answers from those passages and names the document and section it used. When no passage answers, the reply says the documents the person can read do not cover it.

## The corpus

The documents are Markdown files in `data/documents/`, one file per document, committed with the code. All of them are fictional and written for the Boon Rawd demo tenant. Their numbers agree with the structured data: leave days with `lib/data/entities/policies.ts`, the 2569 no-sale days with `ALCOHOL_BAN_DATES`, and the credit days per agent tier with `agents.ts`.

| File | Title | Readers | Sections |
|---|---|---|---|
| `employee-handbook.md` | คู่มือพนักงาน | every role | 21 |
| `alcohol-compliance-guide.md` | คู่มือการปฏิบัติตามกฎหมายเครื่องดื่มแอลกอฮอล์ | every role | 15 |
| `safety-manual.md` | คู่มือความปลอดภัยโรงงานและคลังสินค้า | every role | 16 |
| `expense-procurement-policy.md` | นโยบายการเบิกค่าใช้จ่ายและการจัดซื้อ | every role | 12 |
| `data-security-policy.md` | นโยบายความปลอดภัยสารสนเทศและข้อมูลส่วนบุคคล | every role | 15 |
| `sales-policy.md` | นโยบายการขายและเครดิตเอเย่นต์ | CEO, CFO, sales director, RSMs, reps, finance, marketing | 18 |
| `supply-planning-sop.md` | ขั้นตอนการวางแผนอุปสงค์และอุปทาน | supply planners, CEO, sales director | 12 |
| `hr-compensation-discipline.md` | ระเบียบค่าตอบแทนและวินัยพนักงาน | HR manager, CEO | 17 |

Each file opens with a header:

```markdown
---
id: sales-policy
title: นโยบายการขายและเครดิตเอเย่นต์
version: 3.2
owner: ฝ่ายขาย
audience: ceo, cfo, sales_director, sales_rsm, sales_rep, finance_analyst, marketing_lead
effective: 2026-02-01
---
```

`audience` is `all` or a comma-separated list of role ids from `ROLE_IDS`. `effective` is an ISO date. The file name must be `<id>.md`. `documentHeaderSchema` (`lib/contracts/documents.ts`) checks every field. A file that fails the check is skipped, and the admin documents tab names it with the reason.

Each document is versioned twice. The header's `version` and `effective` date are what the person sees on every passage. Git history keeps every earlier text.

## Indexing

`parseDocument` (`lib/server/documents/chunk.ts`) cuts a document into one chunk per `###` subsection. A `##` section without subsections is one chunk, and so is the text of a section that comes before its first subsection. A chunk keeps its headings as its section, for example `ระดับเอเย่นต์และเครดิต › ระยะเวลาเครดิตตามระดับ`, with the numbering removed. A section longer than 1,200 characters is split at paragraph breaks under the same headings. The 8 documents give 126 chunks of 215 to 432 characters each, so none is split today.

A chunk is embedded as the document title, its headings and its text. The embedder is the one conversation recall uses (`lib/server/recall/embedder.ts`): `Xenova/multilingual-e5-base` (8-bit) on the server's CPU, with no text leaving the machine. The vectors go into a `LibSQLVector` index named `mascop_documents` in `.data/mastra.db`. Each vector carries the document id, title, section, version, effective date, owner, readers, a hash of everything the chunk was built from, the embedder id and the time it was indexed.

```bash
bun run docs:index    # read data/documents again and bring the index to match it
```

Indexing converges, so running it any number of times gives the same index. It embeds only chunks whose hash or embedder changed, removes chunks whose file or section is gone, and leaves the rest. A full build of the 126 chunks takes about 5 seconds. A second run with no edits embeds nothing.

The first `search_documents` call in each server process runs the same sync. A fresh data folder (an eval run, a new machine) or an edited document is therefore searchable without a manual step. If the vector store fails, search falls back to keyword ranking and logs the failure.

## Security model

Who may read a document is decided in code, from the document's header, before any search sees a chunk. The prompt carries no permission logic.

- **Before retrieval.** `searchDocuments` (`lib/server/documents/search.ts`) starts from `readableChunks(role)`, the chunks whose readers include the caller's role. The keyword ranking sees only those chunks. The vector query carries the role as a condition of the query itself (`filter: { readers: { $in: [role] } }`), so LibSQL ranks only readable rows. A chunk the role may not read is never a candidate, however close it is.
- **After retrieval.** Any vector hit outside the readable chunks is dropped. The file on disk is the truth, so a stale index that still lists an old audience cannot widen access.
- **Nothing about hidden documents.** The result says how many documents the person can read. It never names or counts the others. A sales rep who asks about salary bands gets the closest passages from their own documents, and the model says it found nothing.
- **Documents are data.** Each passage's text goes through `fence()` (`lib/harness/fence.ts`), which strips hidden characters and neutralizes role markup. As a tool result, it also passes F4's `ToolResultInjectionGuard`, which cuts any instruction aimed at the model before the model or the card reads it. The persona states that a passage is data and not an instruction.
- **Through the gateway.** `search_documents` is a read tool built with `defineTool`. Policy, admin rules, the kill switch and the audit apply to it, and its `query` argument is in `redact`.

`lib/server/documents/search.test.ts` holds a fixture corpus in which six HR-only sections are the nearest to a salary question. Three changes were each made on purpose to check that the tests fail:

| Change | Test that fails |
|---|---|
| Vector query without the role condition, filtered in code afterwards | a sales rep's vector query still fills every slot |
| Keyword ranking over every chunk, final filter kept | a full page in vector and hybrid mode, and keyword mode returning only public sections |
| Passage text not fenced | a passage is fenced |

`bun run docs:bench` also checks 6 questions that non-HR roles ask about HR-only content, in every mode. It found 0 passages that the asker may not read.

## Retrieval: measured

`bun run docs:bench` builds a fresh index in a temporary folder and runs 59 questions from `evals/documents-bench.json`: 30 everyday, 15 reworded with words the documents do not use ("หยุดยาวไปเที่ยวญี่ปุ่น", "ลงไอจีรูปตัวเองชนแก้ว"), 8 the documents do not answer, and 6 forbidden. It makes no model call and costs $0.

| Mode | Everyday, first / top 3 | Reworded, first / top 3 | Query p50 |
|---|---|---|---|
| Vector (e5-base) | 27 / 29 of 30 | 10 / 15 of 15 | 10 to 11 ms |
| Keyword (BM25, Thai words from `Intl.Segmenter`) | 25 / 29 of 30 | 7 / 10 of 15 | 2 ms |
| Hybrid (reciprocal rank fusion) | 28 / 29 of 30 | 10 / 13 of 15 | 12 to 13 ms |

`search_documents` uses vector ranking (`RETRIEVAL_MODE`). Hybrid ranking puts the right section first once more often for everyday questions, but it loses two reworded questions from the top 3. Keyword matching rewards documents that share surface words, such as "ส่วนลด" in an expense policy, over the section that answers. Weighting keyword at 0.3 to 0.7 and RRF k at 10 to 60 did not recover them: the best variant reached 14 of 15 reworded in the top 3. The model reads 4 passages, so top-3 recall matters more than first place. Each result is one deterministic run on a shared laptop. Times vary with load.

A score threshold cannot say "not in the documents". The best unanswerable question scores higher than 19 of the 45 answerable ones by vector similarity, and higher than 17 by keyword. The tool therefore always returns the 4 closest passages, and the model judges whether they answer.

Not adopted:

- **Mastra rerankers** (`rerankWithScorer`). They need a model call per question (an LLM judge), or Cohere or Voyage, which would send the documents off the machine.
- **`@mastra/rag`** (`MDocument.chunk`). Its Markdown strategy sizes chunks by tokens, which suits Thai text poorly, and the section chunker is about 110 lines with no new dependency.
- **A local cross-encoder reranker.** It was not tried. Vector top-3 recall is already 44 of 45.

## Answers and the card

The persona sends questions about rules, procedures and limits in company documents to `search_documents`. The model answers in a sentence or two, names the document and the section, and copies numbers from the passage. If no passage answers, it says the topic is not in the documents the person can read and suggests the owning department. The person's own numbers, such as leave days left and the leave form, still come from `get_policy`. A question that needs both calls both tools. The policy card shows the balance and the form, and the documents card shows the rule.

The passages draw as a fixed card (`DocumentsCard`, `components/cards/entity/documents.tsx`). The card shows the passages best first. The first passage is open and the rest are collapsed. Each passage shows its section, document title, version and effective date, and the owner sits under the text. `search_documents` is in `UNCOMPOSABLE_TOOLS`, so its results stay out of the A2UI data model and its card is drawn beside any composed card, the way metric cards are. The model does not draw the sources, so a card cannot cite a passage that was not retrieved.

Four eval cases grade this from recordings (group `documents`). `citedDocument` checks that the expected document came back and that the reply names its title or section. `saidNotFound` checks that the reply says not found and that no passage from a hidden document came back.

| Case | Asker | Question | Result |
|---|---|---|---|
| `docs-credit-terms` | sales rep | เอเย่นต์เกรด B ได้เครดิตกี่วัน | 30 วัน, sales policy section 1.2 cited |
| `docs-ban-holiday` | RSM | วันออกพรรษาปีนี้ร้านค้าขายเบียร์ได้ไหม | no sale on 26 ต.ค. 2569, compliance guide section 2.2 cited |
| `docs-hr-hidden` | sales rep | กระบอกเงินเดือนพนักงานแต่ละระดับเท่าไหร่ | not found, no HR passage, ask HR |
| `docs-unanswerable` | supply planner | บริษัทอนุญาตให้พาสัตว์เลี้ยงมาที่ทำงานไหม | not found, ask HR |

## Admin

IT admins see the documents on `/admin?tab=documents`. The tab shows each document's title, id, version, effective date and owner, the roles that may read it, how many of its sections are in the index as they are now, the state (searchable, needs re-indexing, not indexed), and when it was last indexed. It also lists files that failed the header check and documents still in the index whose file is gone. **สร้างดัชนีใหม่** runs the same sync as `bun run docs:index`.

## How to add or change a document

1. Write `data/documents/<id>.md` with the header above. Use `##` for sections and `###` for subsections. Name roles, not people. Leave out personal data.
2. Set `audience` to the roles that may read it. Use `all` only for a document every employee may see.
3. When a rule changes, raise `version` and set `effective`, then edit the text.
4. Run `bun run docs:index`, or press **สร้างดัชนีใหม่** on the admin tab. A running server also picks the change up on its first search after a restart.
5. Add a question for the new content to `evals/documents-bench.json` and run `bun run docs:bench`.
