# Agent networks and subagents (F8)

Decision: **rejected**. Winyu keeps one chat agent per person. Routing each question to a smaller specialist agent cut input tokens per call by about a third, but it added a model call to every question. The net result was 8% cheaper, about 2 seconds slower per question, and no more accurate. It also added a new kind of failure.

Measured on 2026-10-05 with Gemini 3.8 Flash through OpenRouter. The live spend was $0.3118 across 75 model calls, from the worktree ledger. The prototype is kept as tag `f8-network-prototype` (8ba0c29) and is not on the branch.

## The question

Winyu's chat agent offers each person 22 to 24 tools and one prompt. Each call to the model sends about 10,000 input tokens. The tool schemas are 70% of the instruction text: 23,100 of 33,000 characters for the CEO. The persona and rules are the other 30%. The hypothesis was that specialists with fewer tools and shorter prompts would choose tools better and send fewer tokens, and that delegation would add calls and latency.

## Which shape was built, and why

Mastra offers three multi-agent shapes. Two of them could not keep Winyu's contracts.

- **`Agent.network()`** is deprecated in `@mastra/core` 1.74. Mastra's docs point to supervisor agents instead.
- **A supervisor with subagents** (`agents: {…}` on a parent agent) runs each subagent as a tool call. The subagent's chunks reach the parent stream as `tool-output` chunks, and `@ag-ui/mastra` 1.1.6 drops those chunks. The chat would see one `agent-…` call and no `query_metric` result, so no fixed card and no composed card would be drawn. The supervisor also has a floor of four sequential model calls (delegate, specialist tool call, specialist answer, supervisor answer), and it writes the answer twice. Two of those calls are the floor of today's single agent. This floor is inferred from the shape and was not measured live.
- **A router with a handoff** was built. One small router call reads the question and names a specialist. That specialist then runs the whole turn through the same bridge, gateway, approvals ledger, card stream and Mastra memory thread. This is the cheapest delegation shape, because it adds exactly one call. If a router could not pay for itself, a supervisor could not either.

The prototype had three specialists. Each one took the common rules and tools plus its own:

| Specialist | Own tools | Own rules |
|---|---|---|
| metrics | `query_metric`, `list_metrics`, `get_alerts`, `get_forecast`, `explain_gap`, `watch_metric`, `pin_widget` | metric choice, sort and where, dims, alerts and forecast, names as filters, watches, pin |
| people | `find_people`, `get_person`, `get_site`, `list_candidates`, `list_courses`, `get_policy`, `request_leave`, `enroll_course`, `get_calendar`, `ask_logistics_partner`, connector tools | the composed card block (A2UI), tool choice by topic, write tools |
| admin | `set_permission`, `run_job`, `list_metrics` | none |

The common tools were `resolve_owner`, `create_handoff`, `send_email`, `recall_memory` and `describe_entity`. The router's reply `general`, or a failed router call, ran the whole agent. An approval answer went back to the specialist that owns the asked tool, with no router call. The pick was written to the run trace as an `agent.routed` event. A test in the tag (`network.test.ts`, scripted model, $0) proved four things: the specialists together keep every rule and every tool; a metric question draws its card from the gateway result and reads back from the thread; an approval resumes on the same specialist and writes once; an unknown reply falls back to the whole agent.

## Method

15 eval cases were run, one live run per variant per case: 9 metric (alerts, forecast, shape, compare), 4 people/composed, 2 admin approvals and 1 watch approval. The variants ran interleaved in one process (A then B, then B then A), on the same day and the same data. Each run went through `recordCase`, the same path as `bun run eval --live`, and was scored with the same code scorers and known failures. Results were written to the worktree's `.shots/f8-results/`, so main's `evals/recordings` were not touched. Latency is wall time per case. Cost is what OpenRouter billed. To reproduce, check out the tag and run `bun scripts/agents-compare.ts --cases=… --cap=… --yes`, then `bun scripts/agents-compare-table.ts`.

## Results

Each cell gives single agent → network. The router's call is counted in the network column.

| case | specialist | pass | calls | input tokens | cost | seconds | network tools |
|---|---|---|---|---|---|---|---|
| admin-metric | admin | ok → ok | 1 → 2 | 10232 → 3318 | $0.0051 → $0.0020 | 4.6 → 5.2 | set_permission |
| admin-tool | admin | ok → **fail** (rightPermission) | 1 → 5 | 10240 → 18935 | $0.0046 → $0.0113 | 3.5 → 24.5 | recall_memory, list_metrics ×2, set_permission |
| candidates-khonkaen | people | ok → ok | 2 → 3 | 21538 → 13487 | $0.0145 → $0.0183 | 13.9 → 27.4 | list_candidates |
| ceo-alerts | metrics | ok → ok | 2 → 3 | 24326 → 17390 | $0.0119 → $0.0104 | 9.3 → 12.2 | get_alerts |
| ceo-attainment | metrics | ok → ok | 2 → 5 | 22208 → 31383 | $0.0132 → $0.0155 | 13.7 → 17.3 | list_metrics ×2, query_metric |
| ceo-channel | metrics | **fail** (sortedRight) → ok | 2 → 3 | 22317 → 15486 | $0.0109 → $0.0087 | 11.0 → 10.3 | query_metric |
| cfo-ar | metrics | ok → ok | 2 → 3 | 21301 → 15224 | $0.0085 → $0.0088 | 6.4 → 10.2 | query_metric |
| compare-month-to-date | metrics | ok → ok | 2 → 3 | 21940 → 15317 | $0.0136 → $0.0081 | 15.4 → 13.9 | query_metric |
| compare-stock-weekly | metrics | ok → ok | 2 → 3 | 21644 → 15724 | $0.0100 → $0.0086 | 7.9 → 9.8 | query_metric |
| people-certs | people | ok → ok | 2 → 3 | 20885 → 12721 | $0.0129 → $0.0108 | 13.0 → 18.0 | find_people |
| people-profile | people | ok → ok | 2 → 3 | 19911 → 11830 | $0.0119 → $0.0082 | 11.7 → 11.2 | get_person |
| planner-forecast | metrics | ok → ok | 2 → 3 | 21365 → 14749 | $0.0100 → $0.0071 | 8.0 → 10.1 | get_forecast |
| planner-watch | metrics | ok → ok | 1 → 3 | 10017 → 14061 | $0.0061 → $0.0072 | 6.2 → 9.9 | describe_entity, watch_metric |
| shape-stacked | metrics | ok → ok | 2 → 3 | 23330 → 16330 | $0.0112 → $0.0088 | 9.8 → 9.8 | query_metric |
| sites-overview | people | ok → ok | 2 → 3 | 21332 → 13297 | $0.0181 → $0.0155 | 21.3 → 22.7 | get_site |
| **total** | | **14/15 → 14/15** | **27 → 48** | **292,586 → 229,252** | **$0.1625 → $0.1493** | **median 9.8 → 11.2, mean 10.4 → 14.2** | |

The paired latency difference (network minus single) had a median of +2.2 s and a range of −1.5 to +21.0 s. The network was slower in 11 of 15 cases.

## Reading the numbers

- **Per call, the hypothesis held.** A metrics specialist call sent about 7,500 input tokens, a people call about 6,300 and an admin call about 3,100. The single agent's call sent about 10,800. The router call itself was small: 183 input tokens, 56 output tokens and $0.00017.
- **Per question, the extra call ate most of the saving.** A question that took 2 calls now took 3, so total input fell only 22%. Output rose 19%, from 29.6k to 35.2k tokens. Most of that rise came from the extra steps and from one long composed card (candidates-khonkaen). Cost fell 8% in total, which is $0.0009 per question. That is smaller than the spread between two runs of the same case: ceo-attainment cost $0.0119 in its committed recording and $0.0132 today.
- **The limiter on latency is sequential model round trips.** Calls went from 27 to 48, and each call waits for the one before it. Cases that went from 2 to 3 calls ran between 1.5 s faster and 5.0 s slower, with candidates-khonkaen the one exception. The two large outliers took extra steps (admin-tool, +21 s) or wrote twice as much output (candidates-khonkaen, +13.5 s).
- **Specialists did not choose tools better.** Each variant failed one case. The single agent's ceo-channel failure was a wrong sort. The committed recording of that case passes, so the failure looks like noise. The network's admin-tool failure has a structural cause. The admin specialist could not see the LMS connector's tools, so it never learned the name `lms_demo__training_history`. It searched with `recall_memory` and `list_metrics`, then set a permission on `training_history`. A narrower surface hides what the agent needs to know about the rest of the system. The metrics specialist also took extra steps that the single agent did not take: `list_metrics` twice in ceo-attainment and `describe_entity` in planner-watch. With one run per case, these differences in tool choice cannot be told apart from noise. Neither variant is shown to be more accurate.
- **Caching barely works today.** Only 16,166 of the 521,838 input tokens (3.1%) were billed as cached. A working prompt cache would discount the stable 10,000-token prefix of every call. That would save more than routing did, and it would add no calls and no latency. This is the lever to look at next, not routing.

## What would change the decision

- A domain whose tools are much larger than today's. For example, a connector catalog with dozens of tools that only a few questions need. Routing pays only when a specialist drops most of the surface. Here the metrics specialist still carried 65% of the tool text.
- A router that costs no model call, such as a deterministic choice from the page the question came from. That removes the latency cost but keeps the hidden-surface failure.
- A future `@ag-ui/mastra` that forwards subagent `tool-output` chunks as tool calls. That would make a Mastra supervisor possible without rewriting the card stream, but the supervisor's four-call floor would remain.
