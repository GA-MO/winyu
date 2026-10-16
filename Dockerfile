FROM oven/bun:1.4-debian AS bun

FROM node:22-bookworm AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN node node_modules/next/dist/bin/next build

FROM node:22-bookworm-slim
ENV NODE_ENV=production WINYU_DATA_DIR=/data PORT=8080 COPILOTKIT_TELEMETRY_DISABLED=true NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node deploy/seed-data ./seed-data
COPY --chown=node:node deploy/entrypoint.sh ./entrypoint.sh
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8080/login').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
ENTRYPOINT ["./entrypoint.sh"]
