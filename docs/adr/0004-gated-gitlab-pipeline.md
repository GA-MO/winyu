# 0004. The GitLab pipeline stays off until infra turns it on

Accepted, 2026-10-16.

## Context

The repository moves to `gitlab.com/sbpds-ai/winyu`. `.gitlab-ci.yml` follows the team's deploy pipeline: Kaniko on the `gcloud-sol-dev` runner, Artifact Registry in `singhaonline-dev`, and `kubectl` against `singhaonline-dev-cluster`. Several things it needs do not exist yet for this project: the runner may not be available to the `sbpds-ai` group, the CI variable `UAT_SERVICE_ACCOUNT64` is not set, and the ConfigMap and Secret are not created. A pipeline that ran now would fail.

We considered two options. A mock pipeline that only prints would pass, but it would not prove anything and would be replaced anyway. A real pipeline behind a switch keeps the reviewed deploy steps in the repository and runs nothing until the switch is on.

## Decision

Keep the real pipeline. Add a `workflow` rule: GitLab creates a pipeline only when the CI variable `WINYU_DEPLOY_ENABLED` is `"true"` and the branch is `uat`. Without the variable, a push creates no pipeline at all.

## Consequences

- Pushing any branch, `uat` included, is safe today.
- Infra turns deployment on by setting `WINYU_DEPLOY_ENABLED=true` on the project, after the steps in `docs/handoff-infra.md`.
- There is no CI check on merge requests yet. Adding a job that runs `bun run typecheck`, `bun run test`, and `bun run eval` needs a runner with Bun, and is listed as follow-up work in `docs/plans/demo-deploy.md`.
