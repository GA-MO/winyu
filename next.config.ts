import type { NextConfig } from "next";

const IS_PRODUCTION_BUILD = process.env.NODE_ENV === "production";

const SERVER_ONLY_PACKAGES = [
  "@ag-ui/core",
  "@ag-ui/mastra",
  "@ai-sdk/mcp",
  "@chat-adapter/state-memory",
  "@chat-adapter/teams",
  "@copilotkit/runtime",
  "@line/bot-sdk",
  "@marcbachmann/cel-js",
  "@mastra/core",
  "@mastra/libsql",
  "@mastra/mcp",
  "@mastra/memory",
  "@mastra/observability",
  "@mastra/otel-exporter",
  "@mastra/server",
  "@modelcontextprotocol/server",
  "@openrouter/ai-sdk-provider",
  "@opentelemetry/exporter-trace-otlp-http",
  "ai",
  "chat",
  "openid-client",
  "zod",
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: SERVER_ONLY_PACKAGES,
  experimental: { serverSourceMaps: !IS_PRODUCTION_BUILD, turbopackFileSystemCacheForBuild: false },
};

export default nextConfig;
