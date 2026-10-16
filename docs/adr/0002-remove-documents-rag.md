# 0002. Remove the built-in company-documents search

Accepted, 2026-10-15.

## Context

Plan item F7 added `search_documents`: eight fictional policy documents in the repository, chunked, embedded with the local e5 model into a LibSQL vector index, and searched with a role filter. A separate document RAG system will serve the company's real documents. It will connect to Winyu from outside, most likely as an MCP connector added from the admin console.

## Decision

Delete the feature: the tool, the corpus, the index, the admin tab, the `DocumentsCard`, its eval cases, and its prompt rule. Do not keep a stub or a flag.

## Consequences

- Questions about rules in company documents have no tool until the external RAG connects. The prompt's rule for a question no tool answers applies: the agent says the system has no such data.
- `get_policy` still answers leave balances and benefits.
- The local e5 embedder stays, because memory recall uses it.
- The prompt and the tool surface changed, so every eval recording is stale. They still score, but they hold the old model's answers. Re-record them when the external RAG lands, not before.
- The GitLab repository starts without history. The removed code is in the earlier repository, `github.com/GA-MO/cop`, branch `winyu-mastra`, at commit `bbad5fb` and before.
