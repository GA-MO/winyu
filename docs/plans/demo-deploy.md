# Public demo deploy

The Winyu demo runs as one pod on the team's GKE cluster, deployed by GitLab CI from `gitlab.com/sbpds-ai/winyu`. Anyone with the link can open it and sign in through the persona picker (`WINYU_AUTH=demo`). Each pod starts from a snapshot of the dev data. The demo connects to no company system. Its only outbound call at run time goes to OpenRouter.

`docs/deploy.md` is the reference for what runs and how it connects. `docs/handoff-infra.md` is the handoff to the infra team. The structural decisions are in `docs/adr/0001` to `0004`.

## Decisions

| Decision | Why | Record |
|---|---|---|
| One pod, `replicas: 1`, `/data` on an `emptyDir` seeded from the image | State is files. A new pod starts from known data, so any restart resets the demo | `docs/adr/0001-one-pod-with-emptydir.md` |
| Remove the built-in documents search | An external document RAG connects later as an MCP connector | `docs/adr/0002-remove-documents-rag.md` |
| Load the agent engine only where it runs | `next build` ran out of memory because 43 of 54 routes bundled Mastra | `docs/adr/0003-lazy-load-the-agent-engine.md` |
| Real pipeline behind `WINYU_DEPLOY_ENABLED` | The runner, variables, and secrets for the project do not exist yet | `docs/adr/0004-gated-gitlab-pipeline.md` |
| Public persona picker, no password | The demo is for visitors. The data is fictional | This plan, Risks |
| Start from the current dev data | User decision, 2026-10-15 | This plan, Phase 1 |

## Phases

Each phase ends in a check that someone can rerun. Do not start a phase before the previous one passes.

### Phase 0. Build and run the image locally (done, 2026-10-15)

- [x] Remove the documents feature and the dead code. Check: `bun run typecheck`, `bun run test` (987 pass), `bun run eval` (62 of 63 clean, the one known failure).
- [x] Cut the agent engine out of the session path. Check: 5 of 54 server entries bundle Mastra (was 43), `.next/server` is 92 MB (was 534 MB), and `lib/server/light-requests.test.ts` fails when a static import comes back.
- [x] Write `Dockerfile`, `.dockerignore`, `deploy/entrypoint.sh`, `scripts/deploy-snapshot.ts`, `scripts/warm-embedder.ts`, `deploy/compose.yaml`, and the `demo-*` Makefile targets. Check: `docker build` passed in 4 GB on 2026-10-15. It was killed three times on 2026-10-16 with the same code, so a 4 GB build is not reliable.
- [x] Run the image with an empty `/data`. Check: the container is healthy and logs that it seeded `/data`. In a browser, the sales rep sees only their region, the CEO sees six regions, and IT admin opens the admin console with no console errors. A restart keeps the threads on a Docker volume. Six model calls cost $0.017.

### Phase 1. Prepare the repository for GitLab (done, 2026-10-16)

- [x] Take the snapshot with `make demo-snapshot`. It drops `secrets.json`, the console connectors, and the MCP tokens from the copy. Check: `sqlite3 deploy/seed-data/mastra.db 'pragma integrity_check'` prints `ok`.
- [x] Write `.gitlab-ci.yml`, `k8s-deploy.yml`, `deploy/k8s-config.example.yml`, and `deploy/k8s-nightly-reset.yml` on the pattern of `sol-backoffice-ui` and `sol-storefront-api`. Check: kubeconform reports 8 valid resources for Kubernetes 1.31.
- [x] Gate the pipeline on `WINYU_DEPLOY_ENABLED`. Check: the parsed `workflow.rules` require the variable and the `uat` branch.
- [x] Write `README.md`, `CONTRIBUTING.md`, `.env.example`, `docs/deploy.md`, `docs/handoff-infra.md`, and `docs/adr/`.
- [x] Scan the files to be pushed for secrets. Check: no OpenRouter, Anthropic, AWS, Google, GitLab, GitHub, or Slack key pattern, and no private key, in 902 files.
- [x] Push the current tree to `gitlab.com/sbpds-ai/winyu` as one commit on `main`, without history (`35a1242`, 2026-10-16). Check: `git ls-remote gitlab` shows `refs/heads/main` at `35a1242`. That GitLab created no pipeline follows from the `workflow` rule; nobody has looked at the project's pipeline list yet.

### Phase 2. Infra wires the project (infra)

The steps are in `docs/handoff-infra.md`, First deploy.

- [ ] Infra answers the twelve questions in `docs/handoff-infra.md`, and we change the files where an answer differs from our assumption.
- [ ] Infra makes a runner with about 6 GB for Kaniko available to `sbpds-ai/winyu`. Check: a Kaniko build of `main` finishes.
- [ ] Infra sets `UAT_SERVICE_ACCOUNT64` and creates `winyu-config` and `winyu-secret` in the namespace.
- [ ] Infra sets `WINYU_DEPLOY_ENABLED=true`, and we merge `main` into `uat`. Check: the pipeline ends with `rollout status` reporting success, and the pod log shows that it seeded `/data`.
- [ ] Infra points an ingress with TLS at the Service `winyu`. Check: the persona picker loads over HTTPS.

### Phase 3. Verify the public demo

- [ ] Walk the CEO, a sales rep, and IT admin on the public URL, with one question each. Check: the same results as in Phase 0. About three model calls, about $0.02.
- [ ] Measure the pod's memory after the first chat, when the embedder has loaded. Check: it stays under the `2Gi` limit. Adjust the requests if it does not.
- [ ] Apply `deploy/k8s-nightly-reset.yml`, if infra agrees. Check: after 03:00 Bangkok time, a test thread is gone.

### Follow-up

- [ ] Add a merge-request check job that runs `bun run typecheck`, `bun run test`, and `bun run eval`. It needs a runner with Bun.
- [ ] Add a notice on the login page that the data is fictional and shared between visitors who pick the same persona (string in `lib/i18n/th.ts`).
- [ ] Decide whether the demo needs a per-visitor chat limit. Today the OpenRouter credit limit is the only cap.
- [ ] Add a `/healthz` route, if infra prefers it to probing `/login`.
- [x] Listen on port `8080` in the container and the Service, like the `sol-*` services (2026-10-16). Check: the image answers `/login` with 200 on `8080`, and its HEALTHCHECK command exits 0.
- [ ] Re-record the eval cases when the external document RAG connects. Every recording is stale since the prompt changed on 2026-10-15.

## Risks

| Risk | Mitigation |
|---|---|
| Visitors spend our OpenRouter credit. The app has no per-visitor limit | A demo-only key with a credit limit. One question costs about $0.006 |
| Visitors who pick the same persona see each other's chats, memory, and dashboard (threads are keyed by persona, `lib/server/threads-read.ts`) | Fictional data, the reset on every restart, and the follow-up notice on the login page |
| The IT admin persona can change permissions, switches, and connectors | `WINYU_CONNECTOR_HOSTS` is empty, so no connector can reach any host. Any restart resets the changes |
| Over plain HTTP the `Secure` session cookie is dropped and sign-in fails without an error | The ingress serves HTTPS only |
| Kaniko runs out of memory on the CI runner | Phase 2 asks for about 6 GB. The estimate is unmeasured, because only 4 GB was available locally |
| A second replica splits the state | `replicas: 1` in `k8s-deploy.yml`, and the warning in `docs/handoff-infra.md` |

## Rollback

The `uat` tag is overwritten on every build, so `kubectl rollout undo` brings back the same image. To roll back, revert the change on `main`, merge into `uat`, and let the pipeline deploy. For an immediate rollback, point the Deployment at the previous image digest in Artifact Registry. To take the demo down, scale the Deployment to 0.
