# 0005. Server-only packages stay out of the Turbopack bundle

Accepted, 2026-10-16.

## Context

After 0003, `docker build` still failed in a 4 GB Docker VM: it passed once, then was killed three times with the same code. We cleaned `node_modules` and `.next`, reinstalled, and measured `next build` on Linux in that VM. The measure was the cgroup's anonymous memory, sampled every 0.5 seconds (`memory.stat` `anon`), which counts what the kernel cannot drop under pressure.

The main `next build` process held almost all of it. By default Next bundles every package a server route imports. Mastra, the CopilotKit runtime, the AI SDK, the Teams and LINE SDKs, and OpenTelemetry were compiled into the server chunks, together with what they pull in: `zod`, `graphql`, `hono`, and `@ai-sdk/google-vertex`. The same chunk content appeared in several entries. Turbopack holds that whole module graph in memory.

Since Next 16.3, `turbopackFileSystemCacheForBuild` is on by default. A container build writes the cache to `.next/cache`, never reads it, and spends memory while it writes, at the same time as the TypeScript check. The runtime stage then copied the cache into the image.

TypeScript itself takes about 1.6 GB, because the app imports packages with about one million lines of type definitions. A build-only tsconfig without tests and scripts saved 9%, so we did not add one.

## Decision

- List the server-only packages the app imports in `serverExternalPackages` (`SERVER_ONLY_PACKAGES` in `next.config.ts`). Node loads them from `node_modules` at run time. The runtime image already ships the full `node_modules`.
- Keep `zod` and `ai` in that list too, so our code and Mastra use one copy of each.
- Set `turbopackFileSystemCacheForBuild: false`, as the Next docs advise for builds that never keep `.next/cache`.

## Consequences

Measured on Linux in the 4 GB Docker VM, one run each:

| `next build` | Peak anonymous memory | Result |
|---|---|---|
| Before | over 3.1 GB, then swapping | Killed after 300 s, still compiling |
| Packages external, cache on | 2.85 GB | Passes, 86 s |
| Packages external, cache off | 2.28 GB | Passes, 75 s |

- The real `docker build` passes in 4 GB. The image is 3.73 GB instead of 4.81 GB, and `.next` in it is 78 MB with no `cache` directory.
- A new server-only dependency that a route imports belongs in `SERVER_ONLY_PACKAGES`. Otherwise Turbopack bundles it and its dependencies again.
- The list changes only the server bundle. Client components that import a listed package, such as `zod` in `components/cards/entity/people.tsx`, still bundle it for the browser.
- `next dev` loads the same packages from `node_modules` too. Pages, the CopilotKit runtime info, and the agent in a chat run were checked in dev and in the image.
