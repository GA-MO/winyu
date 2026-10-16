# Decision records

One file per structural decision: its context, the decision, and what follows from it. A record is not edited once accepted. A later decision that changes it gets a new record that names the one it replaces.

| # | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-one-pod-with-emptydir.md) | The demo runs as one pod whose data resets on every start | Accepted | 2026-10-15 |
| [0002](0002-remove-documents-rag.md) | Remove the built-in company-documents search | Accepted | 2026-10-15 |
| [0003](0003-lazy-load-the-agent-engine.md) | Load the agent engine only on the paths that run it | Accepted | 2026-10-15 |
| [0004](0004-gated-gitlab-pipeline.md) | The GitLab pipeline stays off until infra turns it on | Accepted | 2026-10-16 |

Earlier decisions, made while the app was rebuilt on Mastra, are in the Decisions section of `docs/plan.md`.
