# Winyu

Winyu is an AI copilot for a large Thai beverage company. Every user, from the CEO to a sales rep, signs in as one of 26 personas with their own data scope. The agent answers with cards drawn from tool results, keeps a personal dashboard, raises anomalies and forecasts, and hands work to the responsible person. The demo tenant is Boon Rawd Brewery. All data is fictional and generated.

The agent runs on [Mastra](https://mastra.ai). The chat UI runs on CopilotKit over AG-UI. The app is one Next.js 16 server.

## Quick start

You need [Bun](https://bun.sh) 1.4 and Node 22.

```bash
bun install
cp .env.example .env.local      # then set OPENROUTER_API_KEY
bun run seed                    # writes .data/*.json from the generator
WINYU_SCHEDULER=off bun run dev # http://localhost:3100
```

Open `http://localhost:3100/login` and pick a role and a person. No password is needed in development.

`WINYU_SCHEDULER=off` stops the background jobs (anomaly, forecast, watches, digest), which call the model. Leave it unset when you want them.

## Commands

| Command | Does |
|---|---|
| `bun run dev` | Starts the dev server on port 3100 |
| `bun run typecheck` | Type-checks the project. Must pass before a change is done |
| `bun run test` | Runs `bun test`. Never calls a model |
| `bun run eval` | Scores the recorded chat cases with code-only scorers. Costs $0 |
| `bun run seed` | Regenerates `.data` from the deterministic generator |
| `bun run studio` | Mastra Studio on `http://localhost:3213` (development only) |
| `bun run trace [runId]` | Prints one agent run's trace |
| `bun run call-tool <userId> <tool> [json]` | Runs one tool through the gateway as that user, without the model |
| `make up` | Starts the demo MCP connector on :3290 and the dev server |
| `make demo-build`, `make demo-start` | Builds and runs the demo Docker image (see `docs/deploy.md`) |

`CLAUDE.md` lists every command, including the probes and the eval flags.

## Repository layout

| Path | Holds |
|---|---|
| `app/` | Next.js routes: the app pages under `(app)`, the API under `api`, development pages under `dev` |
| `components/` | React components, grouped by surface (`chat`, `cards`, `dashboard`, `admin`, and others) |
| `lib/access/` | Permissions: which tools and metrics each role may use, enforced in code |
| `lib/harness/` | The tool gateway, audit, traces, and the Mastra adapter (`lib/harness/adapters/mastra/`, the only place that imports `@mastra/*`) |
| `lib/server/` | Server-only domain code: tools, connectors, auth, channels, stores |
| `lib/data/`, `lib/semantic/`, `lib/engine/` | The data generator, the semantic layer, and the analytics (anomalies, forecasts) |
| `lib/eval/`, `evals/` | Eval cases, checks, and the recordings they score |
| `lib/i18n/th.ts` | Every UI string (Thai) |
| `scripts/` | Command-line tools behind the `bun run` scripts |
| `deploy/`, `Dockerfile`, `k8s-deploy.yml`, `.gitlab-ci.yml` | The demo deployment |
| `film/` | The booth films (`film/isometric.html`, `film/hybrid.html`) and their render pipeline (`film/README.md`) |
| `docs/` | Plans, guides, and decision records |

## Documentation

| Document | Read it when |
|---|---|
| `CLAUDE.md` | You change code. It holds the code rules and every command |
| `CONTRIBUTING.md` | You open a merge request |
| `docs/plan.md` | You start any task. It holds the phases and the acceptance criteria |
| `docs/deploy.md` | You build, deploy, or operate the demo |
| `docs/handoff-infra.md` | You are on the infra team and take over the deployment (Thai) |
| `docs/plans/demo-deploy.md` | You want the deploy plan and its status |
| `docs/adr/` | You want to know why a structural decision was made |
| `docs/harness-mastra.md` | You touch the agent runtime, durable runs, or jobs |
| `docs/memory.md` | You touch memory or recall |
| `docs/mcp.md`, `docs/a2a.md` | You touch the MCP server, MCP connectors, or A2A |
| `docs/sso.md`, `docs/channels.md` | You set up Microsoft Entra, LINE, or Teams |

## Status

The demo deploys as one pod on the team's GKE cluster. The GitLab pipeline stays off until infra sets `WINYU_DEPLOY_ENABLED` (see `docs/plans/demo-deploy.md`). The company-documents search was removed on 2026-10-15. An external document RAG will join later as an MCP connector.
