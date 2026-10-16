# 0001. The demo runs as one pod whose data resets on every start

Accepted, 2026-10-15.

## Context

Winyu keeps all of its state as files under `WINYU_DATA_DIR`: JSON collections and one LibSQL file, `mastra.db`. The app assumes that it is the only writer. There is no database server.

The team's other services (`sol-backoffice-ui`, `sol-storefront-api`) are stateless Deployments on GKE, deployed by GitLab CI with `kubectl apply` and `kubectl rollout restart`. The demo is public, uses fictional data, and should start each day from the same known state.

We considered three options:

| Option | Keeps chats across restarts | Fits the team's pipeline | Reset |
|---|---|---|---|
| PersistentVolumeClaim, `strategy: Recreate` | Yes | Needs a volume and a non-default strategy | A Job with rights to empty the volume |
| `emptyDir`, seed on start | No | Yes, an ordinary Deployment | Any restart |
| An external database | Yes | Needs a new service | A database job |

## Decision

Run one replica. Mount `/data` as an `emptyDir`. The image carries a snapshot in `/app/seed-data`, and the entrypoint copies it into `/data` when `/data` is empty. A new pod therefore always starts from the snapshot.

## Consequences

- A deploy, a `rollout restart`, a crash, or a node upgrade resets the demo data. The nightly reset is a CronJob that runs `kubectl rollout restart`.
- Visitors lose their chats when the pod restarts. For a demo with fictional data this is acceptable.
- `replicas` must stay at 1. Two pods would hold two different sets of chats.
- The snapshot is committed under `deploy/seed-data/`, because CI builds the image from the repository.
- Keeping chats across restarts later means moving to a PersistentVolumeClaim with `strategy: Recreate`.
